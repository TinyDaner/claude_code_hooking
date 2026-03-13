// Alert banners + browser notifications
const Alerts = {
  container: null,
  notificationsEnabled: false,
  recentAlerts: new Map(),

  init() {
    this.container = document.getElementById('alert-container');
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        this.notificationsEnabled = p === 'granted';
      });
    } else if ('Notification' in window) {
      this.notificationsEnabled = Notification.permission === 'granted';
    }
  },

  show(event) {
    if (!event.alert) return;
    const alertType = event.alertType || 'permission';

    // Deduplicate: same session + same alert type within 30s
    const dedupeKey = `${event.sessionId}-${alertType}`;
    const now = Date.now();
    const last = this.recentAlerts.get(dedupeKey);
    if (last && now - last < 30000) return;
    this.recentAlerts.set(dedupeKey, now);
    const sessionName = NameGenerator.getName(event.sessionId || '');

    // In-page banner
    const banner = document.createElement('div');
    banner.className = `alert-banner ${alertType}`;
    banner.innerHTML = `
      <span class="alert-icon ${alertType === 'permission' ? 'icon-shake' : 'icon-swing'}">${alertType === 'permission' ? '\u26A0' : '\u23F0'}</span>
      <span class="alert-text"><strong>[${sessionName}]</strong> ${event.summary}</span>
      <button class="alert-dismiss">&times;</button>
    `;
    banner.querySelector('.alert-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      banner.remove();
    });
    banner.addEventListener('click', () => {
      // Select session on click
      if (window.Dashboard) {
        Dashboard.selectSession(event.sessionId);
      }
      banner.remove();
    });

    this.container.appendChild(banner);

    // Auto-dismiss after 15s
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
    }, 15000);

    // Browser notification
    if (this.notificationsEnabled && document.hidden) {
      try {
        const notification = new Notification('Claude Code 监控台', {
          body: `[${sessionName}] ${event.summary}`,
          icon: '/assets/favicon.svg',
          tag: `alert-${event.sessionId}-${Date.now()}`,
        });
        notification.onclick = () => {
          window.focus();
          if (window.Dashboard) {
            Dashboard.selectSession(event.sessionId);
          }
          notification.close();
        };
      } catch (e) { /* ignore */ }
    }

    // Title flash
    this._flashTitle(event.summary);
  },

  _flashTitle(msg) {
    if (!document.hidden) return;
    const original = document.title;
    let on = true;
    const interval = setInterval(() => {
      document.title = on ? `⚠ ${msg}` : original;
      on = !on;
    }, 1000);

    const restore = () => {
      clearInterval(interval);
      document.title = original;
      document.removeEventListener('visibilitychange', restore);
    };
    document.addEventListener('visibilitychange', restore);
    // Stop after 30s regardless
    setTimeout(restore, 30000);
  },
};
