# 第三方候选与审计台账

更新时间：2026-08-15。此文记录调研、固定版本和采纳门槛；每一行的状态以该行结论为准，不能把候选或开发 smoke 推断成生产授权。

## 结论矩阵

| 能力 | 候选 / 固定版本 | 许可与状态 | 决策 |
| --- | --- | --- | --- |
| 参考 Runtime | `DESONGs/assignment-agent@0602f134f65052f7617d417a221f7d31d29746ef` | 用户授权内部迁移来源 | 迁移控制面模式；不迁移会议/飞书代码。 |
| 小红书主候选 | `jackwener/OpenCLI@a86d64705c526dc710f790e66cfcabf6ecf786b9` | Apache-2.0；有浏览器与账户风险 | 仅隔离审计候选，限定读操作。禁用其全部写面。 |
| 小红书对照 | `xpzouying/xiaohongshu-mcp@da9ba0365e176bc0eb11885f1941271d895feb73` | Apache-2.0 | 同上。仅 search/read/comments，comments 只读。 |
| 小红书对照 | `lucasygu/redbook@1435483c64d8290dcf6e10a74be3586b8921cd66` | MIT | 仅审计；Cookie/签名与浏览器读取是高风险点。 |
| 抖音主候选 | `jackwener/OpenCLI@a86d64705c526dc710f790e66cfcabf6ecf786b9` | Apache-2.0 | 仅检索、详情、分享链接；禁用发布。 |
| 抖音对照 | `tamnd/douyin-cli@b70c8d7e3f650023aada02013aa75850f67f0222` | Apache-2.0 | 仅隔离只读 smoke 后考虑。 |
| 抖音对照 | `Youhai020616/douyin@deab86dfa0168b911004cba6336b597f500be858` | MIT | 仅借鉴/对照，需验证维护与写面。 |
| 微信 | 用户提供文章链接 + 自研受限读取器 | 依平台条款 | 生产读取受链接与条款约束。 |
| 微信借鉴 | `jj-cheng25/weixin-articles-mcp@060fb3dd7e41d1c0950a19bc1367d66a6881f915` | MIT，但声明个人/研究用途 | 不作为商业生产依赖。 |
| 地图/天气 | 高德官方 MCP | 官方服务，需账号/条款 | 中国 POI、路线、天气与导航主路径。 |
| 飞猪库存 | `alibaba-flyai/flyai-skill@54277b27b68e53741954c08541faedba1d45cc7b`、`@fly-ai/flyai-cli@1.0.16` | MIT；官方项目和 npm 包 | 固定包已以 `--ignore-scripts` 安装；酒店、航班、火车、POI 通过受限 child process 完成 guest 只读 smoke。生产仍需 FlyAI Key。 |
| 途牛库存 | `tuniucorp/tuniu-cli@a47243dae54e010a993908fcfe4b3edcf716fb7c`；本项目不安装 CLI | MIT；官方项目 | CLI postinstall 会写多个用户 Home，故只审计不安装。使用自研固定官方端点 MCP 客户端，Key 与真实 smoke 前禁用。 |
| 铁路社区候选 | `Joooook/12306-mcp@ff6439da6f63d7d72181abea4568abd69878c600` | MIT，但 README 声明仅学习；直接访问 12306 并处理 Cookie | 不合入生产。许可证不代表铁路数据与账号调用授权；改用飞猪/途牛查询和官方/授权渠道跳转。 |
| 携程商旅/华住会 | 官方企业 MCP 或 B2B API | 商务合同与企业凭据 | 作为企业版候选，未获授权前不进入 Capability Registry。 |
| 本地生活 | 高德、商家官方资料 | 取决于 Provider | `mcp-dianping` 有同步/异步混用与城市表硬编码风险，不直接复用。 |

## 只借鉴或排除

| 项目 | 处理 | 原因 |
| --- | --- | --- |
| `LAMDA-NeSy/ChinaTravel@456b60…` | 只借鉴 | 约束分类与符号校验有价值，许可不明确，不复制代码或数据。 |
| `OSU-NLP-Group/TravelPlanner@e52c87…` | 只借鉴 | 四域完整性与约束评测有价值；MIT 审计后才考虑少量评测结构。 |
| `AMAP-ML/MobilityBench@c05a…` | 只借鉴 | 路线调用、结果有效性和回放沙箱有价值；许可明确前不复制。 |
| GroupTravelBench | 只借鉴 | 多人偏好获取、冲突协调与公平可作为验收维度。 |
| `borski/travel-hacking-toolkit@593dd…` | 只借鉴 | Tool/Reference Skill、来源优先级与失败回退模式可参考。 |
| `liketrek/TREK` | 排除 | AGPL。 |
| `trvl` | 排除 | 非商业许可。 |
| `yzfly/douyin-mcp-server` | 排除 | 已归档，且含下载/再分发风险。 |

## `third-party-audit-v1` 最小记录

每个候选的真实审计需生成如下字段，存放在受控研究目录而非主代码：

```json
{
  "schemaVersion": "third-party-audit-v1",
  "candidate": "owner/repo",
  "commit": "40-char-sha",
  "license": "SPDX-or-unresolved",
  "maintenance": "active|stale|archived",
  "installMode": "lockfile-ignore-scripts",
  "outboundDomains": [],
  "credentials": "none|dedicated-browser-profile|api-key",
  "writeSurface": [],
  "disabledPaths": [],
  "staticReview": "pending|passed|failed",
  "isolatedSmoke": "not-run|passed_read_only_isolated|failed",
  "adoption": "blocked|borrow-only|eligible"
}
```

只有 `isolatedSmoke: passed_read_only_isolated` 和 `adoption: eligible` 才可以把 Provider 从 Registry 的 `blocked` 改为可用。

## 已采用 Provider 审计摘要

```json
{
  "schemaVersion": "third-party-audit-v1",
  "candidate": "@fly-ai/flyai-cli",
  "version": "1.0.16",
  "sourceRepo": "alibaba-flyai/flyai-skill",
  "commit": "54277b27b68e53741954c08541faedba1d45cc7b",
  "license": "MIT",
  "installMode": "lockfile-ignore-scripts",
  "outboundDomains": ["flyai.open.fliggy.com", "router.feizhu.com", "*.alicdn.com"],
  "credentials": "optional-server-api-key",
  "writeSurface": ["dedicated-worker-home/device-id"],
  "disabledPaths": ["arbitrary-command", "shell", "booking", "global-config", "user-home"],
  "staticReview": "passed_with_isolation_required",
  "isolatedSmoke": "passed_read_only_isolated_guest",
  "adoption": "eligible_development_only_until_production_key"
}
```
