const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'feishu-config.json');

const DEFAULT_CONFIG = {
  enabled: false,
  app_id: '',
  app_secret: '',
  dashboard_url: 'http://localhost:3456',
  targets: {
    default_chat_id: '',
    open_ids: [],
    per_event: {},
  },
  alert_rules: {
    events: {
      PermissionRequest:              { enabled: true,  priority: 'high',   targets: ['group'] },
      PostToolUseFailure:             { enabled: true,  priority: 'high',   targets: ['group'] },
      Notification_attention:         { enabled: true,  priority: 'medium', targets: ['group'] },
      StatusChange_NEEDS_ATTENTION:   { enabled: true,  priority: 'high',   targets: ['group'] },
      WAITING_FOR_INPUT_timeout:      { enabled: true,  priority: 'medium', targets: ['group'] },
      SessionEnd_abnormal:            { enabled: true,  priority: 'medium', targets: ['group'] },
      SessionStart:                   { enabled: false, priority: 'info',   targets: ['group'] },
      SubagentStart:                  { enabled: false, priority: 'info',   targets: ['group'] },
    },
    dedup_window_seconds: 60,
    waiting_timeout_minutes: 5,
    escalation_minutes: 10,
    mute_duration_minutes: 30,
    aggregation_window_seconds: 10,
  },
  summary: {
    enabled: false,
    interval: '1h',
    targets: ['group'],
  },
};

class FeishuConfigManager {
  constructor() {
    this._config = null;
  }

  load() {
    if (this._config) return this._config;
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        this._config = this._merge(DEFAULT_CONFIG, JSON.parse(raw));
      } else {
        this._config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      }
    } catch (err) {
      console.error('[feishu-config] Failed to load config:', err.message);
      this._config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
    return this._config;
  }

  save(config) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this._config = this._merge(DEFAULT_CONFIG, config);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this._config, null, 2), 'utf8');
    return this._config;
  }

  update(partial) {
    const current = this.load();
    const merged = this._merge(current, partial);
    return this.save(merged);
  }

  getSanitized() {
    const cfg = this.load();
    const sanitized = JSON.parse(JSON.stringify(cfg));
    if (sanitized.app_secret) {
      sanitized.app_secret = sanitized.app_secret.replace(/./g, (c, i, s) =>
        i < 4 || i >= s.length - 4 ? c : '*'
      );
    }
    return sanitized;
  }

  _merge(base, override) {
    const result = JSON.parse(JSON.stringify(base));
    for (const key of Object.keys(override)) {
      if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])
          && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = this._merge(result[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }
}

module.exports = { FeishuConfigManager, DEFAULT_CONFIG };
