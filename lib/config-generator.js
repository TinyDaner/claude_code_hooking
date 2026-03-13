function generateConfig(host = 'localhost', port = 3456) {
  const url = `http://${host}:${port}/hooks/event`;
  const hookEntry = [{ hooks: [{ type: 'http', url, timeout: 5 }] }];

  return {
    hooks: {
      SessionStart: hookEntry,
      PreToolUse: hookEntry,
      PostToolUse: hookEntry,
      PermissionRequest: hookEntry,
      Notification: hookEntry,
      Stop: hookEntry,
      SessionEnd: hookEntry,
      SubagentStart: hookEntry,
      SubagentStop: hookEntry,
      UserPromptSubmit: hookEntry,
      PostToolUseFailure: hookEntry,
      PreCompact: hookEntry,
      ConfigChange: hookEntry,
    },
  };
}

function generateFullSettings(host = 'localhost', port = 3456) {
  return {
    ...generateConfig(host, port),
    allowedHttpHookUrls: ['http://localhost:*'],
  };
}

module.exports = { generateConfig, generateFullSettings };
