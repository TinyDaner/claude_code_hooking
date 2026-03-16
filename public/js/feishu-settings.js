// Feishu Settings UI module
const FeishuSettings = (() => {
  let _modal = null;
  let _config = null;

  function init() {
    _modal = document.getElementById('feishu-modal');
    const btnOpen = document.getElementById('btn-feishu');
    const btnClose = document.getElementById('feishu-modal-close');

    if (btnOpen) btnOpen.addEventListener('click', open);
    if (btnClose) btnClose.addEventListener('click', close);
    if (_modal) _modal.addEventListener('click', (e) => {
      if (e.target === _modal) close();
    });

    // Form handlers
    const btnSave = document.getElementById('feishu-btn-save');
    const btnTest = document.getElementById('feishu-btn-test');
    if (btnSave) btnSave.addEventListener('click', save);
    if (btnTest) btnTest.addEventListener('click', test);

    // Copy callback URL
    const btnCopy = document.getElementById('feishu-btn-copy-callback');
    if (btnCopy) btnCopy.addEventListener('click', copyCallback);
  }

  async function open() {
    if (!_modal) return;
    try {
      const resp = await fetch('/api/feishu/config');
      _config = await resp.json();
      _populateForm(_config);
      _modal.style.display = 'flex';
    } catch (err) {
      console.error('Failed to load feishu config:', err);
    }
  }

  function close() {
    if (_modal) _modal.style.display = 'none';
  }

  function _populateForm(cfg) {
    _setVal('feishu-enabled', cfg.enabled);
    _setVal('feishu-app-id', cfg.app_id || '');
    _setVal('feishu-app-secret', cfg.app_secret || '');
    _setVal('feishu-dashboard-url', cfg.dashboard_url || '');
    _setVal('feishu-chat-id', cfg.targets?.default_chat_id || '');
    _setVal('feishu-open-ids', (cfg.targets?.open_ids || []).join('\n'));

    // Alert rules
    const events = cfg.alert_rules?.events || {};
    for (const [key, rule] of Object.entries(events)) {
      const cb = document.getElementById(`feishu-rule-${key}`);
      if (cb) cb.checked = rule.enabled;
      const sel = document.getElementById(`feishu-priority-${key}`);
      if (sel) sel.value = rule.priority || 'medium';
    }

    _setVal('feishu-dedup', cfg.alert_rules?.dedup_window_seconds || 60);
    _setVal('feishu-timeout', cfg.alert_rules?.waiting_timeout_minutes || 5);
    _setVal('feishu-escalation', cfg.alert_rules?.escalation_minutes || 10);
    _setVal('feishu-mute-duration', cfg.alert_rules?.mute_duration_minutes || 30);
    _setVal('feishu-aggregation', cfg.alert_rules?.aggregation_window_seconds || 10);

    // Summary
    _setVal('feishu-summary-enabled', cfg.summary?.enabled || false);
    _setVal('feishu-summary-interval', cfg.summary?.interval || '1h');

    // Callback URL
    const callbackUrl = (cfg.dashboard_url || window.location.origin) + '/feishu/callback';
    const callbackEl = document.getElementById('feishu-callback-url');
    if (callbackEl) callbackEl.textContent = callbackUrl;

    // Status
    _updateStatus();
  }

  function _collectForm() {
    const events = {};
    const eventKeys = [
      'PermissionRequest', 'PostToolUseFailure', 'Notification_attention',
      'StatusChange_NEEDS_ATTENTION', 'WAITING_FOR_INPUT_timeout',
      'SessionEnd_abnormal', 'SessionStart', 'SubagentStart',
    ];
    for (const key of eventKeys) {
      const cb = document.getElementById(`feishu-rule-${key}`);
      const sel = document.getElementById(`feishu-priority-${key}`);
      events[key] = {
        enabled: cb ? cb.checked : false,
        priority: sel ? sel.value : 'medium',
        targets: ['group'],
      };
    }

    const openIdsStr = _getVal('feishu-open-ids') || '';
    const openIds = openIdsStr.split('\n').map(s => s.trim()).filter(Boolean);

    return {
      enabled: _getChecked('feishu-enabled'),
      app_id: _getVal('feishu-app-id') || '',
      app_secret: _getVal('feishu-app-secret') || '',
      dashboard_url: _getVal('feishu-dashboard-url') || '',
      targets: {
        default_chat_id: _getVal('feishu-chat-id') || '',
        open_ids: openIds,
        per_event: {},
      },
      alert_rules: {
        events,
        dedup_window_seconds: parseInt(_getVal('feishu-dedup')) || 60,
        waiting_timeout_minutes: parseInt(_getVal('feishu-timeout')) || 5,
        escalation_minutes: parseInt(_getVal('feishu-escalation')) || 10,
        mute_duration_minutes: parseInt(_getVal('feishu-mute-duration')) || 30,
        aggregation_window_seconds: parseInt(_getVal('feishu-aggregation')) || 10,
      },
      summary: {
        enabled: _getChecked('feishu-summary-enabled'),
        interval: _getVal('feishu-summary-interval') || '1h',
        targets: ['group'],
      },
    };
  }

  async function save() {
    const btn = document.getElementById('feishu-btn-save');
    const statusEl = document.getElementById('feishu-status');
    try {
      if (btn) btn.disabled = true;
      const config = _collectForm();
      const resp = await fetch('/api/feishu/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await resp.json();
      if (result.ok) {
        if (statusEl) {
          statusEl.textContent = '✅ 配置已保存';
          statusEl.className = 'feishu-status success';
        }
      } else {
        if (statusEl) {
          statusEl.textContent = '❌ 保存失败: ' + (result.error || '');
          statusEl.className = 'feishu-status error';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = '❌ 保存失败: ' + err.message;
        statusEl.className = 'feishu-status error';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function test() {
    const btn = document.getElementById('feishu-btn-test');
    const statusEl = document.getElementById('feishu-status');
    try {
      if (btn) btn.disabled = true;
      if (statusEl) {
        statusEl.textContent = '发送测试卡片中...';
        statusEl.className = 'feishu-status';
      }
      const resp = await fetch('/api/feishu/test', { method: 'POST' });
      const result = await resp.json();
      if (result.ok) {
        if (statusEl) {
          statusEl.textContent = '✅ 测试卡片已发送';
          statusEl.className = 'feishu-status success';
        }
      } else {
        if (statusEl) {
          statusEl.textContent = '❌ 发送失败: ' + (result.error || '');
          statusEl.className = 'feishu-status error';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = '❌ 发送失败: ' + err.message;
        statusEl.className = 'feishu-status error';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function _updateStatus() {
    try {
      const resp = await fetch('/api/feishu/status');
      const data = await resp.json();
      const dot = document.getElementById('feishu-conn-dot');
      const label = document.getElementById('feishu-conn-label');
      if (dot && label) {
        if (data.connected) {
          dot.className = 'feishu-dot connected';
          label.textContent = '已连接';
        } else {
          dot.className = 'feishu-dot disconnected';
          label.textContent = data.error || '未连接';
        }
      }
    } catch (_) {}
  }

  function copyCallback() {
    const el = document.getElementById('feishu-callback-url');
    if (el) {
      navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = document.getElementById('feishu-btn-copy-callback');
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      });
    }
  }

  // Helpers
  function _setVal(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') { el.checked = !!val; }
    else { el.value = val; }
  }
  function _getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }
  function _getChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', FeishuSettings.init);
