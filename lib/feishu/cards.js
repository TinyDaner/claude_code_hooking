// Card color mapping by priority
const PRIORITY_COLORS = {
  high: 'red',
  medium: 'orange',
  info: 'blue',
  success: 'green',
};

const STATUS_LABELS = {
  active: '运行中',
  idle: '空闲',
  waiting_for_input: '等待输入',
  needs_attention: '需要关注',
  ended: '已结束',
};

function buildAlertCard(event, session, opts = {}) {
  const priority = opts.priority || 'medium';
  const color = PRIORITY_COLORS[priority] || 'blue';
  const sessionName = session ? _shortId(session.id) : '未知会话';
  const cwd = session?.cwd || '';
  const folderName = cwd ? cwd.replace(/\\/g, '/').split('/').pop() : '';
  const title = _alertTitle(event, session);

  const elements = [];

  // Summary field
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `**事件:** ${event.type}\n**摘要:** ${event.summary || ''}` },
  });

  // Session info
  const infoLines = [`**会话:** ${sessionName}`];
  if (folderName) infoLines.push(`**项目:** ${folderName}`);
  if (session?.status) infoLines.push(`**状态:** ${STATUS_LABELS[session.status] || session.status}`);
  if (event.toolName) infoLines.push(`**工具:** ${event.toolName}`);
  if (event.errorMessage) infoLines.push(`**错误:** ${event.errorMessage.substring(0, 100)}`);

  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: infoLines.join('\n') },
  });

  // Timestamp
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `🕐 ${new Date().toLocaleString('zh-CN', { hour12: false })}` },
  });

  elements.push({ tag: 'hr' });

  // Action buttons
  elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '✅ 确认' },
        type: 'primary',
        value: JSON.stringify({ action: 'acknowledge', session_id: session?.id }),
      },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '🔇 静默 30 分钟' },
        type: 'default',
        value: JSON.stringify({ action: 'mute', session_id: session?.id, duration: 30 }),
      },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '🔗 打开面板' },
        type: 'default',
        url: opts.dashboardUrl || 'http://localhost:3456',
      },
    ],
  });

  return {
    header: {
      title: { tag: 'plain_text', content: title },
      template: color,
    },
    elements,
  };
}

function buildSummaryCard(stats, sessions, opts = {}) {
  const elements = [];

  // Session status summary
  const statusLine = [
    `🟢 运行中: ${stats.active || 0}`,
    `🟡 等待中: ${stats.waiting || 0}`,
    `🔴 需关注: ${stats.needsAttention || 0}`,
    `⚪ 空闲: ${stats.idle || 0}`,
  ].join('  |  ');
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: statusLine },
  });

  // Token usage
  const totalInput = stats.totalInputTokens || 0;
  const totalOutput = stats.totalOutputTokens || 0;
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `📊 **Token 用量:** 输入 ${_formatNumber(totalInput)} / 输出 ${_formatNumber(totalOutput)}` },
  });

  // Per-session details (top 5 active)
  if (sessions && sessions.length > 0) {
    elements.push({ tag: 'hr' });
    const activeSessions = sessions
      .filter(s => s.status !== 'ended')
      .slice(0, 5);
    if (activeSessions.length > 0) {
      const lines = activeSessions.map(s => {
        const name = _shortId(s.id);
        const folder = s.cwd ? s.cwd.replace(/\\/g, '/').split('/').pop() : '-';
        const label = STATUS_LABELS[s.status] || s.status;
        return `• **${name}** (${folder}) — ${label} — 工具:${s.stats?.toolCalls || 0}`;
      });
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: '**活跃会话:**\n' + lines.join('\n') },
      });
    }
  }

  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `🕐 ${new Date().toLocaleString('zh-CN', { hour12: false })}` },
  });

  return {
    header: {
      title: { tag: 'plain_text', content: '📋 Claude Code 定时摘要' },
      template: 'blue',
    },
    elements,
  };
}

function buildEscalationCard(session, waitMinutes) {
  const sessionName = _shortId(session.id);
  const folderName = session.cwd ? session.cwd.replace(/\\/g, '/').split('/').pop() : '';
  const elements = [];

  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `⚠️ 会话 **${sessionName}** 已等待输入超过 **${Math.round(waitMinutes)} 分钟**` },
  });

  if (folderName) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**项目:** ${folderName}` },
    });
  }

  if (session.pendingPermission) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**等待授权工具:** ${session.pendingPermission}` },
    });
  }

  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '✅ 确认' },
        type: 'primary',
        value: JSON.stringify({ action: 'acknowledge', session_id: session.id }),
      },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '🔇 静默 30 分钟' },
        type: 'default',
        value: JSON.stringify({ action: 'mute', session_id: session.id, duration: 30 }),
      },
    ],
  });

  return {
    header: {
      title: { tag: 'plain_text', content: `🚨 超时升级 — ${sessionName}` },
      template: 'red',
    },
    elements,
  };
}

function buildAggregatedCard(alerts) {
  const elements = [];
  const lines = alerts.map((a, i) => {
    const name = a.session ? _shortId(a.session.id) : '?';
    return `${i + 1}. [${a.event.type}] ${name} — ${a.event.summary || ''}`;
  });

  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: lines.join('\n') },
  });

  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `🕐 ${new Date().toLocaleString('zh-CN', { hour12: false })}` },
  });

  return {
    header: {
      title: { tag: 'plain_text', content: `🔔 ${alerts.length} 条告警聚合` },
      template: 'orange',
    },
    elements,
  };
}

function buildTestCard() {
  return {
    header: {
      title: { tag: 'plain_text', content: '✅ Claude Code 监控台 — 连接测试' },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '飞书通知集成测试成功！\n\n此卡片由 Claude Code 监控台发送，确认飞书 App 凭证和群聊 ID 配置正确。' },
      },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `🕐 ${new Date().toLocaleString('zh-CN', { hour12: false })}` },
      },
    ],
  };
}

function buildAcknowledgedCard(originalTitle) {
  return {
    header: {
      title: { tag: 'plain_text', content: `${originalTitle} [已确认]` },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `✅ 已确认处理\n🕐 ${new Date().toLocaleString('zh-CN', { hour12: false })}` },
      },
    ],
  };
}

function buildMutedCard(originalTitle, minutes) {
  return {
    header: {
      title: { tag: 'plain_text', content: `${originalTitle} [已静默]` },
      template: 'grey',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `🔇 已静默 ${minutes} 分钟\n🕐 ${new Date().toLocaleString('zh-CN', { hour12: false })}` },
      },
    ],
  };
}

// Helpers
function _shortId(id) {
  if (!id) return '?';
  return id.length > 12 ? id.substring(0, 8) + '...' : id;
}

function _alertTitle(event, session) {
  const prefix = '🔔';
  switch (event.type) {
    case 'PermissionRequest': return `${prefix} 权限请求 — ${event.toolName || ''}`;
    case 'PostToolUseFailure': return `${prefix} 工具失败 — ${event.toolName || ''}`;
    case 'Notification': return `${prefix} 通知 — 需要关注`;
    case 'SessionEnd': return `${prefix} 会话异常结束`;
    case 'SessionStart': return `${prefix} 新会话启动`;
    case 'SubagentStart': return `${prefix} 子代理启动`;
    default: return `${prefix} ${event.type}`;
  }
}

function _formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

module.exports = {
  buildAlertCard,
  buildSummaryCard,
  buildEscalationCard,
  buildAggregatedCard,
  buildTestCard,
  buildAcknowledgedCard,
  buildMutedCard,
};
