const cards = require('./cards');

class FeishuNotifier {
  constructor(client, configManager, store) {
    this._client = client;
    this._configManager = configManager;
    this._store = store;

    // Dedup: Map<string, number> — key "sessionId:alertType" → last alert timestamp
    this._dedupMap = new Map();
    // Mute: Map<string, number> — sessionId → mute expires at timestamp
    this._muteMap = new Map();
    // Escalation timers: Map<string, setTimeout handle>
    this._escalationTimers = new Map();
    // Aggregation buffer
    this._aggregationBuffer = [];
    this._aggregationTimer = null;
    // Track waiting_for_input start times for escalation
    this._waitingStartMap = new Map();
  }

  /**
   * Main entry point — called by hook-router after each event.
   * Fire-and-forget, never throws to caller.
   */
  async evaluate(event, session, sessionUpdate) {
    try {
      const cfg = this._configManager.load();
      if (!cfg.enabled || !cfg.app_id || !cfg.app_secret) return;

      const alertInfo = this._shouldAlert(event, session, cfg);
      if (!alertInfo) return;

      const sessionId = session?.id || event.sessionId;

      // Check mute
      if (this._isMuted(sessionId)) return;

      // Check dedup
      const dedupKey = `${sessionId}:${alertInfo.alertType}`;
      if (this._isDeduplicated(dedupKey, cfg)) return;

      // Record dedup
      this._dedupMap.set(dedupKey, Date.now());

      // Track WAITING_FOR_INPUT for escalation
      if (session?.status === 'waiting_for_input') {
        if (!this._waitingStartMap.has(sessionId)) {
          this._waitingStartMap.set(sessionId, Date.now());
          this._scheduleEscalation(sessionId, cfg);
        }
      } else {
        this._waitingStartMap.delete(sessionId);
        this._cancelEscalation(sessionId);
      }

      // Use aggregation window
      const aggWindow = (cfg.alert_rules?.aggregation_window_seconds || 10) * 1000;
      if (aggWindow > 0) {
        this._aggregationBuffer.push({ event, session, alertInfo });
        if (!this._aggregationTimer) {
          this._aggregationTimer = setTimeout(() => this._flushAggregation(cfg), aggWindow);
        }
        return;
      }

      // Send immediately
      await this._sendAlert(event, session, alertInfo, cfg);
    } catch (err) {
      console.error('[feishu] evaluate error:', err.message);
    }
  }

  _shouldAlert(event, session, cfg) {
    const rules = cfg.alert_rules?.events || {};
    let ruleKey = null;
    let alertType = event.type;

    switch (event.type) {
      case 'PermissionRequest':
        ruleKey = 'PermissionRequest';
        break;
      case 'PostToolUseFailure':
        ruleKey = 'PostToolUseFailure';
        break;
      case 'Notification':
        if (event.alert && (event.alertType === 'permission' || event.alertType === 'idle')) {
          ruleKey = 'Notification_attention';
          alertType = 'Notification_attention';
        }
        break;
      case 'SessionEnd':
        if (session?.endReason && session.endReason !== 'user_exit' && session.endReason !== 'completed') {
          ruleKey = 'SessionEnd_abnormal';
          alertType = 'SessionEnd_abnormal';
        }
        break;
      case 'SessionStart':
        ruleKey = 'SessionStart';
        break;
      case 'SubagentStart':
        ruleKey = 'SubagentStart';
        break;
      default:
        break;
    }

    // Status change to NEEDS_ATTENTION
    if (session?.status === 'needs_attention') {
      const statusRule = rules['StatusChange_NEEDS_ATTENTION'];
      if (statusRule && statusRule.enabled) {
        ruleKey = 'StatusChange_NEEDS_ATTENTION';
        alertType = 'StatusChange_NEEDS_ATTENTION';
      }
    }

    if (!ruleKey) return null;
    const rule = rules[ruleKey];
    if (!rule || !rule.enabled) return null;

    return {
      alertType,
      priority: rule.priority || 'medium',
      targets: rule.targets || ['group'],
    };
  }

  _isDeduplicated(dedupKey, cfg) {
    const windowMs = (cfg.alert_rules?.dedup_window_seconds || 60) * 1000;
    const lastTime = this._dedupMap.get(dedupKey);
    if (lastTime && Date.now() - lastTime < windowMs) {
      return true;
    }
    return false;
  }

  _isMuted(sessionId) {
    const expiresAt = this._muteMap.get(sessionId);
    if (!expiresAt) return false;
    if (Date.now() >= expiresAt) {
      this._muteMap.delete(sessionId);
      return false;
    }
    return true;
  }

  muteSession(sessionId, minutes) {
    const duration = (minutes || 30) * 60 * 1000;
    this._muteMap.set(sessionId, Date.now() + duration);
  }

  acknowledgeAlert(sessionId) {
    this._cancelEscalation(sessionId);
    this._waitingStartMap.delete(sessionId);
  }

