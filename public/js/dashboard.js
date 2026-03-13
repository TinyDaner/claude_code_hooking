// Dashboard — manages session cards grid
const Dashboard = {
  sessions: new Map(),
  selectedSessionId: null,
  grid: null,
  emptyState: null,
  durationInterval: null,
  // Track cumulative token high-water marks since browser window opened
  cumulativeTokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },

  init() {
    this.grid = document.getElementById('session-grid');
    this.emptyState = document.getElementById('empty-state');

    this.grid.addEventListener('click', (e) => {
      // Delete button
      const deleteBtn = e.target.closest('[data-delete]');
      if (deleteBtn) {
        e.stopPropagation();
        this._deleteSession(deleteBtn.dataset.delete);
        return;
      }
      // Focus terminal button
      const focusBtn = e.target.closest('[data-focus-terminal]');
      if (focusBtn) {
        e.stopPropagation();
        this._focusTerminal(focusBtn.dataset.focusTerminal);
        return;
      }
      // Card selection
      const card = e.target.closest('.session-card');
      if (card) {
        const id = card.dataset.sessionId;
        this.selectSession(this.selectedSessionId === id ? null : id);
      }
    });

    // Update durations every second
    this.durationInterval = setInterval(() => this._refreshDurations(), 1000);
  },

  loadSessions(sessions) {
    sessions.forEach(s => {
      NameGenerator.register(s.id, s.cwd);
      this._upsertCard(s);
    });
    this._updateEmptyState();
  },

  updateSession(session) {
    this._upsertCard(session);
    this._updateEmptyState();
  },

  removeSession(sessionId) {
    const card = this.grid.querySelector(`[data-session-id="${sessionId}"]`);
    if (card) card.remove();
    this.sessions.delete(sessionId);
    if (this.selectedSessionId === sessionId) {
      this.selectSession(null);
    }
    this._updateEmptyState();
  },

  selectSession(sessionId) {
    this.selectedSessionId = sessionId;
    this.grid.querySelectorAll('.session-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.sessionId === sessionId);
    });
    EventLog.setFilter(sessionId);
  },

  _upsertCard(session) {
    this.sessions.set(session.id, session);
    let card = this.grid.querySelector(`[data-session-id="${session.id}"]`);
    if (card) {
      SessionCard.update(card, session);
    } else {
      card = SessionCard.render(session);
      // Insert before empty state
      if (this.emptyState && this.emptyState.parentNode === this.grid) {
        this.grid.insertBefore(card, this.emptyState);
      } else {
        this.grid.appendChild(card);
      }
    }
    if (this.selectedSessionId === session.id) {
      card.classList.add('selected');
    }
  },

  _deleteSession(id) {
    fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    this.removeSession(id);
  },

  _focusTerminal(id) {
    fetch(`/api/sessions/${id}/focus-terminal`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          console.warn('无法聚焦终端:', data.error || '未知错误');
        }
      })
      .catch(() => {
        console.warn('聚焦终端请求失败');
      });
  },

  _updateEmptyState() {
    const hasCards = this.grid.querySelector('.session-card');
    if (this.emptyState) {
      this.emptyState.style.display = hasCards ? 'none' : '';
    }
  },

  _refreshDurations() {
    for (const [id, session] of this.sessions) {
      if (session.status === 'ended') continue;
      const card = this.grid.querySelector(`[data-session-id="${id}"]`);
      if (card) SessionCard.update(card, session);
    }
  },

  updateStats(stats) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('stat-active', stats.active || 0);
    set('stat-waiting', stats.waiting || 0);
    set('stat-attention', stats.needsAttention || 0);

    // Update token count — server-side getStats() already maintains correct cumulative totals
    const ct = this.cumulativeTokens;
    ct.input = stats.totalInputTokens || 0;
    ct.output = stats.totalOutputTokens || 0;
    ct.cacheRead = stats.totalCacheReadTokens || 0;
    ct.cacheCreate = stats.totalCacheCreateTokens || 0;

    const totalTokens = ct.input + ct.output + ct.cacheRead + ct.cacheCreate;
    const tokensEl = document.getElementById('stat-tokens');
    if (tokensEl) {
      if (totalTokens >= 1000000) tokensEl.textContent = (totalTokens / 1000000).toFixed(1) + 'M';
      else if (totalTokens >= 1000) tokensEl.textContent = (totalTokens / 1000).toFixed(1) + 'k';
      else tokensEl.textContent = totalTokens;

      // Append cost estimate
      const cost = (
        ct.input * 3 +
        ct.output * 15 +
        ct.cacheRead * 0.3 +
        ct.cacheCreate * 3.75
      ) / 1000000;
      if (cost >= 0.001) {
        tokensEl.textContent += ` (~$${cost < 0.01 ? cost.toFixed(3) : cost.toFixed(2)})`;
      }
    }

    // Toggle dynamic icons based on counts
    const toggle = (id, count) => {
      const icon = document.getElementById(id);
      if (icon) icon.style.display = count > 0 ? '' : 'none';
    };
    toggle('stat-active-icon', stats.active || 0);
    toggle('stat-waiting-icon', stats.waiting || 0);
    toggle('stat-attention-icon', stats.needsAttention || 0);

    // Highlight active count
    const activeEl = document.getElementById('stat-active');
    if (activeEl) {
      if ((stats.active || 0) > 0) {
        activeEl.classList.add('stat-highlight');
      } else {
        activeEl.classList.remove('stat-highlight');
      }
    }
  },
};
