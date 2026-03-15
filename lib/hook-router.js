const { processHookEvent } = require('./event-processor');

function createHookRouter(store, broadcast, cancelRemoval) {
  return function handleHook(req, res) {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      const { event, sessionUpdate } = processHookEvent(body);
      const sessionId = event.sessionId;

      // New event arrived — terminal is still alive, cancel any pending removal
      if (cancelRemoval) cancelRemoval(sessionId);

      // Save old transcriptPath before upsert (for transcript change detection)
      const oldTranscriptPath = store.sessions.get(sessionId)?.transcriptPath || null;

      // Apply special update flags
      const existing = store.get(sessionId);
      const updateData = { ...sessionUpdate };
      delete updateData._incrementToolCalls;
      delete updateData._incrementPermissions;
      delete updateData._addSubagent;
      delete updateData._removeSubagent;
      delete updateData._incrementPrompts;
      delete updateData._incrementCompactions;
      delete updateData._addToolTime;
      delete updateData._incrementErrors;
      delete updateData._setTokens;
      delete updateData._preCompactTimestamp;
      delete updateData._postCompactTimestamp;
      delete updateData._incrementInstructionsLoaded;
      delete updateData._incrementTasksCompleted;
      delete updateData._incrementWorktrees;
      delete updateData._decrementWorktrees;

      const session = store.upsert(sessionId, updateData);

      // Handle stat increments and subagent changes on the raw session
      const rawSession = store.sessions.get(sessionId);
      if (rawSession) {
        if (sessionUpdate._incrementToolCalls) rawSession.stats.toolCalls++;
        if (sessionUpdate._incrementPermissions) rawSession.stats.permissions++;
        if (sessionUpdate._addSubagent) {
          if (!rawSession.subagents.includes(sessionUpdate._addSubagent)) {
            rawSession.subagents.push(sessionUpdate._addSubagent);
          }
        }
        if (sessionUpdate._removeSubagent) {
          rawSession.subagents = rawSession.subagents.filter(a => a !== sessionUpdate._removeSubagent);
        }
        if (sessionUpdate._incrementErrors) rawSession.stats.errors++;
        if (sessionUpdate._incrementPrompts) rawSession.stats.prompts++;
        if (sessionUpdate._incrementCompactions) rawSession.stats.compactions++;
        if (sessionUpdate._preCompactTimestamp) rawSession._preCompactTimestamp = sessionUpdate._preCompactTimestamp;
        if (sessionUpdate._postCompactTimestamp && rawSession._preCompactTimestamp) {
          const compactDuration = sessionUpdate._postCompactTimestamp - rawSession._preCompactTimestamp;
          event.compactDuration = compactDuration;
          rawSession._preCompactTimestamp = null;
        }
        if (sessionUpdate._incrementInstructionsLoaded) {
          rawSession.stats.instructionsLoaded = (rawSession.stats.instructionsLoaded || 0) + 1;
        }
        if (sessionUpdate._incrementTasksCompleted) {
          rawSession.stats.tasksCompleted = (rawSession.stats.tasksCompleted || 0) + 1;
        }
        if (sessionUpdate._incrementWorktrees) {
          rawSession.stats.worktrees = (rawSession.stats.worktrees || 0) + 1;
        }
        if (sessionUpdate._decrementWorktrees) {
          rawSession.stats.worktrees = Math.max(0, (rawSession.stats.worktrees || 0) - 1);
        }
        if (sessionUpdate._setTokens) {
          const newTranscript = body.transcript_path;
          // Use pre-upsert value (existing session) or restored value (rebuilt session)
          const effectiveOldTranscript = oldTranscriptPath || rawSession._lastTranscriptPath;

          if (effectiveOldTranscript && newTranscript && effectiveOldTranscript !== newTranscript) {
            // Transcript changed → current stats become the new base
            rawSession.tokenBase = {
              input: rawSession.stats.inputTokens || 0,
              output: rawSession.stats.outputTokens || 0,
              cacheRead: rawSession.stats.cacheReadTokens || 0,
              cacheCreate: rawSession.stats.cacheCreateTokens || 0,
            };
          }
          if (rawSession._lastTranscriptPath) delete rawSession._lastTranscriptPath;

          const base = rawSession.tokenBase || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
          rawSession.stats.inputTokens = base.input + sessionUpdate._setTokens.input_tokens;
          rawSession.stats.outputTokens = base.output + sessionUpdate._setTokens.output_tokens;
          rawSession.stats.cacheReadTokens = base.cacheRead + (sessionUpdate._setTokens.cache_read_input_tokens || 0);
          rawSession.stats.cacheCreateTokens = base.cacheCreate + (sessionUpdate._setTokens.cache_creation_input_tokens || 0);
        }
        if (sessionUpdate._addToolTime && rawSession.currentToolStartedAt) {
          const duration = Date.now() - rawSession.currentToolStartedAt;
          rawSession.stats.totalToolTime += duration;
          event.toolDuration = duration;
          rawSession.currentToolStartedAt = null;
        }
      }

      const storedEvent = store.addEvent(sessionId, event);

      // Broadcast to connected clients
      broadcast({
        type: 'event',
        sessionId,
        event: storedEvent,
        session: store.get(sessionId),
        stats: store.getStats(),
      });

      // Return empty result — pure monitoring, don't block anything
      res.json({});
    } catch (err) {
      console.error('Hook processing error:', err);
      res.json({}); // Don't fail the hook
    }
  };
}

module.exports = { createHookRouter };
