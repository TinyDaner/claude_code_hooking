// Session display name generator — based on project directory
const NameGenerator = (() => {
  const cache = new Map();       // sessionId -> { name, color }
  const nameCount = new Map();   // baseName -> count (for dedup)

  const colors = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#2980B9', '#27AE60', '#8E44AD',
    '#16A085', '#D35400', '#C0392B', '#F1C40F', '#E91E63',
    '#00BCD4', '#FF5722', '#607D8B', '#795548', '#4CAF50',
  ];

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function extractProjectName(cwd) {
    if (!cwd) return null;
    const parts = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || null;
  }

  function register(sessionId, cwd) {
    if (cache.has(sessionId)) {
      // Update cwd if it changed and we had no name before
      const existing = cache.get(sessionId);
      if (existing.baseName === null && cwd) {
        const baseName = extractProjectName(cwd);
        if (baseName) {
          existing.baseName = baseName;
          const count = (nameCount.get(baseName) || 0) + 1;
          nameCount.set(baseName, count);
          existing.name = count > 1 ? `${baseName} #${count}` : baseName;
        }
      }
      return;
    }

    const baseName = extractProjectName(cwd);
    const color = colors[hashCode(sessionId) % colors.length];

    if (baseName) {
      const count = (nameCount.get(baseName) || 0) + 1;
      nameCount.set(baseName, count);
      const name = count > 1 ? `${baseName} #${count}` : baseName;
      cache.set(sessionId, { name, baseName, color });
    } else {
      cache.set(sessionId, { name: `会话-${sessionId.substring(0, 4).toUpperCase()}`, baseName: null, color });
    }
  }

  function getName(sessionId) {
    const entry = cache.get(sessionId);
    return entry ? entry.name : `会话-${sessionId.substring(0, 4).toUpperCase()}`;
  }

  function getColor(sessionId) {
    const entry = cache.get(sessionId);
    return entry ? entry.color : '#8E8E93';
  }

  return { register, getName, getColor };
})();