  getMutedSessions() {
    const result = [];
    const now = Date.now();
    for (const [id, expiresAt] of this._muteMap) {
      if (expiresAt > now) {
        result.push({ sessionId: id, expiresAt, remainingMinutes: Math.round((expiresAt - now) / 60000) });
      } else {
        this._muteMap.delete(id);
      }
    }
    return result;
  }

  _scheduleEscalation(sessionId, cfg) {
    this._cancelEscalation(sessionId);
    const escalationMs = (cfg.alert_rules?.escalation_minutes || 10) * 60 * 1000;
    const timer = setTimeout(async () => {
      this._escalationTimers.delete(sessionId);
      await this._sendEscalation(sessionId, cfg);
    }, escalationMs);
    this._escalationTimers.set(sessionId, timer);
  }

  _cancelEscalation(sessionId) {
    const timer = this._escalationTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this._escalationTimers.delete(sessionId);
    }
  }

  async _sendEscalation(sessionId, cfg) {
    try {
      const session = this._store.get(sessionId);
      if (!session || session.status !== 'waiting_for_input') return;
      if (this._isMuted(sessionId)) return;

      const startTime = this._waitingStartMap.get(sessionId);
      const waitMinutes = startTime ? (Date.now() - startTime) / 60000 : 0;
      const card = cards.buildEscalationCard(session, waitMinutes);
      await this._sendToTargets(card, ['group'], cfg);
    } catch (err) {
      console.error('[feishu] escalation error:', err.message);
    }
  }

  /**
   * Called by server.js 30s timer to check for WAITING_FOR_INPUT timeouts.
   */
  checkEscalations() {
    try {
      const cfg = this._configManager.load();
      if (!cfg.enabled) return;

      const timeoutMs = (cfg.alert_rules?.waiting_timeout_minutes || 5) * 60 * 1000;
      const now = Date.now();

      for (const [sessionId, startTime] of this._waitingStartMap) {
        const session = this._store.get(sessionId);
        if (!session || session.status !== 'waiting_for_input') {
          this._waitingStartMap.delete(sessionId);
          this._cancelEscalation(sessionId);
          continue;
        }
        // If timeout reached and no escalation scheduled, trigger WAITING_FOR_INPUT_timeout
        if (now - startTime >= timeoutMs && !this._escalationTimers.has(sessionId)) {
          const dedupKey = `${sessionId}:WAITING_FOR_INPUT_timeout`;
          if (!this._isDeduplicated(dedupKey, cfg)) {
            this._dedupMap.set(dedupKey, now);
            const rules = cfg.alert_rules?.events || {};
            const rule = rules['WAITING_FOR_INPUT_timeout'];
            if (rule && rule.enabled) {
              const card = cards.buildEscalationCard(session, (now - startTime) / 60000);
              this._sendToTargets(card, rule.targets || ['group'], cfg).catch(err => {
                console.error('[feishu] timeout alert error:', err.message);
              });
              // Schedule escalation for further delay
              this._scheduleEscalation(sessionId, cfg);
            }
          }
        }
      }
    } catch (err) {
      console.error('[feishu] checkEscalations error:', err.message);
    }
  }

  async _flushAggregation(cfg) {
    this._aggregationTimer = null;
    const buffer = this._aggregationBuffer.splice(0);
    if (buffer.length === 0) return;

    try {
      if (buffer.length === 1) {
        const { event, session, alertInfo } = buffer[0];
        await this._sendAlert(event, session, alertInfo, cfg);
      } else {
        const card = cards.buildAggregatedCard(buffer);
        await this._sendToTargets(card, ['group'], cfg);
      }
    } catch (err) {
      console.error('[feishu] flush aggregation error:', err.message);
    }
  }

  async _sendAlert(event, session, alertInfo, cfg) {
    const card = cards.buildAlertCard(event, session, {
      priority: alertInfo.priority,
      dashboardUrl: cfg.dashboard_url || 'http://localhost:3456',
    });
    await this._sendToTargets(card, alertInfo.targets, cfg);
  }

  async _sendToTargets(card, targets, cfg) {
    const promises = [];

    if (targets.includes('group') && cfg.targets?.default_chat_id) {
      promises.push(
        this._client.sendCard('chat_id', cfg.targets.default_chat_id, card)
      );
    }

    if (targets.includes('private') && cfg.targets?.open_ids?.length > 0) {
      for (const openId of cfg.targets.open_ids) {
        promises.push(
          this._client.sendCard('open_id', openId, card)
        );
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Send summary report on demand (called by scheduler).
   */
  async sendSummary() {
    try {
      const cfg = this._configManager.load();
      if (!cfg.enabled) return;

      const stats = this._store.getStats();
      const sessions = this._store.getAll();
      const card = cards.buildSummaryCard(stats, sessions);

      const targets = cfg.summary?.targets || ['group'];
      await this._sendToTargets(card, targets, cfg);
    } catch (err) {
      console.error('[feishu] sendSummary error:', err.message);
    }
  }
}

module.exports = { FeishuNotifier };
