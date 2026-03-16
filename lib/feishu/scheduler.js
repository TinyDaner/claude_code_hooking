class SummaryScheduler {
  constructor(notifier, configManager, store) {
    this._notifier = notifier;
    this._configManager = configManager;
    this._store = store;
    this._timer = null;
  }

  start() {
    this.stop();
    const cfg = this._configManager.load();
    if (!cfg.enabled || !cfg.summary?.enabled) return;

    const intervalMs = this._parseInterval(cfg.summary.interval || '1h');
    if (intervalMs <= 0) return;

    console.log(`[feishu-scheduler] Summary reports every ${cfg.summary.interval}`);
    this._timer = setInterval(() => {
      this._notifier.sendSummary().catch(err => {
        console.error('[feishu-scheduler] Summary error:', err.message);
      });
    }, intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  reconfigure() {
    this.stop();
    this.start();
  }

  _parseInterval(str) {
    const match = str.match(/^(\d+)(m|h|d)$/);
    if (!match) return 3600000; // default 1h
    const val = parseInt(match[1], 10);
    switch (match[2]) {
      case 'm': return val * 60 * 1000;
      case 'h': return val * 3600 * 1000;
      case 'd': return val * 86400 * 1000;
      default: return 3600000;
    }
  }
}

module.exports = { SummaryScheduler };
