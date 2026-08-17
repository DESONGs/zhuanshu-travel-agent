# zhuanshu-travel-agent

The publishable, type-safe core of Zhuanshu Travel Agent. It keeps the existing Pi `0.84.1` runtime and exposes stable ESM subpaths:

- `zhuanshu-travel-agent/core`
- `zhuanshu-travel-agent/contracts`
- `zhuanshu-travel-agent/providers`
- `zhuanshu-travel-agent/mcp`
- `zhuanshu-travel-agent/pi`

The Web application, HTTP deployment server, native shells, Mini Programs, credentials, runtime data, fixtures, and internal Wiki are intentionally not part of this package.

This package is licensed under PolyForm Noncommercial 1.0.0. Commercial use requires a separate license from the licensor.

Before publishing from the repository root, run `npm run release:check`. The gate lints the package, inspects the tarball, installs the actual tgz in an isolated consumer, compiles its public declarations, audits production dependencies, and loads the exported tools through Pi `0.84.1`.
