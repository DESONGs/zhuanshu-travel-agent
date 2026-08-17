# Travel Agent Pi workspace package

这是 Travel Agent V1 的内部 Pi 与旅行核心工作区，不是当前对外发布的 npm 包。

- `src/contracts/`：TypeBox Schema 与 TypeScript 类型的单一合同源。
- `src/core/`：Trip Runtime 公共边界、TripStore、历史状态兼容和 TravelService Port。
- `src/runtime/trip-runtime-implementation.ts`：共享旅行状态、Decision Graph、Patch、Context Pack 与 QA 的 TypeScript 实现。
- `extensions/`：Pi 产品工具。默认只加载业务级 TravelService、Planner、Policy、Registry、模型路由、观测和受限社交读取合同。
- `../plugins/travel-agent/skills/`：产品 Skills 的唯一目录。

在仓库根目录执行 `npm test`、`npm run api` 或 `npm run mcp` 时，锁定的 `tsx` loader 会直接加载源码；不需要 `dist/`。`npm run library:build` 只用于验证编译输出，产物可随时删除并重建。

`package.json` 保持 `private: true`。未来启用 npm 发布前，需要重新审计 exports、NOTICE、完整 Pi Skills/Extensions 装载和干净 consumer 安装；不能直接把当前内部构建当作已发布产品。

本项目使用 PolyForm Noncommercial 1.0.0；商业使用需要著作权人的单独许可。
