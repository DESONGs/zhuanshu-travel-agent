# Travel Agent 小程序工程

这里保存两份无编译器依赖的官方原生小程序工程：

- `wechat/`：微信开发者工具导入此目录。
- `alipay/`：支付宝小程序开发者工具导入此目录。

两者都以自然语言对话作为首页：登录后创建或恢复旅行对话，用户直接描述需求，Agent 持续理解补充信息，再在同一页展示吃、住、行、玩的候选、地点图片和地图标记。用户不需要先手工添加行程。所有旅行状态读写继续访问 Travel Agent HTTP API，候选确认也走同一业务合同。

`/api/auth/platform-exchange` 已实现微信 `code2Session` 与支付宝授权码 RSA2 交换/验签。提交前仍需由持有主体写入真实 AppID，在平台后台登记 `app.js` 中 API 地址对应的 HTTPS request domain，并把平台 Secret 或 RSA 密钥路径放入服务端环境；支付宝 Web 和小程序支持独立 AppID 与密钥。完成真机 smoke 后才能声称登录可用。真实地点、图片和地图还需要服务端配置高德 Web 服务 Key；缺少时小程序会保留对话内容并明确说明暂时无法取得实时候选。

先在项目根目录运行 `npm run auth:setup` 与 `npm run auth:check`。人工字段、回调地址、微信 UnionID 绑定和各渠道 smoke 步骤见[部署与配置指南](../../wiki/current/09-account-configuration-guide.md)。

没有这些配置时，应用会明确显示“登录渠道尚未配置”，不会生成模拟用户、固定地点、路线、设施或库存。
