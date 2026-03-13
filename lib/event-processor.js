const { STATUS } = require('./session-store');

function processHookEvent(body) {
  const hookEvent = body.hook_event_name || body.type || 'unknown';
  const sessionId = body.session_id || 'unknown';

  const event = {
    type: hookEvent,
    sessionId,
    raw: body,
    summary: '',
  };

  const sessionUpdate = { id: sessionId };

  // Capture cwd from any event (not just SessionStart)
  const cwd = body.cwd || body.session?.cwd || null;
  if (cwd) {
    sessionUpdate.cwd = cwd;
  }

  switch (hookEvent) {
    case 'SessionStart': {
      sessionUpdate.status = STATUS.ACTIVE;
      sessionUpdate.permissionMode = body.permission_mode || body.session?.permission_mode || null;
      sessionUpdate.startedAt = Date.now();
      sessionUpdate.currentTool = null;
      sessionUpdate.pendingPermission = null;
      event.summary = `会话启动${cwd ? ` - ${cwd}` : ''}`;
      break;
    }

    case 'PreToolUse': {
      const toolName = body.tool_name || body.tool?.name || 'unknown';
      const toolInput = body.tool_input || body.tool?.input || {};
      sessionUpdate.status = STATUS.ACTIVE;
      sessionUpdate.currentTool = toolName;
      sessionUpdate.pendingPermission = null;
      sessionUpdate.currentToolStartedAt = Date.now();
      event.toolName = toolName;
      event.toolInput = summarizeToolInput(toolName, toolInput);
      event.summary = `正在使用工具: ${toolName}`;
      break;
    }

    case 'PostToolUse': {
      const toolName = body.tool_name || body.tool?.name || 'unknown';
      sessionUpdate.status = STATUS.ACTIVE;
      sessionUpdate.currentTool = null;
      event.toolName = toolName;
      event.summary = `工具执行完成: ${toolName}`;
      // Track tool call stats
      sessionUpdate._incrementToolCalls = true;
      sessionUpdate._addToolTime = true;
      break;
    }

    case 'PermissionRequest': {
      const toolName = body.tool_name || body.tool?.name || 'unknown';
      sessionUpdate.status = STATUS.WAITING_FOR_INPUT;
      sessionUpdate.pendingPermission = toolName;
      event.toolName = toolName;
      event.summary = `请求授权: ${toolName}`;
      event.alert = true;
      event.alertType = 'permission';
      sessionUpdate._incrementPermissions = true;
      break;
    }

    case 'Notification': {
      const notifType = body.notification_type || body.type || '';
      if (notifType === 'permission_prompt' || notifType === 'idle_prompt' ||
          (body.message && (body.message.includes('permission') || body.message.includes('idle')))) {
        sessionUpdate.status = STATUS.NEEDS_ATTENTION;
        event.alert = true;
        event.alertType = notifType.includes('permission') ? 'permission' : 'idle';
      }
      event.message = body.message || body.notification || '';
      event.summary = `通知: ${event.message.substring(0, 80) || notifType}`;
      break;
    }

    case 'Stop': {
      sessionUpdate.status = STATUS.IDLE;
      sessionUpdate.currentTool = null;
      sessionUpdate.pendingPermission = null;
      event.summary = '会话停止（空闲）';
      break;
    }

    case 'SessionEnd': {
      sessionUpdate.status = STATUS.ENDED;
      sessionUpdate.currentTool = null;
      sessionUpdate.pendingPermission = null;
      event.summary = '会话结束';
      break;
    }

    case 'SubagentStart': {
      const agentId = body.subagent_id || body.agent_id || `sub-${Date.now()}`;
      sessionUpdate._addSubagent = agentId;
      event.summary = `子代理启动: ${agentId}`;
      break;
    }

    case 'SubagentStop': {
      const agentId = body.subagent_id || body.agent_id || '';
      sessionUpdate._removeSubagent = agentId;
      event.summary = `子代理停止: ${agentId}`;
      break;
    }

    case 'PostToolUseFailure': {
      const toolName = body.tool_name || body.tool?.name || 'unknown';
      const errorMsg = body.error || body.message || '未知错误';
      sessionUpdate.status = STATUS.ACTIVE;
      sessionUpdate.currentTool = null;
      event.toolName = toolName;
      event.errorMessage = errorMsg;
      event.summary = `工具执行失败: ${toolName} - ${errorMsg.substring(0, 80)}`;
      sessionUpdate._incrementErrors = true;
      sessionUpdate._addToolTime = true;
      break;
    }

    case 'UserPromptSubmit': {
      const prompt = body.prompt || body.message || '';
      sessionUpdate.status = STATUS.ACTIVE;
      event.prompt = prompt.substring(0, 200);
      event.summary = `用户提示: ${prompt.substring(0, 80) || '(空)'}`;
      sessionUpdate._incrementPrompts = true;
      break;
    }

    case 'PreCompact': {
      event.summary = '上下文压缩中';
      sessionUpdate._incrementCompactions = true;
      break;
    }

    case 'ConfigChange': {
      const key = body.key || body.config_key || '';
      const value = body.value !== undefined ? String(body.value).substring(0, 80) : '';
      event.configKey = key;
      event.configValue = value;
      event.summary = `配置变更: ${key}${value ? ` = ${value}` : ''}`;
      break;
    }

    default: {
      event.summary = `事件: ${hookEvent}`;
    }
  }

  // Extract token usage: prefer inline payload, fallback to transcript file
  const usage = extractUsage(body);
  if (usage) {
    sessionUpdate._setTokens = usage;
    event.usage = usage;
  }

  // Record transcript_path for future reads
  if (body.transcript_path) {
    sessionUpdate.transcriptPath = body.transcript_path;
  }

  return { event, sessionUpdate };
}

function extractUsage(body) {
  // 1. Try inline payload fields (for manually sent events or future API changes)
  const src =
    body.message?.usage ||
    body.usage ||
    body.session?.usage ||
    null;

  if (src && (src.input_tokens || src.output_tokens)) {
    return {
      input_tokens: src.input_tokens || 0,
      output_tokens: src.output_tokens || 0,
      cache_read_input_tokens: src.cache_read_input_tokens || 0,
      cache_creation_input_tokens: src.cache_creation_input_tokens || 0,
    };
  }

  if (body.input_tokens || body.output_tokens) {
    return {
      input_tokens: body.input_tokens || 0,
      output_tokens: body.output_tokens || 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
  }

  // 2. Parse transcript file
  if (body.transcript_path) {
    return parseTranscriptUsage(body.transcript_path);
  }

  return null;
}

function parseTranscriptUsage(filePath) {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    let input = 0, output = 0, cacheRead = 0, cacheCreate = 0;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'assistant' && obj.message && obj.message.usage) {
          const u = obj.message.usage;
          input += u.input_tokens || 0;
          output += u.output_tokens || 0;
          cacheRead += u.cache_read_input_tokens || 0;
          cacheCreate += u.cache_creation_input_tokens || 0;
        }
      } catch (e) {}
    }
    if (input || output || cacheRead || cacheCreate) {
      return { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreate };
    }
  } catch (e) {}
  return null;
}

function summarizeToolInput(toolName, input) {
  if (!input) return '';
  if (typeof input === 'string') return input.substring(0, 120);
  // Show key fields depending on tool
  if (input.command) return input.command.substring(0, 120);
  if (input.file_path) return input.file_path;
  if (input.pattern) return `pattern: ${input.pattern}`;
  if (input.query) return input.query.substring(0, 120);
  if (input.url) return input.url;
  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  return keys.slice(0, 3).join(', ');
}

module.exports = { processHookEvent };
