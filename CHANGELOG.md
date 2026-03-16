# 更新日志

## [1.1.0] - 2026-03-16

### 新增
- **飞书机器人集成**：实时告警推送到飞书群聊/私聊
  - 5 个后端模块：API 客户端、通知引擎、卡片模板、定时调度、配置管理
  - 零新依赖，使用 Node.js 原生 `https` 模块调用飞书 API
  - Token 自动缓存与刷新（2h 有效期，过期前 5 分钟自动续期）
- **告警卡片**：支持 8 种事件的智能告警（权限请求、工具失败、需关注通知、状态变更、等待超时、异常结束、会话启动、子代理启动）
  - 红/橙/蓝/绿 4 色卡片，按优先级区分
  - 卡片内置 3 个按钮：确认、静默 30 分钟、打开面板
- **告警策略**：去重窗口、静默机制、超时升级、聚合窗口
  - 同会话同类型事件 N 秒内自动去重
  - 静默期间不再推送该会话告警
  - WAITING_FOR_INPUT 超时自动升级为红色告警
  - 短时间内多条告警聚合为一张摘要卡片
- **飞书卡片回调**：支持在飞书内直接操作（确认/静默），卡片实时更新状态
- **定时摘要报告**：可配置 30m/1h/2h/4h/1d 频率，推送会话状态和 Token 用量汇总
- **Dashboard 设置页**：navbar 新增飞书铃铛按钮，弹窗包含 5 个配置区域
  - 连接设置（App ID / Secret + 状态指示器）
  - 推送目标（群聊 chat_id + 私聊 open_id）
  - 告警规则（8 种事件开关 + 优先级 + 去重/超时/升级/聚合参数）
  - 定时报告（开关 + 频率选择）
  - 回调地址（只读显示 + 一键复制）
- 配置持久化到 `data/feishu-config.json`，凭证自动脱敏，`data/` 目录已 gitignore

## [1.0.1] - 2026-03-15

### 新增
- 支持全部 21 个 Claude Code hook 事件（新增 8 个：PostCompact、InstructionsLoaded、TaskCompleted、TeammateIdle、WorktreeCreate、WorktreeRemove、Elicitation、ElicitationResult）
- 增强已有事件的字段提取（model、source、agent_type、tool_response、reason 等）
- 会话卡片显示模型名称和代理类型
- 新增统计指标：指令加载数、任务完成数、工作区数
- 压缩耗时计算（PostCompact 与 PreCompact 配对）
- 8 个新事件类型的图标和颜色样式

## [1.0.0] - 2026-03-14

### 新增
- 初始版本：实时监控 Claude Code 会话的 Dashboard
- 支持 13 个 hook 事件
- WebSocket 实时推送
- 会话卡片展示（状态、工具、token 用量、费用估算）
- 事件日志面板
- 多会话管理
- 导航栏版本号显示
