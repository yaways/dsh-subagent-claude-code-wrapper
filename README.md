# @yaways/dsh-subagent-claude-code-wrapper

> 英文版见 [README_EN.md](./README_EN.md)

让 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的 subagent 委派工具，可以调用**任意一个 Claude 兼容的 CLI 二进制**——而不只是 SDK 自带的那个官方 CLI。

从 DSH 自带的 `dsh-subagent-claude-code` fork 而来，只加了一个配置项：`executablePath`。

---

## 这个插件解决什么问题

DSH 自带的 `subagent-claude-code` provider，写死了用 SDK 内置的官方 Claude Code CLI。但有些环境跑的是另一个 Claude 兼容 CLI——企业内部 fork、自建二进制、锁定版本、或者一个会注入额外参数的包装脚本。这个插件把 SDK 本来就有的 `pathToClaudeCodeExecutable` 选项暴露成一个配置项，这样你不用改 DSH 源码就能指定用哪个 CLI。

DSH 目前不收外部 PR（见它的 `CONTRIBUTING.md`），社区插件是官方认可的扩展方式。这个包就走这条路：拷一份 DSH 自带 provider 的源码，加一个字段，作为独立 bundle 发布——DSH 升级碰不到它。

---

## 配置项

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `providerName` | `claude-code-wrapper` | 在 `ctx.subagents` 上注册的名字。和自带的 `claude-code` 区分开，两个同时加载也不撞名。 |
| `executablePath` | *不填则用 SDK 默认* | **你的 CLI 二进制的路径**。填你自己的 CLI 在哪，插件运行时会用它启动子进程。 |
| `env` | `{}` | 传给子进程的环境变量，覆盖在 DSH 清理过的父环境之上。 |
| `permissionMode` | `dontAsk` | `dontAsk` / `acceptEdits` / `auto` / `plan` / `bypassPermissions`。 |
| `disposeGraceMs` | `3000` | 进程树终止的宽限时间（毫秒）。 |

### 和 VS Code 官方扩展的对应关系

这个 provider 的配置项，和 VS Code 官方 Claude Code 扩展里"启动相关"的设置是一一对应的：

| 本插件 | VS Code 设置 | 说明 |
|---|---|---|
| `executablePath` | `claudeCode.claudeProcessWrapper` | 启动 Claude 进程用的可执行文件路径 |
| `env` | `claudeCode.environmentVariables` | 子进程环境变量（我们用 map，VS Code 用数组） |
| `permissionMode` | `claudeCode.initialPermissionMode` | 会话权限模式 |
| (`permissionMode: bypassPermissions`) | `claudeCode.allowDangerouslySkipPermissions` | 由 permissionMode 推导，不单列 |

DSH 自带的 provider 已经覆盖了 `env` 和 `permissionMode`。这个 fork 补上唯一缺的那块：`executablePath` ↔ `claudeProcessWrapper`。

---

## 三步上手

### 第 1 步：装插件

```sh
# 本地目录：
dsh plugin --profile web add /path/to/dsh-subagent-claude-code-wrapper

# npm（发布后）：
dsh plugin --profile web add @yaways/dsh-subagent-claude-code-wrapper

# GitHub：
dsh plugin --profile web add github:yaways/dsh-subagent-claude-code-wrapper
```

装完可以用 `dsh --profile web --dump-default-config` 验证——能看到 `id: subagent-claude-code-wrapper` 就说明注册成功了。

### 第 2 步：填你自己的 CLI 路径

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，把 `executablePath` 填成**你的 CLI 的实际路径**：

```yaml
- id: subagent-claude-code-wrapper
  config:
    executablePath: /opt/your-tools/bin/your-claude-cli
```

> **你的 CLI 叫什么、装在哪，都行**——可能是 `/usr/local/bin/claude`、`/home/me/bin/my-claude`、或者一个包装脚本。只要它兼容 Claude Code 的命令行协议，填上去就能用。插件不关心它叫什么，只关心它在哪。

如果你的路径在不同机器上不一样，可以用环境变量，配置不用改：

```yaml
- id: subagent-claude-code-wrapper
  config:
    executablePath: !!js process.env.DSH_CLAUDE_CODE_EXECUTABLE
```
然后在 shell 里 `export DSH_CLAUDE_CODE_EXECUTABLE=/your/path/your-cli`。

