// Event log panel
const EventLog = {
  maxVisible: 200,
  events: [],
  filterSessionId: null,

  init() {
    this.body = document.getElementById('event-log-body');
    this.filterInfo = document.getElementById('filter-info');
    this.clearFilterBtn = document.getElementById('clear-filter');

    this.clearFilterBtn.addEventListener('click', () => {
      this.setFilter(null);
    });
  },

  addEvent(event) {
    this.events.push(event);
    if (this.events.length > 500) this.events = this.events.slice(-400);

    if (this.filterSessionId && event.sessionId !== this.filterSessionId) return;
    this._appendEventElement(event);
    this._trimVisible();
    this._scrollToBottom();
  },

  loadEvents(events) {
    this.events = events;
    this._renderAll();
  },

  setFilter(sessionId) {
    this.filterSessionId = sessionId;
    if (sessionId) {
      this.filterInfo.textContent = `已筛选: ${NameGenerator.getName(sessionId)}`;
      this.clearFilterBtn.style.display = '';
    } else {
      this.filterInfo.textContent = '';
      this.clearFilterBtn.style.display = 'none';
    }
    this._renderAll();
  },

  _renderAll() {
    this.body.innerHTML = '';
    const filtered = this.filterSessionId
      ? this.events.filter(e => e.sessionId === this.filterSessionId)
      : this.events;
    filtered.slice(-this.maxVisible).forEach(e => this._appendEventElement(e));
    this._scrollToBottom();
  },

  _appendEventElement(event) {
    const el = document.createElement('div');
    const isError = event.type === 'PostToolUseFailure';
    const isHighlight = event.type === 'TaskCompleted' || event.type === 'InstructionsLoaded';
    el.className = 'event-item' + (isError ? ' event-error' : '') + (isHighlight ? ' event-highlight' : '');
    const time = new Date(event.timestamp).toLocaleTimeString();
    const sessionId = event.sessionId || '';
    const displayName = NameGenerator.getName(sessionId);
    const nameColor = NameGenerator.getColor(sessionId);
    const type = event.type || 'unknown';
    const detail = event.summary || '';
    const durationTag = event.toolDuration != null ? ` <span style="color:var(--text-tertiary);font-size:10px">(${event.toolDuration}ms)</span>` : '';

    const typeIcon = this._eventTypeIcon(type);
    el.innerHTML = `
      <span class="event-time">${time}</span>
      <span class="event-session-badge" title="${sessionId}" style="background:${nameColor}22;color:${nameColor}">${displayName}</span>
      <span class="event-type-tag ${type}">${typeIcon}${type}</span>
      <span class="event-detail" title="${detail}">${detail}${durationTag}</span>
    `;
    this.body.appendChild(el);
  },

  _trimVisible() {
    while (this.body.children.length > this.maxVisible) {
      this.body.removeChild(this.body.firstChild);
    }
  },

  _eventTypeIcon(type) {
    const icons = {
      SessionStart: '<span class="event-type-icon">▶\uFE0E</span>',
      PreToolUse: '<span class="event-type-icon icon-spin">⚙\uFE0E</span>',
      PostToolUse: '<span class="event-type-icon">✓</span>',
      PermissionRequest: '<span class="event-type-icon icon-pulse">⊙</span>',
      PostToolUseFailure: '<span class="event-type-icon icon-blink">✗</span>',
      SessionEnd: '<span class="event-type-icon">■</span>',
      SubagentStart: '<span class="event-type-icon icon-spin">◆</span>',
      SubagentStop: '<span class="event-type-icon">◆</span>',
      Stop: '<span class="event-type-icon">⏹\uFE0E</span>',
      Notification: '<span class="event-type-icon">♪</span>',
      UserPromptSubmit: '<span class="event-type-icon">▷</span>',
      PreCompact: '<span class="event-type-icon">⊘</span>',
      PostCompact: '<span class="event-type-icon">⊙</span>',
      ConfigChange: '<span class="event-type-icon">⚙\uFE0E</span>',
      InstructionsLoaded: '<span class="event-type-icon">📋\uFE0E</span>',
      TaskCompleted: '<span class="event-type-icon">✔</span>',
      TeammateIdle: '<span class="event-type-icon">◇</span>',
      WorktreeCreate: '<span class="event-type-icon">🌿\uFE0E</span>',
      WorktreeRemove: '<span class="event-type-icon">✂\uFE0E</span>',
      Elicitation: '<span class="event-type-icon icon-pulse">?</span>',
      ElicitationResult: '<span class="event-type-icon">!</span>',
    };
    return icons[type] || '<span class="event-type-icon">·</span>';
  },

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.body.scrollTop = this.body.scrollHeight;
    });
  },
};
