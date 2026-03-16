const https = require('https');

class FeishuClient {
  constructor(appId, appSecret) {
    this._appId = appId || '';
    this._appSecret = appSecret || '';
    this._token = null;
    this._tokenExpiresAt = 0;
  }

  updateCredentials(appId, appSecret) {
    if (appId !== this._appId || appSecret !== this._appSecret) {
      this._appId = appId || '';
      this._appSecret = appSecret || '';
      this._token = null;
      this._tokenExpiresAt = 0;
    }
  }

  async _ensureToken() {
    // Refresh if expired or within 5 minutes of expiring
    if (this._token && Date.now() < this._tokenExpiresAt - 5 * 60 * 1000) {
      return this._token;
    }
    if (!this._appId || !this._appSecret) {
      throw new Error('Feishu app_id or app_secret not configured');
    }
    const body = JSON.stringify({
      app_id: this._appId,
      app_secret: this._appSecret,
    });
    const resp = await this._request('POST', '/open-apis/auth/v3/tenant_access_token/internal', body, false);
    if (resp.code !== 0) {
      throw new Error(`Token request failed: ${resp.msg || JSON.stringify(resp)}`);
    }
    this._token = resp.tenant_access_token;
    this._tokenExpiresAt = Date.now() + (resp.expire || 7200) * 1000;
    return this._token;
  }

  async sendCard(receiveIdType, receiveId, card) {
    const token = await this._ensureToken();
    const body = JSON.stringify({
      receive_id: receiveId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    });
    const resp = await this._request(
      'POST',
      `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      body,
      true,
      token
    );
    if (resp.code !== 0) {
      throw new Error(`Send card failed: ${resp.msg || JSON.stringify(resp)}`);
    }
    return resp.data;
  }

  async updateCard(messageId, card) {
    const token = await this._ensureToken();
    const body = JSON.stringify({
      content: JSON.stringify(card),
    });
    const resp = await this._request(
      'PATCH',
      `/open-apis/im/v1/messages/${messageId}`,
      body,
      true,
      token
    );
    if (resp.code !== 0) {
      throw new Error(`Update card failed: ${resp.msg || JSON.stringify(resp)}`);
    }
    return resp.data;
  }

  async testConnection(chatId) {
    const cards = require('./cards');
    const card = cards.buildTestCard();
    return await this.sendCard('chat_id', chatId, card);
  }

  _request(method, apiPath, body, withAuth, token) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'open.feishu.cn',
        port: 443,
        path: apiPath,
        method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      };
      if (withAuth && token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('Request timeout'));
      });
      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = { FeishuClient };