填完用 `dsh --profile web --dump-config` 验证——provider 行里能看到你的路径就对了。

### 第 3 步：在预设里启用委派工具

> **为什么需要这一步**——见下面的[工作原理](#工作原理)。简单说：DSH 把"注册一个 provider"和"给某个 agent 配委派工具"分成了两步。DSH 自带的 `claude-code` provider 也需要这步，不是这个 fork 的特殊要求。

DSH 在每个预设里都预置了 `tool-subagent-claude-code` 这一行，但默认 `disabled: true`。预设自己的注释说得很清楚：

> *装上对应的 Bundle 并重启后，复制这个预设并去掉那一行的 `disabled`。光在 Host 层装上 provider，不会自动得到委派工具。*

要让委派走你的 wrapper provider：

**3a.** 把官方 `standard` 预设复制一份到用户空间，换个名字（同名副本会被官方原版覆盖——DSH 解析重名预设时先到的赢）。

**方式一：用 DSH Web GUI（推荐）**

打开 DSH Web GUI 的设置，找到「**Agent 预设**」项（英文界面为「Agent presets」），选中 `standard`，点「复制」，把副本命名为 `claude-code-wrapper`。这一步底层会把整个 `standard` 预设目录（含 `agent.cordis.yml` 和 `preset.yml`）拷一份到 `~/.dsh/.agent-presets/claude-code-wrapper/`，你不用手动找路径。

> 复制后，副本会落在 `~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml`，后面的 3b 直接编辑这个文件。

**方式二：命令行手动复制**

如果你没有用 Web GUI，或者设置里没看到「Agent 预设」入口，手动 `cp` 一样可行。shipped 预设的位置取决于你怎么装的 dsh：

```sh
mkdir -p ~/.dsh/.agent-presets/claude-code-wrapper

# 源码 checkout 装的：
cp <dsh-checkout>/apps/cli/config/agent-presets/standard/agent.cordis.yml \
   ~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml

# npm 全局装的（dsh 的包名是 @deepseek-ai/dsh）：
cp "$(npm root -g)/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml" \
   ~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml

# npx 运行的：在 npx 缓存里找，路径形如
#   ~/.npm/_npx/<hash>/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml
# 用这个命令定位：
cp "$(find ~/.npm/_npx -path '*/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml' 2>/dev/null | head -1)" \
   ~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml
```

**3b.** 编辑副本 `~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml`，找到 `tool-subagent-claude-code` 这一行，改两处：

```yaml
    - id: tool-subagent-claude-code
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true                          # ← 删掉这行
      config:
        provider: claude-code-wrapper          # ← 原来是 claude-code
        toolName: subagent_claude_code
        backgroundMode: one-shot
        maxDepth: provider-managed
```

**3b-2.** 在同一目录下建（或编辑）`preset.yml`，设置前端显示的名称和描述。命令行 `cp` 的没有这个文件，Web GUI 复制的有（显示名还是「标准模式」），改成你自己的：

```yaml
# ~/.dsh/.agent-presets/claude-code-wrapper/preset.yml
name: Claude Code Wrapper
description: 标准模式的基础上，subagent 委派走 claude-code-wrapper provider。
```

> 没有这个文件的话，前端显示名会回退成目录名 `claude-code-wrapper`。

**3c.** 把默认预设切到你的副本。

> ⚠️ 注意：DSH 的默认预设存在 `~/.dsh/settings.yaml` 里（Web GUI 里点「设为默认」写的就是这里），它的优先级**高于** profile 的 `cordis.patch.yml`。所以在 `cordis.patch.yml` 里配 `agent-presets.default` 是无效的，必须改 settings。

**方式一：用 DSH Web GUI**

在「Agent 预设」里找到你刚复制的 `claude-code-wrapper`，点「设为默认」。

**方式二：命令行**

编辑 `~/.dsh/settings.yaml`，把 `agent-presets.default` 改成 `claude-code-wrapper`：

```yaml
agent-presets:
  default: claude-code-wrapper
```

**3d.** 重启 dsh（settings 改动需要重启生效）。新会话会自动用 `claude-code-wrapper` 预设，拿到 `subagent_claude_code` 委派工具，背后是你的 wrapper provider。

> 如果重启后没生效，打开 Web GUI 的「Agent 预设」确认默认选中的是不是 `claude-code-wrapper`——settings 里的值可能被 UI 里的手工选择覆盖过。

---

## 工作原理

### 两个层，两步走

DSH 把一个 subagent provider 的生命周期拆在两个层：

| 层 | 这层做什么 | 怎么配 |
|---|---|---|
| **Host 层** | provider 注册到 `ctx.subagents` | bundle 的 `cordis.patch.yml`（第 1 步）+ profile 的 `cordis.patch.yml` 配值（第 2 步） |
| **Agent 层** | agent 拿到调用这个 provider 的委派工具 | 预设的 `agent.cordis.yml`（第 3 步） |

bundle 的 `cordis.patch.yml` 只能注入 Host 层的行。委派工具住在预设的 `delegation` group 里（一个隔离的 agent-plane composition，每个会话独立 mount）。两层数据流不交叉——这就是为什么连 DSH 自带的 `claude-code` provider 都要 `disabled: true`、让用户复制预设去启用。

### 这个 fork 改了什么

在 DSH 自带 `dsh-subagent-claude-code` 源码基础上，三处小改：

| 文件 | 改动 |
|---|---|
| `src/index.ts` | `Config` 接口 + schema 加 `executablePath: z.string().min(1)`（schemastery 里字段不加 `.required()` 就是可选的）；`DEFAULT_PROVIDER_NAME` → `'claude-code-wrapper'`（防撞名）；构造 spec 时透传 `executablePath`。 |
| `src/run.ts` | `ClaudeCodeRunSpec` 加 `readonly executablePath?: string`；`claudeQueryOptions` 把它作为 `pathToClaudeCodeExecutable` 传给 Agent SDK 的 `Options`。 |
| `src/index.ts` | `PACKAGE_NAME` / 错误前缀改成 fork 的包名。 |

其余全部不变——unattended 回调、诊断、进程树回收、权限处理——都和上游一致。

### 为什么做独立插件（而不是改源码）

| | 在本地分支改源码 | 这个独立插件 |
|---|---|---|
| DSH 更新影响 | 每次要 rebase + rebuild | **零**——包在 checkout 外面 |
| 维护面 | 3 行源码，冲突时要重放 | 3 行源码，冻结在这个仓库里 |
| 能分享给别人 | 要手动给 patch 文件 | `dsh plugin add @yaways/...` 一键 |

`executablePath` 的值在 `~/.dsh`（你的 profile 里），不在源码里——换二进制或换路径，不用动插件。

---

## 构建（给贡献者）

这个包没有 DSH workspace 里的 per-package build 脚本。用 `tsc` 编译（关了类型检查——源码是上游的验证副本，类型由上游保证，这里只做转译）：

```sh
pnpm install --config.auto-install-peers=false   # 跳过 @deepseek-ai/* peer（由 host 提供）
pnpm run build                                     # tsc -b tsconfig.json → lib/*.js
```

如果你附近有 DSH checkout，`tsconfig.json` 已经引用它做 project 类型（`../deepseek-harness/...`）。布局不同的话调一下相对路径。

`lib/` 在 .gitignore 里；改完源码要重新 build，`dsh plugin add` 才能拿到新产物（或者用 `link:` 安装做实时编辑）。

## 更新影响

| 更新来源 | 影响什么 |
|---|---|
| **你的 CLI 二进制更新** | 不影响——`executablePath` 指向一个路径（通常是 symlink），二进制原地升级。 |
| **DSH 更新** | 插件包（`src/`、`lib/`）在 checkout 外面，碰不到。你的 `executablePath` 配置在 `~/.dsh`，碰不到。唯一的维护面是**第 3 步的预设副本**：如果 DSH 大改了 `standard` 预设，diff 一下把新行 merge 进你的 `claude-code-wrapper` 副本。真正关键的就 `tool-subagent-claude-code` 那一行。 |
| **上游接受 `executablePath`** | 如果 DSH 给自带的 `subagent-claude-code` 加了 `executablePath`，删掉这个插件、去掉第 3 步的预设、在自带的 `subagent-claude-code` 行上配 `executablePath` 即可——字段名一致，配置零迁移。 |

## 上游提案

已向 DSH GitHub Discussions 提交了给自带 `dsh-subagent-claude-code` 加 `executablePath` 的 feature request。这个插件是"现在就能用"的过渡方案，直到（如果）上游接受为止。

## License

MIT
