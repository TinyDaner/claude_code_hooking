const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PS_TITLE_SCRIPT = `
$termNames = @('WindowsTerminal','wt','ConEmu','ConEmu64','mintty','alacritty','wezterm-gui','hyper','Tabby','Terminus')
$titles = @()
foreach ($name in $termNames) {
  $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.MainWindowHandle -ne 0) { $titles += $p.MainWindowTitle }
  }
}
$titles -join "\`n"
`.trim();

const PS_PROCESS_SCRIPT = `
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='bash.exe'"
$cmdLines = @()
foreach ($p in $procs) {
  if ($p.CommandLine) { $cmdLines += $p.CommandLine }
}
$cmdLines -join "\`n"
`.trim();

/**
 * Run a PowerShell script and return stdout lines.
 */
function runPsScript(script) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `terminal-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
    } catch {
      resolve([]);
      return;
    }

    execFile('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile
    ], { timeout: 10000, encoding: 'utf-8' }, (err, stdout) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (err) {
        console.error('[terminal-checker] PowerShell error:', err.message);
        resolve([]);
        return;
      }
      const lines = stdout.trim().split('\n').map(t => t.trim()).filter(Boolean);
      resolve(lines);
    });
  });
}

/**
 * Get all terminal window titles via PowerShell.
 */
function getTerminalTitles() {
  return runPsScript(PS_TITLE_SCRIPT);
}

/**
 * Get all Claude Code process command lines (node + children).
 */
function getClaudeProcessCmdLines() {
  return runPsScript(PS_PROCESS_SCRIPT);
}

/**
 * Given a list of sessions (serialized), find those whose cwd folder name
 * does not appear in any terminal window title AND whose cwd path does not
 * appear in any Claude Code process command line.
 * Returns an array of orphan session IDs.
 */
async function findOrphanSessions(sessions) {
  if (sessions.length === 0) return [];

  // Run both checks in parallel
  const [titles, cmdLines] = await Promise.all([
    getTerminalTitles(),
    getClaudeProcessCmdLines(),
  ]);

  // If process check returned nothing, conservatively assume all sessions are alive.
  // Title check alone is unreliable (window titles may not contain folder names).
  if (cmdLines.length === 0) return [];

  // Join all command lines for substring matching
  const cmdLineBlob = cmdLines.join('\n').toLowerCase();

  const orphans = [];
  for (const session of sessions) {
    const cwd = session.cwd || '';
    if (!cwd) continue;

    // Check 1: window title matches cwd folder name
    const folderName = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || '';
    const titleMatch = folderName && titles.length > 0 && titles.some(title => title.includes(folderName));

    // Check 2: process command line contains cwd path (forward or back slash)
    const cwdForward = cwd.replace(/\\/g, '/').toLowerCase();
    const cwdBack = cwd.replace(/\//g, '\\').toLowerCase();
    const processMatch = cmdLines.length > 0 && (cmdLineBlob.includes(cwdForward) || cmdLineBlob.includes(cwdBack));

    // OR logic: either match means session is alive
    if (!titleMatch && !processMatch) {
      orphans.push(session.id);
    }
  }
  return orphans;
}

module.exports = { findOrphanSessions, getTerminalTitles };
