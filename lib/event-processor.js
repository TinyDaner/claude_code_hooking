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

  // Extract common fields available on all events
  const agentId = body.agent_id || null;
  const agentType = body.agent_type || null;
  if (agentId) event.agentId = agentId;
  if (agentType) event.agentType = agentType;

  switch (hookEvent) {
    case 'SessionStart': {
      sessionUpdate.status = STATUS.ACTIVE;
      sessionUpdate.permissionMode = body.permission_mode || body.session?.permission_mode || null;
      sessionUpdate.startedAt = Date.now();
      sessionUpdate.currentTool = null;
      sessionUpdate.pendingPermission = null;
      const model = body.model || body.session?.model || null;
      const source = body.source || body.session?.source || null;
      const sessionAgentType = body.agent_type || body.session?.agent_type || null;
      if (model) sessionUpdate.model = model;
      if (source) sessionUpdate.source = source;
      if (sessionAgentType) sessionUpdate.agentType = sessionAgentType;
      const modelTag = model ? ` [${model}]` : '';
      event.summary = `会话启动${modelTag}${cwd ? ` - ${cwd}` : ''}`;
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
      const toolResponse = body.tool_response || body.response || null;
      sessionUpdate.status = STATUS.ACTIVE;
      sessionUpdate.currentTool = null;
      event.toolName = toolName;
      if (toolResponse) {
        event.toolResponse = typeof toolResponse === 'string'
          ? toolResponse.substring(0, 200)
          : JSON.stringify(toolResponse).substring(0, 200);
      }
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
      const notifTitle = body.title || '';
      if (notifType === 'permission_prompt' || notifType === 'idle_prompt' ||
          (body.message && (body.message.includes('permission') || body.message.includes('idle')))) {
        sessionUpdate.status = STATUS.NEEDS_ATTENTION;
        event.alert = true;
        event.alertType = notifType.includes('permission') ? 'permission' : 'idle';
      }
      event.message = body.message || body.notification || '';
      if (notifType) event.notificationType = notifType;
      if (notifTitle) event.notificationTitle = notifTitle;
      event.summary = `通知${notifTitle ? ` [${notifTitle}]` : ''}: ${event.message.substring(0, 80) || notifType}`;
      break;
    }

    case 'Stop': {
      sessionUpdate.status = STATUS.IDLE;
      sessionUpdate.currentTool = null;
      sessionUpdate.pendingPermission = null;
      const stopHookActive = body.stop_hook_active || false;
      const lastMsg = body.last_assistant_message || '';
      if (lastMsg) event.lastAssistantMessage = lastMsg.substring(0, 200);
      if (stopHookActive) event.stopHookActive = true;
      const msgPreview = lastMsg ? ` - ${lastMsg.substring(0, 60)}` : '';
      event.summary = `会话停止（空闲）${msgPreview}`;
      break;
    }

    case 'SessionEnd': {
      sessionUpdate.status = STATUS.ENDED;
      sessionUpdate.currentTool = null;
      sessionUpdate.pendingPermission = null;
      const endReason = body.reason || '';
      if (endReason) {
        sessionUpdate.endReason = endReason;
        event.endReason = endReason;
      }
      event.summary = `会话结束${endReason ? ` (${endReason})` : ''}`;
      break;
    }

    case 'SubagentStart': {
      const subAgentId = body.subagent_id || body.agent_id || `sub-${Date.now()}`;
      const subAgentType = body.agent_type || body.subagent_type || '';
      sessionUpdate._addSubagent = subAgentId;
      event.subagentType = subAgentType;
      event.summary = `子代理启动: ${subAgentId}${subAgentType ? ` (${subAgentType})` : ''}`;
      break;
    }

    case 'SubagentStop': {
      const subAgentId = body.subagent_id || body.agent_id || '';
      const subAgentType = body.agent_type || body.subagent_type || '';
      const lastSubMsg = body.last_assistant_message || '';
      const transcriptPath = body.agent_transcript_path || '';
      sessionUpdate._removeSubagent = subAgentId;
      event.subagentType = subAgentType;
      if (lastSubMsg) event.lastAssistantMessage = lastSubMsg.substring(0, 200);
      if (transcriptPath) event.agentTranscriptPath = transcriptPath;
      event.summary = `子代理停止: ${subAgentId}${subAgentType ? ` (${subAgentType})` : ''}`;
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
      const compactTrigger = body.trigger || '';
      const customInstructions = body.custom_instructions || '';
      if (compactTrigger) event.compactTrigger = compactTrigger;
      if (customInstructions) event.customInstructions = customInstructions.substring(0, 200);
      event.summary = `上下文压缩中${compactTrigger ? ` (${compactTrigger})` : ''}`;
      sessionUpdate._incrementCompactions = true;
      sessionUpdate._preCompactTimestamp = Date.now();
      break;
    }

    case 'ConfigChange': {
      const key = body.key || body.config_key || '';
      const value = body.value !== undefined ? String(body.value).substring(0, 80) : '';
      const configSource = body.source || '';
      const configFilePath = body.file_path || '';
      event.configKey = key;
      event.configValue = value;
      if (configSource) event.configSource = configSource;
      if (configFilePath) event.configFilePath = configFilePath;
      const sourceTag = configSource ? ` [${configSource}]` : '';
      event.summary = `配置变更${sourceTag}: ${key}${value ? ` = ${value}` : ''}`;
      break;
    }

    case 'PostCompact': {
      const compactSummary = body.summary || '';
      if (compactSummary) event.compactSummary = compactSummary.substring(0, 200);
      event.summary = `上下文压缩完成${compactSummary ? ` - ${compactSummary.substring(0, 60)}` : ''}`;
      sessionUpdate._postCompactTimestamp = Date.now();
      break;
    }

    case 'InstructionsLoaded': {
      const filePath = body.file_path || body.path || '';
      const memoryType = body.memory_type || '';
      const loadReason = body.load_reason || '';
      event.filePath = filePath;
      if (memoryType) event.memoryType = memoryType;
      if (loadReason) event.loadReason = loadReason;
      const fileName = filePath ? filePath.split(/[/\\]/).pop() : '';
      event.summary = `指令加载: ${fileName || filePath}${loadReason ? ` (${loadReason})` : ''}`;
      sessionUpdate._incrementInstructionsLoaded = true;
      break;
    }

    case 'TaskCompleted': {
      const taskId = body.task_id || '';
      const taskSubject = body.task_subject || body.subject || '';
      const teammateName = body.teammate_name || '';
      event.taskId = taskId;
      if (taskSubject) event.taskSubject = taskSubject;
      if (teammateName) event.teammateName = teammateName;
      event.summary = `任务完成: ${taskSubject || taskId}${teammateName ? ` (${teammateName})` : ''}`;
      sessionUpdate._incrementTasksCompleted = true;
      break;
    }

    case 'TeammateIdle': {
      const teammateName = body.teammate_name || '';
      const teamName = body.team_name || '';
      event.teammateName = teammateName;
      if (teamName) event.teamName = teamName;
      event.summary = `队友空闲: ${teammateName}${teamName ? ` [${teamName}]` : ''}`;
      break;
    }

    case 'WorktreeCreate': {
      const wtName = body.name || body.worktree_name || '';
      const wtPath = body.worktree_path || body.path || '';
      event.worktreeName = wtName;
      if (wtPath) event.worktreePath = wtPath;
      event.summary = `工作区创建: ${wtName || wtPath}`;
      sessionUpdate._incrementWorktrees = true;
      break;
    }

    case 'WorktreeRemove': {
      const wtPath = body.worktree_path || body.path || '';
      event.worktreePath = wtPath;
      event.summary = `工作区移除: ${wtPath}`;
      sessionUpdate._decrementWorktrees = true;
      break;
    }

    case 'Elicitation': {
      const elicitMessage = body.message || body.prompt || '';
      const mcpServer = body.mcp_server || body.server_name || '';
      event.message = elicitMessage;
      if (mcpServer) event.mcpServer = mcpServer;
      event.summary = `MCP 输入请求${mcpServer ? ` [${mcpServer}]` : ''}: ${elicitMessage.substring(0, 60)}`;
      break;
    }

    case 'ElicitationResult': {
      const elicitResponse = body.response || body.result || '';
      const mcpServer = body.mcp_server || body.server_name || '';
      event.response = typeof elicitResponse === 'string'
        ? elicitResponse.substring(0, 200)
        : JSON.stringify(elicitResponse).substring(0, 200);
      if (mcpServer) event.mcpServer = mcpServer;
      event.summary = `MCP 输入响应${mcpServer ? ` [${mcpServer}]` : ''}`;
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
