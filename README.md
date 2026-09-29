# 已归档会话 · Archived Sessions

> 一个 **DeepSeek Harness** 插件：在侧边栏加一个「已归档会话」页面，列出当前归档的会话，每行只有一个操作——**彻底删除**（连同会话目录与投影缓存一起从硬盘上抹掉）。

![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.1-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![dependencies](https://img.shields.io/badge/runtime%20dependencies-none-brightgreen)
![tests](https://img.shields.io/badge/tests-passing-brightgreen)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

---

## 目录

- [这是什么](#这是什么)
- [功能](#功能)
- [为什么需要它](#为什么需要它)
- [安装](#安装)
- [使用](#使用)
- [删除到底做了什么](#删除到底做了什么)
- [安全边界](#安全边界)
- [工作原理](#工作原理)
- [目录结构](#目录结构)
- [开发](#开发)
- [测试](#测试)
- [常见问题](#常见问题)
- [兼容性](#兼容性)
- [卸载](#卸载)
- [License](#license)
- [English](#english)

---

## 这是什么

DSH 可以把会话**归档**，但归档只是把会话从主列表里收起来：会话日志目录、投影缓存仍然留在硬盘上，界面也没有提供删除入口。

这个插件补上那一步。它由两个半边组成：

- **宿主半边（`index.js`）**：注册 `archivedSessions` 服务，扫描归档集合，并在你确认后把选中的会话从硬盘上真正删除。
- **浏览器半边（`client.js`）**：在侧边栏注册「已归档会话」入口，并渲染管理页面。

两半通过 DSH 的 Typert Remote 通道通信，前端只调用两个端点，不做任何文件操作。

## 功能

| 功能 | 说明 |
| --- | --- |
| 归档会话列表 | 按最近活动时间倒序，显示标题、时间、工作目录、占用空间与文件数 |
| 唯一操作：彻底删除 | 每行只有一个按钮；两步确认（`彻底删除` → `确认删除`）后不可撤销 |
| 空间与文件统计 | 递归统计会话目录大小，删除前就能看到会释放多少 |
| 缺失文件标记 | 记录在归档集合里、但目录已不在硬盘上的会话会标注「文件已不在」 |
| 宿主版本自检 | 面板发现宿主端点对不上时直接说明并禁用删除，而不是抛一个 404 |
| 中英双语 | 随 DSH 语言切换，文本走 `ctx.locale` |
| 零运行时依赖 | 不用装任何包，没有构建步骤，没有安装脚本 |

## 为什么需要它

- 归档会话仍会长期占用磁盘（一个长会话的日志可以到几百 MB）。
- DSH 没有「删除会话」的公开入口，只能在文件系统里手动找目录，还要同时处理工作区归属与投影缓存，否则会留下点开就报错的幽灵会话行。
- 这个插件把这几步按正确顺序做完，并且**只**在会话确实处于归档集合里时才动手。

## 安装

### 前置条件

- 已安装 DSH 桌面版（在 `@deepseek-ai/dsh-desktop` **0.2.0-rc.1** 上验证）。
- 插件以 `link:` 方式从目录安装，所以仓库要放在一个**之后不会移动**的位置。

### 步骤

1. 克隆仓库（目录名保持 `dsh-sessions-plugin`）：

   ```bash
   git clone <本仓库地址> dsh-sessions-plugin
   ```

2. 打开 DSH，左侧边栏进入 **插件** 页面。
3. 点 **安装**，在输入框里填入克隆下来的目录的**绝对路径**，例如：

   ```
   C:\Users\you\Desktop\dsh-sessions-plugin      (Windows)
   /home/you/tools/dsh-sessions-plugin           (macOS / Linux)
   ```

4. 确认安装。插件没有依赖、没有安装脚本，不会触发构建确认。
5. 侧边栏会出现「已归档会话」入口（在 插件／计划 附近），点开即用。
6. 如果面板提示「宿主里的插件是旧版本」，**完全退出并重新打开 DSH** 后再试（原因见[开发](#开发)）。

安装后插件页显示的名称与说明来自 `locale/*.json`：

> **已归档会话** — 列出已归档的会话，并可将其从硬盘中彻底删除。

<details>
<summary>手动安装（供参考：插件页安装实际写下的配置）</summary>

在 DSH 配置目录（默认 `~/.dsh`，可用 `DSH_HOME` 覆盖）下的 profile 里：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@local/archived-sessions"   // ← 新增
      ]
    }
  },
  "dependencies": {
    "@local/archived-sessions": "link:C:/path/to/dsh-sessions-plugin"  // ← 新增
  }
}
```

并让包管理器把该 profile 的 `node_modules/@local/archived-sessions` 指向同一目录。**手改配置文件有风险，能用插件页就别手改**；无论用哪种方式，改完都必须重启 DSH。

</details>

## 使用

面板结构（示意）：

```
┌ 已归档会话 ─────────────────────────────────────────────── [刷新] ┐
│ 这些会话已归档。删除会同时移除硬盘上的会话记录，无法恢复。          │
│ 读取目录：C:\Users\you\.dsh                                       │
│                                                                  │
│ 共 3 个已归档会话                                                 │
│ 修复登录跳转        2 天前 · D:\proj\web · 1.2 MB          [彻底删除] │
│ (无标题会话)        上周三 · D:\proj\api · 340 KB · 文件已不在 [彻底删除] │
└──────────────────────────────────────────────────────────────────┘
```

1. 点某行的 **彻底删除**。
2. 该行变成确认条：`删除后无法恢复` + **确认删除** / **取消**。
3. 点 **确认删除** 才真正执行；成功后顶部出现「已删除 <会话 id>」并自动刷新列表。

「读取目录」那一行显示的是插件实际读取的 DSH 主目录（`DSH_HOME`，否则 `~/.dsh`），用来排查「明明归档过却是空列表」这类问题。

## 删除到底做了什么

删除只在会话**确实处于归档集合**里时执行，顺序如下：

| # | 动作 | 调用 | 原因 |
| --- | --- | --- | --- |
| 0 | 校验 id | — | 空 id 直接拒绝 |
| 1 | 校验归档归属 | `workspaceRegistry.archivedSessionIds` | 不在归档集合里 → `not archived`，拒绝删除 |
| 2 | 拒绝正在运行的会话 | `ctx.get('agents').get(id).status === 'running'` | 正在跑回合 → `is running`，要求先停止；仅仅还开在界面里不再阻止删除 |
| 3 | 停止会话活动 | `workspaceRegistry.stopSessionActivity(id)` | 避免删除时仍有活动在写文件 |
| 4 | 摘掉归档标记 | `workspaceRegistry.unarchiveSession(id)` | 持久写入 `storages/workspace.json`；删除中断也不会留下「注册表里有、却打不开」的 id |
| 5 | 解除工作区归属 | `Workspace.detachSession(id)` | 避免留下空的工作区行 |
| 6 | 摘掉内存里的会话 | `ctx.get('sessions').detachEntered(liveEntryFor(session))` | 附加在内存里的会话会继续持有日志写入器，删完文件也会被写回来 |
| 7 | 删除投影缓存 | `storageDomain.get('session_projcache').table('sessions').delete(id)` | 保持内存表与记录文件一致；失败只告警不中断 |
| 8 | 删除整个会话目录 | `fs.rm(<DSH_HOME>/sessions/<工作区键>/<会话 id>/, { recursive: true, force: true })` | **整目录**删除：旧版本的日志文件如果留在旁边，读取端会把会话「复活」 |
| 9 | 删除缓存文件 | `fs.rm(<DSH_HOME>/storages/session_projcache/sessions/<会话 id>.json)` | 与第 6 步互为保险 |
| 10 | 通知界面 | `ctx.emit('api-session/removed', id)` | 只有这条通知会让侧边栏的会话行消失 |

返回值：`{ sessionId, directory, cache }`，表示目录与缓存是否真的被移除。

## 安全边界

- **只会删除归档集合里的会话。** 正在使用的、未归档的会话即便手动调用端点也会被拒绝。
- **拒绝删除正在运行的会话**：只有确实在跑回合（`agent.status === 
- **不删除附件等共享内容**，只删会话自己的目录与投影缓存。
- **子代理（subagent）会话不在归档集合里**，因此不会出现在列表里，也不会被删。
- **不用 shell 命令删除**，删除走 `node:fs`，参数是解析出的绝对路径。
- 删除**不可撤销**：界面用两步确认，且第二次点击才是真正的删除。

## 工作原理

### 两个半边

```
client.js (浏览器)                        index.js (宿主)
  │  sidebar.panellist 注册入口              │  ctx.provide('archivedSessions', this)
  │  main 注册面板（keyed slot）             │  typertRemote 绑定 + Remote 方法标记
  │                                        │
  └── ctx.remote.$mount(贡献描述) ────────► Typert Remote Gateway
         archivedSessions/list              ← 扫描 reflect 表里的 service
         archivedSessions/deleteSession     ← 读取方法标记与参数名（源模式）
```

端点契约：

| 端点 | 参数 | 返回 |
| --- | --- | --- |
| `archivedSessions/list` | 无 | `{ home, endpoints, sessions[] }` |
| `archivedSessions/deleteSession` | `sessionId` | `{ sessionId, directory, cache }` |

`sessions[]` 每项：`sessionId`、`title`、`cwd`、`workspaceTitle`、`createdAt`、`lastPromptAt`、`modifiedAt`、`bytes`、`files`、`onDisk`、`directory`。

`list()` 还会返回 `endpoints`（本版本暴露的端点清单），前端据此判断宿主是不是旧版本。

### 为什么宿主半边不 import 框架包

从目录安装的插件，其真实路径在 DSH 安装目录之外，Node 只按插件自己所在的目录链解析裸模块名，因此 `import ... from '@deepseek-ai/...'` 会直接抛 `ERR_MODULE_NOT_FOUND`，插件表现为 **failed to import**。

所以 `index.js` 只用公开的 Context API 注册服务：

- `ctx.provide('archivedSessions', this)` 会把 reflect 表标成 `type: 'service'`（Typert Gateway 正是扫描这张表）；
- `typertRemote` 绑定按 Gateway 校验的字段写好（`{ service, serviceKey, namespace }`）；
- Remote 方法标记（`remote-methods` 原型描述符）自行写入。

整个 bundle **没有任何裸模块导入**（`client.js` 只用模块表里的 `react`）。

### 三个框架层面的坑（都已在测试里守住）

1. **端点名不能撞命名空间服务自有的成员。** 否则 `$mount` 抛 `method "ns/x" conflicts with its namespace service`。被占用的名字：`ctx`、`empty`、`invokeRemote`、`methods`、`name`、`namespace`、`has`、`install`、`installDirect`、`installScoped`、`remove`。所以删除端点叫 `deleteSession` 而不是 `remove`。
2. **同一组端点只能挂载一次。** 重复 `$mount` 会被网关拒绝（`direct method ns/x is already mounted`）。因此 `apply` 只挂载一次，卸载交给本次激活的 `ctx.effect`，面板 await 同一个 promise。
3. **宿主半边改动需要重启 DSH。** 前端 `client.js` 刷新页面即重新加载；宿主 `index.js` 走进程内的 ESM 缓存，插件开关不会重读磁盘（`pluginManager.reload()` 在没有 hmr 服务时直接返回空，`loader.import()` 也不带版本查询）。典型症状：刷新后 `list` 正常、`deleteSession` 却返回 404。面板会用 `endpoints` 自检并提示重启。

## 目录结构

```
dsh-sessions-plugin/
├── package.json          # 插件清单：dsh.bundle.patch / dsh.client / exports
├── cordis.patch.yml      # bundle 补丁层：把本插件插入插件树
├── index.js              # 宿主半边：archivedSessions 服务
├── client.js             # 浏览器半边：侧边栏入口 + 面板
├── locale/
│   ├── zh.json           # 插件页显示的名称与说明
│   └── en.json
├── icon.svg              # 插件图标
├── test/                 # 自测（无需安装任何依赖）
│   ├── run.mjs           # 宿主：服务、Remote 契约、删除流程（42 项）
│   ├── client.test.mjs   # 前端：注册、渲染、删除交互（47 项）
│   ├── activation.test.mjs # 真实 Cordis + Typert 协议激活（13 项，缺框架则 SKIP）
│   ├── mutant-client.js  # 故意还原「重复挂载」bug 的变体，用于校验守卫有效
│   └── stubs/            # 与官方实现逐行对齐的协议替身
├── README.md
├── LICENSE
├── NOTICE.md             # 第三方代码来源（框架包的 MIT 归属）
└── .github/workflows/test.yml
```

> `test/stubs/dsh-typert-protocol.mjs` 与 `test/run.mjs` 里的两个小工具函数取自
> DSH 框架包（MIT，© 2026 DeepSeek），目的是**对官方实现本身**做断言而不是对它的转述，
> 具体归属见 [NOTICE.md](NOTICE.md)。

| 文件 | 说明 |
| --- | --- |
| `package.json` | `dsh.bundle.patch` 让它成为一个 bundle；`dsh.client` 声明浏览器半边；`exports["./client"]` 指向 `client.js`；`icon` 指向图标 |
| `cordis.patch.yml` | `insert` 一个 id 为 `archived-sessions` 的插件条目 |
| `index.js` | 服务注册、归档集合读取、删除流程；导出 `ArchivedSessions`、`SERVICE_KEY` 与 default |
| `client.js` | 通过 `window.__ModuleLoader__.load` 注册；挂载 Remote 贡献；注册 `main`（key 与 `sidebar.panellist` 的 id 一致）与侧边栏入口 |

## 开发

- 改完 `index.js`（宿主）**必须重启 DSH**；只改 `client.js` 刷新界面即可。
- 关于 DSH 主目录：解析顺序是环境变量 `DSH_HOME`，否则 `~/.dsh`。测试通过 `DSH_HOME` 指向临时目录，绝不触碰真实数据。
- 插件日志走 `ctx.logger`，删除成功会写 `archived-sessions: deleted session <id> from disk`；投影缓存删除失败只写 warning，不中断删除。
- 端点参数名直接来自方法源码（源模式描述符），所以参数名要保持简单标识符，`signal` 必须放在最后。

## 测试

三套验证都不需要安装依赖，直接用 Node 运行（任何支持 ESM 顶层 await 的 Node；CI 用 20）：

```bash
node test/run.mjs             # 42/42：宿主服务、Remote 绑定与标记、删除全流程与全部拒绝分支
node test/client.test.mjs     # 47/47：模块加载契约、注册、渲染、删除交互、版本偏移提示（中英）
node test/activation.test.mjs # 13/13：真实 Cordis + 真实 Typert 协议的激活与端点声明
```

第三套需要一份**可读的框架包副本**（它们打包在应用归档里）：

```bash
# 指向任意同时包含 cordis/lib/index.js 与 dsh-typert-protocol/lib/index.js 的 @deepseek-ai 目录
DSH_INSTALL=/path/to/extracted/@deepseek-ai node test/activation.test.mjs
```

没有它时该套件打印 `SKIP` 并以 0 退出，不会挡住克隆下来的人。

### 变异测试（确认守卫真的会失败）

`test/mutant-client.js` 是把「重复挂载」这个真实 bug 还原回去的变体，用它跑前端套件应当**失败**：

```bash
VERIFY_CLIENT=test/mutant-client.js node test/client.test.mjs   # 27/47，复现 already mounted
```

CI（`.github/workflows/test.yml`）在 ubuntu 与 windows 上跑无依赖的两套，并断言变异体必须失败。

## 常见问题

<details>
<summary><b>启用失败：failed to import</b></summary>

宿主半边引用了 `@deepseek-ai/*`。目录安装的插件解析不到框架包。

处理：本仓库的 `index.js` 没有任何裸模块导入；如果你改代码引入了框架 import，请改回只使用公开的 Context API。
</details>

<details>
<summary><b>操作失败：client api: method "archivedSessions/x" conflicts with its namespace service</b></summary>

端点名撞上了命名空间服务自有的成员（见[三个坑](#三个框架层面的坑都已在测试里守住)第 1 条）。

处理：换一个不冲突的端点名（宿主方法名、方法标记、前端描述符三处同步改）。
</details>

<details>
<summary><b>操作失败：client api: direct method archivedSessions/list is already mounted</b></summary>

同一组端点被挂载了两次（第 2 条）。

处理：确认 `apply` 只调用一次 `ctx.remote.$mount`，面板复用同一个 promise。
</details>

<details>
<summary><b>删除时：transport failure for /api/archivedSessions/deleteSession: HTTP 404</b></summary>

宿主里跑的还是旧模块（第 3 条）。`list` 能通、只有新端点 404 是它的典型特征。

处理：**完全退出并重新打开 DSH**。刷新界面不够。
</details>

<details>
<summary><b>面板提示「宿主里的插件是旧版本」</b></summary>

同上：`list()` 报告不出本版本应有的端点，说明宿主是旧模块。删除按钮已禁用，重启 DSH 后恢复。
</details>

<details>
<summary><b>列表是空的，但我确实归档过会话</b></summary>

1. 看面板顶部的「读取目录」是不是你正在使用的那个 DSH 主目录（多 profile / 自定义 `DSH_HOME` 时最容易踩）。
2. 该会话可能已被取消归档，或它属于另一个工作区且未进入归档集合。
3. 归档会话的 id 来自 `storages/workspace.json` 的归档集合；如果它记录在别处，面板不会显示。
</details>

<details>
<summary><b>删除失败：… is running; stop its turn before deleting it from disk</b></summary>

该会话正在跑一个回合（`ctx.agents.get(id).status === 'running'`），此时删文件会让仍在写入的日志重新出现。

处理：在界面里结束该会话当前的回合（或等它跑完）再删除。只是「会话还开在界面里」不会再被拒绝——插件会把它从内存会话表里摘掉，再删文件。
</details>

<details>
<summary><b>想删的会话不在列表里</b></summary>

子代理（subagent）会话不进入归档集合，因此不在本列表中——本插件不处理它们。
</details>

## 兼容性

- 在 `@deepseek-ai/dsh-desktop` **0.2.0-rc.1** 上验证。
- 插件依赖 DSH 的内部接口：Context `reflect`/`provide`、Typert Remote 网关（源模式描述符）、`slots`（`main` 键控槽 + `sidebar.panellist`）、`locale`、`storageDomain`、`workspaceRegistry`。DSH 升级后这些接口若有变化，插件可能需要跟进。
- 插件本身零运行时依赖；平台无关（路径处理全部走 `node:path`）。仅在 Windows 上做过手工验证。

## 卸载

1. DSH → **插件** 页面 → 禁用或移除「已归档会话」。
2. 手动安装的话，删掉 profile 里的 bundle 条目与 `link:` 依赖，再删掉克隆下来的目录。
3. 插件不保存任何自己的数据；卸载后已归档会话仍在（要删会话请在卸载前操作）。

## License

[MIT](LICENSE) © 2026 niuma001

---

## English

**Archived Sessions** is a DeepSeek Harness plugin that adds a sidebar page listing your archived sessions, with exactly one action per row: **delete permanently from disk**. DSH can archive a session but keeps its log directory and projection cache on disk forever, and offers no delete entry point — this plugin finishes the job.

**Highlights**

- Recursive size/file count per session; sessions whose directory is already gone are flagged.
- Two-step confirmation, irreversible afterwards; the only operation in the panel is deletion.
- Refuses to touch anything that is not in the archived set, and refuses a session whose turn is still running.
- Deletes in the order that leaves no ghost rows: stop activity → unarchive → detach workspace → drop projection cache → remove the whole session directory → notify the UI.
- Self-checks Host/browser build skew and disables the action with an explanation instead of failing with a 404.
- Zero runtime dependencies, no build step, Chinese/English UI.

**Install** — clone the repo, then in DSH open the **Plugins** page, click **Install**, and enter the absolute path of the cloned directory. Restart DSH if the panel reports an older Host build.

**Verify**

```bash
node test/run.mjs             # 42/42 host half
node test/client.test.mjs     # 47/47 browser half
node test/activation.test.mjs # 13/13 against the real framework (SKIP without DSH_INSTALL)
```

Licensed under MIT.