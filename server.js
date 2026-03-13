const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { SessionStore } = require('./lib/session-store');
const { createHookRouter } = require('./lib/hook-router');
const { generateFullSettings } = require('./lib/config-generator');
const terminalChecker = require('./lib/terminal-checker');

const PORT = process.env.PORT || 3456;
const app = express();
const server = http.createServer(app);
const store = new SessionStore();

// WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  // Send current state on connect
  ws.send(JSON.stringify({
    type: 'init',
    sessions: store.getAll(),
    stats: store.getStats(),
    events: store.getGlobalEvents().slice(-50),
  }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

// --- Auto-cleanup: remove sessions 30s after terminal window closes ---
const pendingRemovals = new Map(); // sessionId → setTimeout handle

function scheduleRemoval(sessionId) {
  if (pendingRemovals.has(sessionId)) return;
  console.log(`[auto-cleanup] 终端窗口已关闭，${sessionId} 将在30秒后清除`);
  const timer = setTimeout(() => {
    pendingRemovals.delete(sessionId);
    store.remove(sessionId);
    broadcast({ type: 'session_removed', sessionId, stats: store.getStats() });
    console.log(`[auto-cleanup] 已清除会话 ${sessionId}`);
  }, 30 * 1000);
  pendingRemovals.set(sessionId, timer);
}

function cancelRemoval(sessionId) {
  const timer = pendingRemovals.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    pendingRemovals.delete(sessionId);
    console.log(`[auto-cleanup] 取消清除 ${sessionId}（收到新事件）`);
  }
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Hook endpoint — debug log for UserPromptSubmit
app.post('/hooks/event', (req, res, next) => {
  const evt = req.body.hook_event_name || req.body.type || 'unknown';
  if (evt === 'UserPromptSubmit' || evt === 'user_prompt_submit') {
    console.log('[DEBUG] UserPromptSubmit received:', JSON.stringify(req.body, null, 2));
  }
  next();
}, createHookRouter(store, broadcast, cancelRemoval));

// REST API
app.get('/api/sessions', (req, res) => {
  res.json(store.getAll());
});

app.get('/api/sessions/:id', (req, res) => {
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.get('/api/sessions/:id/events', (req, res) => {
  res.json(store.getEvents(req.params.id));
});

app.delete('/api/sessions/:id', (req, res) => {
  store.remove(req.params.id);
  broadcast({ type: 'session_removed', sessionId: req.params.id, stats: store.getStats() });
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  res.json(generateFullSettings('localhost', PORT));
});

app.get('/api/version', (req, res) => {
  res.json({ version: require('./package.json').version });
});

app.get('/api/stats', (req, res) => {
  res.json(store.getStats());
});

app.get('/api/events', (req, res) => {
  res.json(store.getGlobalEvents());
});

app.post('/api/sessions/:id/focus-terminal', (req, res) => {
  const session = store.get(req.params.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });

  const cwd = session.cwd || '';
  const folderName = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || '';
  const escapedFolder = folderName.replace(/'/g, "''");

  const cwdMatchLine = escapedFolder
    ? `    if ($p.MainWindowTitle -match [regex]::Escape('${escapedFolder}')) { $target = $p; break }`
    : '';

  const psScript = `
Add-Type -TypeDefinition @'
  using System;
  using System.Runtime.InteropServices;
  public class Win32Focus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  }
'@

$termNames = @('WindowsTerminal','wt','ConEmu','ConEmu64','mintty','alacritty','wezterm-gui','hyper','Tabby','Terminus')
$target = $null
$fallback = $null
foreach ($name in $termNames) {
  $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.MainWindowHandle -eq 0) { continue }
${cwdMatchLine}
    if (-not $fallback) { $fallback = $p }
  }
  if ($target) { break }
}
if (-not $target) { $target = $fallback }
if ($target) {
  [Win32Focus]::ShowWindow($target.MainWindowHandle, 9) | Out-Null
  [Win32Focus]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
  Write-Output "focused:$($target.ProcessName):$($target.MainWindowTitle)"
} else {
  Write-Output "not_found"
}
`.trim();

  // Write to temp file to avoid stdin heredoc issues
  const os = require('os');
  const fs = require('fs');
  const tmpFile = path.join(os.tmpdir(), `focus-terminal-${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpFile, psScript, 'utf-8');
    const { execFileSync } = require('child_process');
    const result = execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile
    ], {
      timeout: 8000,
      encoding: 'utf-8',
    }).trim();

    if (result.startsWith('focused')) {
      res.json({ ok: true, detail: result });
    } else {
      res.json({ ok: false, error: '未找到匹配的终端窗口', detail: result });
    }
  } catch (err) {
    console.error('[focus-terminal] Error:', err.message);
    res.json({ ok: false, error: '执行失败', detail: err.stderr?.toString() || err.message });
  } finally {
    try { require('fs').unlinkSync(tmpFile); } catch (_) {}
  }
});

// Every 30s, mark sessions with no events for 2 minutes as idle
setInterval(() => {
  const stale = store.markStale(2 * 60 * 1000);
  if (stale.length > 0) {
    for (const id of stale) {
      broadcast({
        type: 'event',
        sessionId: id,
        event: { type: 'timeout', sessionId: id, summary: '会话超时进入空闲', timestamp: Date.now() },
        session: store.get(id),
        stats: store.getStats(),
      });
    }
  }
}, 30 * 1000);

// Prune ended sessions older than 1 minute every 30s
setInterval(() => store.prune(60 * 1000), 30 * 1000);

// Poll terminal windows every 15s — schedule removal for orphaned sessions
setInterval(async () => {
  const sessions = store.getAll();
  if (sessions.length === 0) return;

  try {
    const orphanIds = await terminalChecker.findOrphanSessions(sessions);
    if (orphanIds.length > 0) console.log(`[auto-cleanup] 发现${orphanIds.length}个孤儿会话:`, orphanIds);
    for (const id of orphanIds) {
      scheduleRemoval(id);
    }
    // If terminal reappears, cancel pending removal
    for (const session of sessions) {
      if (!orphanIds.includes(session.id) && pendingRemovals.has(session.id)) {
        cancelRemoval(session.id);
      }
    }
  } catch (err) {
    console.error('[auto-cleanup] 检测终端窗口失败:', err.message);
  }
}, 15 * 1000);

server.listen(PORT, () => {
  console.log(`\n  Claude Code 监控台已启动: http://localhost:${PORT}\n`);
  console.log('  将 hooks 配置添加到 ~/.claude/settings.json 即可连接 Claude Code 实例');
  console.log('  （在仪表盘中点击齿轮按钮查看配置）\n');

  // Optional: open browser
  if (process.argv.includes('--open')) {
    import('open').then(m => m.default(`http://localhost:${PORT}`)).catch(() => {});
  }
});
