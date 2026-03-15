# 更新日志

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
