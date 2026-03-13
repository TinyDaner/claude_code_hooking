# Claude Code Monitor Dashboard

**[中文](#中文) | [English](#english)**

---

<a id="english"></a>

## English

A real-time multi-terminal Claude Code monitoring dashboard. Receives events via HTTP Hooks and pushes them to the browser through WebSocket.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933)
![Express](https://img.shields.io/badge/Express-4.x-000000)
![WebSocket](https://img.shields.io/badge/WebSocket-Realtime-blue)

### Features

- **Multi-terminal Monitoring** — Monitor multiple Claude Code instances simultaneously
- **Real-time Event Stream** — WebSocket push with < 100ms latency
- **Session Management** — Auto-track session lifecycle (Start → Tool Use → End)
- **Permission Alerts** — Alert banners + browser notifications for permission requests / prolonged idle
- **Subagent Tracking** — Display subagent start and stop events
- **Event Filtering** — Click a session card to filter events for that session
- **Light / Dark Theme** — Follow system preference or toggle manually, auto-saved
- **Responsive Layout** — Desktop, tablet, mobile (5 breakpoints + touch optimization)
- **Auto Cleanup** — Ended sessions are automatically removed after 1 hour

### Quick Start

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Start the Server

```bash
npm start
```

The server runs at `http://localhost:3456` by default.

Auto-open browser:

```bash
node server.js --open
```

Custom port:

```bash
PORT=8080 npm start
```

#### 3. Configure Claude Code

Add the following to `~/.claude/settings.json` (or click the ⚙ button in the dashboard to copy):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PreToolUse": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "Notification": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PostToolUseFailure": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "ConfigChange": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ]
  },
  "allowedHttpHookUrls": [
    "http://localhost:*"
  ]
}
```

#### 4. Start Using

After configuration, launch Claude Code in any terminal. The dashboard will automatically capture and display events in real time.

### Dashboard UI

#### Navigation Bar

| Element | Description |
|---------|-------------|
| Status Stats | Running / Waiting / Attention-needed session counts |
| Connection Indicator | Green = WebSocket connected, Red = disconnected (auto-reconnect) |
| ⚙ Button | View Hook config JSON, one-click copy |
| ☀ / ☾ Button | Toggle light / dark theme |

#### Session Cards

Each Claude Code instance is shown as a card with:

- **Status** — Green dot = running, Yellow blink = waiting for input, Red blink = needs attention, Gray = ended
- **Working Directory** — Current Claude Code working path
- **Current Tool** — Tool currently being executed
- **Uptime** — Time since session started
- **Subagents** — Active subagent tags
- **Statistics** — Tool call count, permission request count

Click a card to filter event log. Click × to manually remove a session.

#### Event Log

Chronological display of all Hook events:

- **Timestamp** — Local time of the event
- **Session ID** — First 6 characters of session ID
- **Event Type** — Color-coded labels (SessionStart / PreToolUse / PostToolUse, etc.)
- **Details** — Tool name, file path, command summary, etc.

#### Alert Banners

Alert banners appear at the top of the page when:

- **Permission Request** — An instance is waiting for user authorization (yellow)
- **Prolonged Idle** — An instance may be stuck (red)

Click a banner to jump to the corresponding session. Banners auto-dismiss after 15 seconds. Browser notifications are triggered when the page is in the background.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/hooks/event` | Receive Claude Code Hook events |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get single session details |
| GET | `/api/sessions/:id/events` | Get session event history |
| DELETE | `/api/sessions/:id` | Delete a session |
| GET | `/api/events` | Get global event log |
| GET | `/api/stats` | Get status statistics |
| GET | `/api/config` | Get Hook config JSON |

### Project Structure

```
claude-hook-monitor/
├── server.js                 # Express + WebSocket server
├── package.json
├── lib/
│   ├── session-store.js      # Session storage (in-memory + ring buffer)
│   ├── hook-router.js        # Hook request handling & broadcast
│   ├── event-processor.js    # Event parsing & session state updates
│   ├── config-generator.js   # Config JSON generation
│   └── terminal-checker.js   # Terminal window detection & orphan cleanup
└── public/
    ├── index.html            # Dashboard page
    ├── css/style.css         # Styles (Apple design style)
    ├── js/
    │   ├── app.js            # Entry point, component orchestration
    │   ├── ws.js             # WebSocket client (exponential backoff reconnect)
    │   ├── dashboard.js      # Session grid management
    │   ├── session-card.js   # Session card component
    │   ├── event-log.js      # Event log panel
    │   ├── alerts.js         # Alert banners + browser notifications
    │   └── theme.js          # Theme toggle
    └── assets/favicon.svg
```

### Technical Details

- **No Database** — All data is stored in memory, cleared on server restart
- **Ring Buffer** — Global: last 1000 events; per-session: last 200 events
- **Auto Cleanup** — Ended sessions pruned after 1 hour; orphan sessions (closed terminal) removed after 30 seconds
- **Non-blocking** — Hook endpoint always returns success, never blocks Claude Code
- **Reconnect** — WebSocket exponential backoff reconnect (1s → 30s)

---

<a id="中文"></a>

## 中文

多终端 Claude Code 实时监控仪表盘，通过 HTTP Hooks 接收事件，WebSocket 推送至浏览器。

