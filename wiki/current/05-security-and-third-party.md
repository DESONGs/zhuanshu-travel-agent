# 安全、第三方与上线边界

## 第三方安全门

1. GitHub API 预筛许可、维护状态和入口。
2. 仅以固定 SHA 克隆至 `/private/tmp/travel-agent-research/`，不直接进入工作区。
3. 安装前检查 lifecycle script、锁、二进制、出站域、环境变量、文件写入、子进程、遥测、Cookie 和全部写命令。
4. 使用锁文件和禁用 lifecycle script 安装；不得 global install，postinstall 不得写入用户 Home。
5. 在无凭据、只读文件系统、非 root、临时 Home、受限网络环境中构建。
6. 先做无登录 smoke，再以专用账号与专用浏览器 profile 做真实只读 smoke。
7. 生成 `third-party-audit-v1`：版本、SHA、许可证、依赖、出站域、凭据、写面、风险、禁用路径、测试证据和结论。
8. 仅 `passed_read_only_isolated` 的候选可进入 Capability Registry。

## 社交 Worker 边界

Pi 主进程不接触 Cookie。Worker 没有通用 Shell、浏览器 eval、任意 URL、社交写操作或原始媒体下载；正文是不可相信的数据，不能被当作 Agent 指令。遇到验证码、风控或限流，立即返回结构化失败并降级。

## 数据与隐私

Cookie、Token、证件、支付字段、手机号、浏览器配置不进入 Prompt、日志、metrics 或 artifact。Web 仅以 `HttpOnly` session cookie 维持登录；原生与小程序只经受控 authorization-code exchange 获得会话。支付和身份动作永远发生在用户与授权渠道之间，Agent 仅提供可理解的 handoff。

模型密钥只允许存放在服务端环境或权限为 `0600` 的被忽略 `env_travel.local`；运行时只读取白名单键，公开状态接口不返回任何密钥。多模态 Parent Agent 只接受用户主动上传的少量标准图片，不使用社交 Worker 的原媒体，也不持久化上传文件。图片内文字按 Prompt Injection 处理；人脸、证件、支付、联系方式、账号凭据与私密二维码不得识别或复述。

## 许可与归属

本仓库原创代码采用 PolyForm Noncommercial License 1.0.0，见根目录 `LICENSE`；符合许可证定义的非商业使用、修改和分发可被许可，任何预期商业应用均需另行获得书面授权。该许可证包含商业用途限制，因此本项目准确表述为 source-available，而不是 OSI 认证的开源项目。

该项目许可证不替代或收紧第三方组件自身的许可证；归属与 Required Notice 见根目录 `NOTICE`。参考项目的通用控制面只作为用户授权的内部迁移来源，未将会议领域代码转入本仓库。外部候选的许可证与采纳结论见研究区；AGPL、与项目授权冲突、归档或无明确许可证候选不直接合入。

## 当前验证事实

- 固定版本依赖以 `npm install --ignore-scripts` 安装，未执行 package lifecycle script；依赖审计结果为 `0 vulnerabilities`。
- Pi CLI 扩展加载 smoke 使用临时 `HOME`、`PI_OFFLINE=1` 和 `PI_TELEMETRY=0`，没有使用 Provider 凭据，也没有接触社交账号。
- 本机已升级为 Node `26.7.0`，满足 Pi `0.84.1` 的 `>=22.19.0` 门槛；Pi package 已被 CLI 正确发现。模型对话仍需显式 Provider 凭据，外部旅行 Provider 仍需各自授权与真实 smoke。
