// Session card component
const SessionCard = {
  render(session) {
    const el = document.createElement('div');
    el.className = 'session-card status-' + session.status;
    el.dataset.sessionId = session.id;
    this.update(el, session);
    return el;
  },

  update(el, session) {
    // Sync status class while preserving 'selected'
    const isSelected = el.classList.contains('selected');
    el.className = 'session-card status-' + session.status;
    if (isSelected) el.classList.add('selected');
    NameGenerator.register(session.id, session.cwd);
    const displayName = NameGenerator.getName(session.id);
    const nameColor = NameGenerator.getColor(session.id);
    const duration = this._formatDuration(Date.now() - session.startedAt);
    const cwd = session.cwd ? this._shortenPath(session.cwd) : '未知';
    const toolContent = session.currentTool
      ? `<span class="tool-spinner"></span>${session.currentTool}`
      : (session.pendingPermission ? `⚠\uFE0E ${session.pendingPermission}` : '—');

    el.innerHTML = `
      <div class="card-header">
        <div class="card-status">
          <div class="status-dot ${session.status}"></div>
          <span class="card-session-id" title="${session.id}" style="color:${nameColor}">${displayName}</span>
        </div>
        <span class="card-status-label ${session.status}">${this._statusIcon(session.status)}${this._statusLabel(session.status)}</span>
      </div>
      <div class="card-body">
        <div class="card-row"><span class="label">目录</span><span class="value" title="${session.cwd || ''}">${cwd}</span></div>
        ${session.model ? `<div class="card-row"><span class="label">模型</span><span class="value">${session.model}${session.agentType ? ` (${session.agentType})` : ''}</span></div>` : ''}
        <div class="card-row"><span class="label">工具</span><span class="value">${toolContent}</span></div>
        <div class="card-row"><span class="label">时长</span><span class="value">${duration}</span></div>
        <div class="card-row"><span class="label">提示</span><span class="value">${session.stats.prompts || 0} 次</span></div>
        <div class="card-row"><span class="label">耗时</span><span class="value">${session.stats.toolCalls && session.stats.totalToolTime ? this._formatMs(Math.round(session.stats.totalToolTime / session.stats.toolCalls)) + '/次' : '—'}</span></div>
        <div class="card-row"><span class="label">token</span><span class="value token-value">${this._formatTokens(session.stats)}</span></div>
      </div>
      ${session.status === 'active' ? '<div class="claude-runner-wrap"><div class="claude-runner"></div></div>' : ''}
      <div class="card-footer">
        <div class="subagent-badges">${session.subagents.map((a, i) => `<span class="subagent-badge">&#9670; 子代理 #${i + 1}</span>`).join('')}</div>
        <span>${session.stats.toolCalls} 次工具 &middot; ${session.stats.permissions} 次授权${session.stats.errors ? ` &middot; <span style="color:#FF3B30">${session.stats.errors} 错误</span>` : ''}${session.stats.compactions ? ` &middot; <span style="color:#AF52DE">${session.stats.compactions} 压缩</span>` : ''}${session.stats.tasksCompleted ? ` &middot; <span style="color:#34C759">${session.stats.tasksCompleted} 任务</span>` : ''}${session.stats.worktrees ? ` &middot; <span style="color:#5AC8FA">${session.stats.worktrees} 工作区</span>` : ''}${session.stats.instructionsLoaded ? ` &middot; ${session.stats.instructionsLoaded} 指令` : ''}${((session.stats.inputTokens || 0) + (session.stats.outputTokens || 0) + (session.stats.cacheReadTokens || 0) + (session.stats.cacheCreateTokens || 0)) > 0 ? ` &middot; <span class="token-value">${this._formatTokenCount((session.stats.inputTokens || 0) + (session.stats.outputTokens || 0) + (session.stats.cacheReadTokens || 0) + (session.stats.cacheCreateTokens || 0))}</span> token` : ''}${session.endReason ? ` &middot; <span style="color:var(--text-tertiary)">结束: ${session.endReason}</span>` : ''}</span>
        <div class="card-actions">
          ${session.status !== 'ended' ? `<button class="card-focus-terminal" title="跳转终端" data-focus-terminal="${session.id}">&#9654; 终端</button>` : ''}
          <button class="card-delete" title="移除会话" data-delete="${session.id}">&times;</button>
        </div>
      </div>
    `;
  },

  _statusLabel(status) {
    const labels = {
      active: '运行中',
      idle: '空闲',
      waiting_for_input: '等待中',
      needs_attention: '需关注',
      ended: '已结束',
    };
    return labels[status] || status;
  },

  _formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}秒`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}分${s % 60}秒`;
    const h = Math.floor(m / 60);
    return `${h}时${m % 60}分`;
  },

  _formatMs(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  },

  _statusIcon(status) {
    const icons = {
      active: '<span class="status-icon icon-spin">⚙\uFE0E</span>',
      waiting_for_input: '<span class="status-icon icon-blink">⏳\uFE0E</span>',
      needs_attention: '<span class="status-icon icon-shake">⚠\uFE0E</span>',
      ended: '<span class="status-icon">✓</span>',
      idle: '<span class="status-icon">—</span>',
    };
    return icons[status] || '';
  },

  _formatTokens(stats) {
    const input = stats.inputTokens || 0;
    const output = stats.outputTokens || 0;
    const cacheRead = stats.cacheReadTokens || 0;
    const cacheCreate = stats.cacheCreateTokens || 0;
    const total = input + output + cacheRead + cacheCreate;
    if (total === 0) return '—';
    const fmt = this._formatTokenCount;
    const cost = this._estimateCost(input, output, cacheRead, cacheCreate);
    let detail = `↑${fmt(output)}`;
    if (cacheRead) detail += ` cache:${fmt(cacheRead)}`;
    return `${fmt(total)} <span class="cost-estimate">(${detail})</span>${cost}`;
  },

  _formatTokenCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  },

  _estimateCost(input, output, cacheRead, cacheCreate) {
    // Sonnet pricing: $3/M input, $15/M output, $0.30/M cache read, $3.75/M cache create
    const cost = (input * 3 + output * 15 + (cacheRead || 0) * 0.3 + (cacheCreate || 0) * 3.75) / 1000000;
    if (cost < 0.001) return '';
    return ` <span class="cost-estimate">(~$${cost < 0.01 ? cost.toFixed(3) : cost.toFixed(2)})</span>`;
  },

  _shortenPath(p) {
    const parts = p.replace(/\\/g, '/').split('/');
    if (parts.length <= 3) return p;
    return '.../' + parts.slice(-2).join('/');
  },
};