![Node.js](https://img.shields.io/badge/Node.js-18+-339933)
![Express](https://img.shields.io/badge/Express-4.x-000000)
![WebSocket](https://img.shields.io/badge/WebSocket-实时推送-blue)

### 功能特性

- **多终端监控** — 同时监控多个 Claude Code 实例的运行状态
- **实时事件流** — WebSocket 推送，延迟 < 100ms
- **会话管理** — 自动跟踪会话生命周期（启动 → 工具调用 → 结束）
- **权限提醒** — 权限请求 / 长时间闲置自动弹出告警横幅 + 浏览器通知
- **子代理追踪** — 显示子代理的启动与停止
- **事件筛选** — 点击会话卡片过滤该会话的事件日志
- **亮色 / 暗色主题** — 跟随系统或手动切换，偏好自动保存
- **响应式布局** — 适配桌面、平板、手机（5 个断点 + 触屏优化）
- **自动清理** — 已结束会话超过 1 小时自动回收

### 快速开始

#### 1. 安装依赖

```bash
npm install
```

#### 2. 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3456`。

自动打开浏览器：

```bash
node server.js --open
```

自定义端口：

```bash
PORT=8080 npm start
```

#### 3. 配置 Claude Code

将以下内容添加到 `~/.claude/settings.json`（也可在仪表盘中点击 ⚙ 按钮一键复制）：

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PreToolUse": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "Notification": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PostToolUseFailure": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ],
    "ConfigChange": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3456/hooks/event", "timeout": 5 }] }
    ]
  },
  "allowedHttpHookUrls": [
    "http://localhost:*"
  ]
}
```

#### 4. 开始使用

配置完成后，在任意终端启动 Claude Code，监控台会自动捕获事件并实时显示。

### 界面说明

#### 导航栏

| 元素 | 说明 |
|------|------|
| 状态统计 | 显示运行中 / 等待中 / 需关注的会话数 |
| 连接指示灯 | 绿色 = WebSocket 已连接，红色 = 已断开（自动重连） |
| ⚙ 按钮 | 查看 Hook 配置 JSON，一键复制 |
| ☀ / ☾ 按钮 | 切换亮色 / 暗色主题 |

#### 会话卡片

每个 Claude Code 实例显示为一张卡片，包含：

- **状态指示** — 绿色圆点 = 运行中，黄色闪烁 = 等待输入，红色闪烁 = 需关注，灰色 = 已结束
- **工作目录** — 当前 Claude Code 的工作路径
- **当前工具** — 正在执行的工具名称
- **运行时长** — 自会话启动以来的时间
- **子代理** — 活跃的子代理标签
- **统计数据** — 工具调用次数、权限请求次数

点击卡片可筛选事件日志，仅显示该会话的事件。点击 × 按钮可手动移除会话。

#### 事件日志

按时间顺序显示所有 Hook 事件，包含：

- **时间戳** — 事件发生的本地时间
- **会话标识** — 会话 ID 的前 6 位
- **事件类型** — 彩色标签区分不同类型（SessionStart / PreToolUse / PostToolUse 等）
- **事件详情** — 工具名称、文件路径、命令等摘要信息

#### 告警横幅

当检测到以下情况时，页面顶部会弹出告警横幅：

- **权限请求** — 某个实例正在等待用户授权（黄色）
- **长时间闲置** — 某个实例可能卡住了（红色）

点击横幅可跳转到对应会话。横幅会在 15 秒后自动消失。如果页面在后台，还会触发浏览器通知。

### 响应式适配

| 宽度 | 设备 | 适配策略 |
|------|------|----------|
| > 1024px | 桌面 | 多列网格，完整导航栏 |
| ≤ 1024px | 平板横屏 | 网格 minmax 280px，间距收紧 |
| ≤ 768px | 平板竖屏 | 统计栏隐藏文字只留数字 + 圆点 |
| ≤ 600px | 大屏手机 | 隐藏统计栏，单列网格，事件详情换行 |
| ≤ 480px | 手机竖屏 | 隐藏标题，44px 触摸目标，弹窗底部滑出 |
| ≤ 360px | 小屏手机 | 进一步缩小间距 |

触屏设备自动隐藏滚动条，启用惯性滚动。

### API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/hooks/event` | 接收 Claude Code Hook 事件 |
| GET | `/api/sessions` | 获取所有会话列表 |
| GET | `/api/sessions/:id` | 获取单个会话详情 |
| GET | `/api/sessions/:id/events` | 获取会话事件历史 |
| DELETE | `/api/sessions/:id` | 删除会话 |
| GET | `/api/events` | 获取全局事件日志 |
| GET | `/api/stats` | 获取状态统计 |
| GET | `/api/config` | 获取 Hook 配置 JSON |

### 项目结构

```
claude-hook-monitor/
├── server.js                 # Express + WebSocket 服务器
├── package.json
├── lib/
│   ├── session-store.js      # 会话存储（内存 + 环形缓冲区）
│   ├── hook-router.js        # Hook 请求处理与广播
│   ├── event-processor.js    # 事件解析与会话状态更新
│   ├── config-generator.js   # 配置 JSON 生成
│   └── terminal-checker.js   # 终端窗口检测与孤儿会话清理
└── public/
    ├── index.html            # 仪表盘页面
    ├── css/style.css         # 样式（Apple 设计风格）
    ├── js/
    │   ├── app.js            # 入口，组件协调
    │   ├── ws.js             # WebSocket 客户端（指数退避重连）
    │   ├── dashboard.js      # 会话网格管理
    │   ├── session-card.js   # 会话卡片组件
    │   ├── event-log.js      # 事件日志面板
    │   ├── alerts.js         # 告警横幅 + 浏览器通知
    │   └── theme.js          # 主题切换
    └── assets/favicon.svg
```

### 技术细节

- **无数据库** — 所有数据保存在内存中，服务重启后清空
- **环形缓冲区** — 全局保留最近 1000 条事件，每会话保留 200 条
- **自动清理** — 已结束会话超过 1 小时清理；孤儿会话（终端窗口关闭）30 秒后清除
- **非阻塞** — Hook 端点始终返回成功，不会阻塞 Claude Code 执行
- **断线重连** — WebSocket 断开后指数退避重连（1s → 30s）

### License / 许可证

MIT
