// WebSocket client with auto-reconnect
class WebSocketManager {
  constructor() {
    this.listeners = {};
    this.ws = null;
    this.retryDelay = 1000;
    this.maxRetryDelay = 30000;
    this.indicator = document.getElementById('ws-indicator');
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.retryDelay = 1000;
      this._setStatus('connected');
      this._emit('open');
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this._emit('message', data);
        if (data.type) {
          this._emit(data.type, data);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      this._setStatus('reconnecting');
      this._emit('close');
      this._reconnect();
    };

    this.ws.onerror = () => {
      this._setStatus('disconnected');
    };
  }

  _reconnect() {
    setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 1.5, this.maxRetryDelay);
      this.connect();
    }, this.retryDelay);
  }

  _setStatus(status) {
    if (this.indicator) {
      if (status === 'reconnecting') {
        this.indicator.className = 'ws-indicator reconnecting';
        this.indicator.innerHTML = '↻';
        this.indicator.title = 'WebSocket 重连中...';
      } else {
        this.indicator.className = `ws-indicator ${status}`;
        this.indicator.innerHTML = '';
        const statusText = { connected: '已连接', disconnected: '已断开' };
        this.indicator.title = `WebSocket ${statusText[status] || status}`;
      }
    }
  }

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  _emit(event, data) {
    const fns = this.listeners[event];
    if (fns) fns.forEach(fn => fn(data));
  }
}
