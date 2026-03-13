const STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  WAITING_FOR_INPUT: 'waiting_for_input',
  NEEDS_ATTENTION: 'needs_attention',
  ENDED: 'ended',
};

class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = [];
  }

  push(item) {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    this.items.push(item);
  }

  toArray() {
    return [...this.items];
  }

  get length() {
    return this.items.length;
  }
}

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.globalEvents = new RingBuffer(1000);
    this.removedTokens = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
    this.removedTokensPerSession = new Map();
  }

  _createSession(id) {
    return {
      id,
      status: STATUS.ACTIVE,
      cwd: null,
      permissionMode: null,
      startedAt: Date.now(),
      lastEventAt: Date.now(),
      currentTool: null,
      pendingPermission: null,
      subagents: [],
      events: new RingBuffer(200),
      stats: { toolCalls: 0, permissions: 0, errors: 0, prompts: 0, compactions: 0, totalToolTime: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 },
      currentToolStartedAt: null,
      tokenBase: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    };
  }

  getAll() {
    const result = [];
    for (const session of this.sessions.values()) {
      result.push(this._serialize(session));
    }
    return result;
  }

  get(id) {
    const session = this.sessions.get(id);
    return session ? this._serialize(session) : null;
  }

  upsert(id, data) {
    let session = this.sessions.get(id);
    if (!session) {
      session = this._createSession(id);
      this.sessions.set(id, session);
      const prev = this.removedTokensPerSession.get(id);
      if (prev) {
        this.removedTokens.input -= prev.input;
        this.removedTokens.output -= prev.output;
        this.removedTokens.cacheRead -= prev.cacheRead;
        this.removedTokens.cacheCreate -= prev.cacheCreate;
        // Restore stats so card immediately shows old token values
        session.stats.inputTokens = prev.input;
        session.stats.outputTokens = prev.output;
        session.stats.cacheReadTokens = prev.cacheRead;
        session.stats.cacheCreateTokens = prev.cacheCreate;
        // Restore tokenBase and old transcript path (for transcript change detection)
        session.tokenBase = prev.tokenBase || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
        session._lastTranscriptPath = prev.transcriptPath;
        this.removedTokensPerSession.delete(id);
      }
    }
    Object.assign(session, data, { lastEventAt: Date.now() });
    return this._serialize(session);
  }

  addEvent(id, event) {
    let session = this.sessions.get(id);
    if (!session) {
      session = this._createSession(id);
      this.sessions.set(id, session);
    }
    const timestampedEvent = { ...event, timestamp: Date.now() };
    session.events.push(timestampedEvent);
    session.lastEventAt = Date.now();
    this.globalEvents.push({ ...timestampedEvent, sessionId: id });
    return timestampedEvent;
  }

  getEvents(id) {
    const session = this.sessions.get(id);
    return session ? session.events.toArray() : [];
  }

  getGlobalEvents() {
    return this.globalEvents.toArray();
  }

  remove(id) {
    const session = this.sessions.get(id);
    if (session) {
      this.removedTokens.input += session.stats.inputTokens || 0;
      this.removedTokens.output += session.stats.outputTokens || 0;
      this.removedTokens.cacheRead += session.stats.cacheReadTokens || 0;
      this.removedTokens.cacheCreate += session.stats.cacheCreateTokens || 0;
      this.removedTokensPerSession.set(id, {
        input: session.stats.inputTokens || 0,
        output: session.stats.outputTokens || 0,
        cacheRead: session.stats.cacheReadTokens || 0,
        cacheCreate: session.stats.cacheCreateTokens || 0,
        transcriptPath: session.transcriptPath || null,
        tokenBase: { ...(session.tokenBase || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }) },
      });
    }
    return this.sessions.delete(id);
  }

  getStats() {
    let active = 0, idle = 0, waiting = 0, needsAttention = 0, ended = 0;
    let totalInputTokens = 0, totalOutputTokens = 0, totalCacheReadTokens = 0, totalCacheCreateTokens = 0;
    for (const s of this.sessions.values()) {
      switch (s.status) {
        case STATUS.ACTIVE: active++; break;
        case STATUS.IDLE: idle++; break;
        case STATUS.WAITING_FOR_INPUT: waiting++; break;
        case STATUS.NEEDS_ATTENTION: needsAttention++; break;
        case STATUS.ENDED: ended++; break;
      }
      totalInputTokens += s.stats.inputTokens || 0;
      totalOutputTokens += s.stats.outputTokens || 0;
      totalCacheReadTokens += s.stats.cacheReadTokens || 0;
      totalCacheCreateTokens += s.stats.cacheCreateTokens || 0;
    }
    totalInputTokens += this.removedTokens.input;
    totalOutputTokens += this.removedTokens.output;
    totalCacheReadTokens += this.removedTokens.cacheRead;
    totalCacheCreateTokens += this.removedTokens.cacheCreate;
    return { total: this.sessions.size, active, idle, waiting, needsAttention, ended, globalEventCount: this.globalEvents.length, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheCreateTokens };
  }

  // Mark sessions as idle if no events received within timeoutMs
  markStale(timeoutMs) {
    const cutoff = Date.now() - timeoutMs;
    const stale = [];
    for (const [id, session] of this.sessions) {
      if (session.status !== STATUS.ENDED && session.status !== STATUS.IDLE && session.lastEventAt < cutoff && !session.currentTool) {
        session.status = STATUS.IDLE;
        stale.push(id);
      }
    }
    return stale;
  }

  prune(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    const idleCutoff = Date.now() - maxAgeMs * 2; // IDLE sessions get double the time before pruning
    const pruned = [];
    for (const [id, session] of this.sessions) {
      if (session.status === STATUS.ENDED && session.lastEventAt < cutoff) {
        this.removedTokens.input += session.stats.inputTokens || 0;
        this.removedTokens.output += session.stats.outputTokens || 0;
        this.removedTokens.cacheRead += session.stats.cacheReadTokens || 0;
        this.removedTokens.cacheCreate += session.stats.cacheCreateTokens || 0;
        this.removedTokensPerSession.set(id, {
          input: session.stats.inputTokens || 0,
          output: session.stats.outputTokens || 0,
          cacheRead: session.stats.cacheReadTokens || 0,
          cacheCreate: session.stats.cacheCreateTokens || 0,
          transcriptPath: session.transcriptPath || null,
          tokenBase: { ...(session.tokenBase || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }) },
        });
        this.sessions.delete(id);
        pruned.push(id);
      } else if (session.status === STATUS.IDLE && session.lastEventAt < idleCutoff) {
        this.removedTokens.input += session.stats.inputTokens || 0;
        this.removedTokens.output += session.stats.outputTokens || 0;
        this.removedTokens.cacheRead += session.stats.cacheReadTokens || 0;
        this.removedTokens.cacheCreate += session.stats.cacheCreateTokens || 0;
        this.removedTokensPerSession.set(id, {
          input: session.stats.inputTokens || 0,
          output: session.stats.outputTokens || 0,
          cacheRead: session.stats.cacheReadTokens || 0,
          cacheCreate: session.stats.cacheCreateTokens || 0,
          transcriptPath: session.transcriptPath || null,
          tokenBase: { ...(session.tokenBase || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }) },
        });
        this.sessions.delete(id);
        pruned.push(id);
      }
    }
    return pruned;
  }

  _serialize(session) {
    return {
      id: session.id,
      status: session.status,
      cwd: session.cwd,
      permissionMode: session.permissionMode,
      startedAt: session.startedAt,
      lastEventAt: session.lastEventAt,
      currentTool: session.currentTool,
      pendingPermission: session.pendingPermission,
      subagents: session.subagents,
      eventCount: session.events.length,
      stats: {
        toolCalls: 0, permissions: 0, errors: 0,
        prompts: 0, compactions: 0, totalToolTime: 0,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0,
        ...session.stats,
      },
    };
  }
}

module.exports = { SessionStore, STATUS };
