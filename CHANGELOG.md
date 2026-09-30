# 更新日志 · Changelog

本文件记录本插件的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。版本号规范与发布流程见
[README · 版本与 Releases](README.md#版本与-releases)。

## [Unreleased]

## [1.0.0] - 2026-09-30

首个公开发布版本。

### 新增

- **侧边栏入口**：在 插件／计划 附近新增「已归档会话」页面（`sidebar.panellist` 注册入口，`main` 键控槽渲染面板）。
- **归档会话列表**：按最近活动时间倒序，显示标题、时间、工作目录、占用空间与文件数；记录在归档集合里但目录已不在硬盘上的会话会标注「文件已不在」。
- **彻底删除**：每行唯一操作，两步确认（`彻底删除` → `确认删除`）后不可撤销，返回 `{ sessionId, directory, cache }` 说明目录与缓存是否真的被移除。
- **删除顺序**：停止会话活动 → 摘掉归档标记 → 解除工作区归属 → 摘掉内存里的会话 → 删除投影缓存 → 删除整个会话目录 → 删除缓存文件 → 通知界面。顺序保证删除中断也不会留下「注册表里有、却打不开」的幽灵行。
- **安全边界**：只处理确实处于归档集合里的会话；拒绝删除正在跑回合的会话（只是还开在界面里不再阻止）；只用 `node:fs` 与解析出的绝对路径删除，不走 shell 命令。
- **宿主版本自检**：`list()` 返回本版本暴露的端点清单，面板发现宿主读到的是旧模块时直接说明原因并禁用删除，而不是抛一个 404。
- **中英双语**：随 DSH 语言切换，文本走 `ctx.locale`。
- **零运行时依赖**：没有第三方依赖，没有构建步骤，没有安装脚本。

### 说明

- 兼容性基线：`@deepseek-ai/dsh-desktop` **0.2.0-rc.1**。插件依赖 DSH 的内部接口（Context `reflect`/`provide`、Typert Remote 网关、`slots`、`locale`、`storageDomain`、`workspaceRegistry`），DSH 升级后可能需要跟进。
- 测试覆盖：宿主半边 48 项、浏览器半边 47 项、真实框架激活 13 项（缺框架则 SKIP）；另有一套变异测试，确认「重复挂载」守卫确实会失败。

---

## English

This file records notable changes to the plugin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See
[README · Releases and versioning](README.md#releases-and-versioning) for the version policy.

### [Unreleased]

### [1.0.0] - 2026-09-30

First public release.

**Added**

- Sidebar entry **Archived Sessions**, listing archived sessions newest-first with title, time, working directory, size and file count; records whose directory is already gone are flagged.
- Exactly one action per row — **delete permanently** — behind a two-step confirmation, with no undo.
- A deletion order that leaves no ghost rows: stop activity → unarchive → detach workspace → drop the in-memory session → delete the projection cache → remove the session directory → delete the cache file → notify the UI.
- Safety boundaries: only sessions in the archived set; refuses a session whose turn is still running; deletes through `node:fs` with resolved absolute paths only, never shell commands.
- Host/browser build-skew self-check that explains the problem and disables the action instead of failing with a 404.
- Chinese/English UI that follows the DSH locale.
- Zero runtime dependencies, no build step, no install scripts.

**Notes**

- Verified against `@deepseek-ai/dsh-desktop` **0.2.0-rc.1**; relies on DSH internal interfaces and may need follow-up after DSH upgrades.
- Test coverage: 48 host checks, 47 browser checks, 13 real-framework activation checks (SKIP without the framework), plus a mutant run asserting the duplicate-mount guard fails.

[Unreleased]: https://github.com/luckamuu/dsh-sessions-plugin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/luckamuu/dsh-sessions-plugin/releases/tag/v1.0.0