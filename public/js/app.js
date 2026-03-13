// App entry point — initializes all components
(function () {
  // Init components
  ThemeManager.init();
  EventLog.init();
  Alerts.init();
  Dashboard.init();

  // WebSocket
  const ws = new WebSocketManager();

  ws.on('init', (data) => {
    Dashboard.loadSessions(data.sessions || []);
    Dashboard.updateStats(data.stats || {});
    EventLog.loadEvents(data.events || []);
  });

  ws.on('event', (data) => {
    if (data.session) Dashboard.updateSession(data.session);
    if (data.event) {
      EventLog.addEvent(data.event);
      Alerts.show(data.event);
    }
    if (data.stats) Dashboard.updateStats(data.stats);
  });

  ws.on('session_removed', (data) => {
    Dashboard.removeSession(data.sessionId);
    if (data.stats) Dashboard.updateStats(data.stats);
  });

  ws.connect();

  // Version tag
  fetch('/api/version').then(r => r.json()).then(d => {
    document.getElementById('version-tag').textContent = 'v' + d.version;
  }).catch(() => {});

  // Config modal
  const configModal = document.getElementById('config-modal');
  const configCode = document.getElementById('config-code');

  document.getElementById('btn-config').addEventListener('click', async () => {
    configModal.style.display = '';
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      configCode.textContent = JSON.stringify(config, null, 2);
    } catch {
      configCode.textContent = '加载配置失败';
    }
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    configModal.style.display = 'none';
  });

  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) configModal.style.display = 'none';
  });

  document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(configCode.textContent).then(() => {
      const btn = document.getElementById('btn-copy');
      btn.textContent = '已复制!';
      setTimeout(() => { btn.textContent = '复制到剪贴板'; }, 2000);
    });
  });
})();
