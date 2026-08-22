# @yaways/dsh-subagent-claude-code-wrapper

> 中文版见 [README.md](./README.md)

Lets [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) delegate subagent work to **any Claude-compatible CLI binary** — not just the SDK-bundled official one.

Forked from DSH's built-in `dsh-subagent-claude-code` with one added config field: `executablePath`.

---

## What problem this solves

DSH's built-in `subagent-claude-code` provider hardcodes the SDK-bundled official Claude Code CLI. But some environments run a different Claude-compatible CLI — an enterprise fork, a self-built binary, a pinned version, or a wrapper script that injects extra flags. This plugin exposes the SDK's existing `pathToClaudeCodeExecutable` option as a config field, so you don't need to patch DSH source.

DSH doesn't accept external PRs (see its `CONTRIBUTING.md`); community plugins are the supported way to extend it. This package follows that path: a copy of the built-in provider's source plus one field, shipped as an independent bundle — DSH updates never touch it.

---

## Config

| Field | Default | What it does |
|---|---|---|
| `providerName` | `claude-code-wrapper` | Name registered on `ctx.subagents`. Distinct from the built-in `claude-code` so both can coexist. |
| `executablePath` | *(unset → SDK default)* | **Path to your CLI binary.** Fill in where your CLI lives; the plugin spawns it at runtime. |
| `env` | `{}` | Environment entries passed to the child process, layered over DSH's scrubbed parent environment. |
| `permissionMode` | `dontAsk` | `dontAsk` / `acceptEdits` / `auto` / `plan` / `bypassPermissions`. |
| `disposeGraceMs` | `3000` | Grace period in ms for process-tree termination. |

### VS Code extension correspondence

This provider's config aligns with the official Claude Code VS Code extension's launch-contract settings:

| This plugin | VS Code setting | Notes |
|---|---|---|
| `executablePath` | `claudeCode.claudeProcessWrapper` | Executable path used to launch the Claude process. |
| `env` | `claudeCode.environmentVariables` | Child environment overlay (we use a map, VS Code uses an array). |
| `permissionMode` | `claudeCode.initialPermissionMode` | Session permission mode. |
| (`permissionMode: bypassPermissions`) | `claudeCode.allowDangerouslySkipPermissions` | Derived from `permissionMode`, not a separate field. |

The built-in provider already covers `env` and `permissionMode`. This fork adds the only missing piece: `executablePath` ↔ `claudeProcessWrapper`.

---

## Quick start (3 steps)

### Step 1 — Install the bundle

```sh
# Local directory:
dsh plugin --profile web add /path/to/dsh-subagent-claude-code-wrapper

# npm (once published):
dsh plugin --profile web add @yaways/dsh-subagent-claude-code-wrapper

# GitHub:
dsh plugin --profile web add github:yaways/dsh-subagent-claude-code-wrapper
```

Verify with `dsh --profile web --dump-default-config` — look for `id: subagent-claude-code-wrapper`.

### Step 2 — Point it at your CLI

Edit `~/.dsh/profiles/web/cordis.patch.yml` and set `executablePath` to **your CLI's actual path**:

```yaml
- id: subagent-claude-code-wrapper
  config:
    executablePath: /opt/your-tools/bin/your-claude-cli
```

> **Your CLI can be named anything and live anywhere** — `/usr/local/bin/claude`, `/home/me/bin/my-claude`, or a wrapper script. As long as it speaks the Claude Code CLI protocol, it works. The plugin doesn't care what it's called, only where it is.

If the path differs per machine, use an environment variable so the config stays the same:

```yaml
- id: subagent-claude-code-wrapper
  config:
    executablePath: !!js process.env.DSH_CLAUDE_CODE_EXECUTABLE
```
Then `export DSH_CLAUDE_CODE_EXECUTABLE=/your/path/your-cli` in your shell.

Verify with `dsh --profile web --dump-config` — the provider row should show your path.

### Step 3 — Enable the delegation tool in a preset

> **Why this step is needed** — see [How it works](#how-it-works) below. Short version: DSH separates *registering a provider* (Host plane, Step 1) from *giving an agent the delegation tool that uses it* (agent plane, this step). The built-in `claude-code` provider requires the same step — this is not specific to this fork.

DSH ships `tool-subagent-claude-code` in every preset with `disabled: true`. The preset's own comment says:

> *Install the matching Bundle, then copy this preset and remove `disabled` from the matching tool row. Host availability alone grants no tool.*

To enable it for your wrapper provider:

**3a.** Copy the shipped `standard` preset into user space with a new id (same-id copies are shadowed by the shipped original — DSH resolves preset duplicates first-root-wins).

**Option 1: use the DSH Web GUI (recommended)**

Open the DSH Web GUI settings, find the **"Agent presets"** section, select `standard`, click "Duplicate", and name the copy `claude-code-wrapper`. Under the hood this copies the entire `standard` preset directory (including `agent.cordis.yml` and `preset.yml`) to `~/.dsh/.agent-presets/claude-code-wrapper/` — no manual path-finding needed.

> After duplicating, the copy lands at `~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml`. Edit that file directly in step 3b.

**Option 2: copy manually from the command line**

If you're not using the Web GUI, or don't see the "Agent presets" entry, a manual `cp` works the same way. The shipped preset's location depends on how you installed dsh:

```sh
mkdir -p ~/.dsh/.agent-presets/claude-code-wrapper

# From a source checkout:
cp <dsh-checkout>/apps/cli/config/agent-presets/standard/agent.cordis.yml \
   ~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml

# From an npm global install (dsh's package name is @deepseek-ai/dsh):
cp "$(npm root -g)/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml" \
   ~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml

# From an npx run — find it in the npx cache:
cp "$(find ~/.npm/_npx -path '*/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml' 2>/dev/null | head -1)" \
   ~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml
```

**3b.** Edit the copy at `~/.dsh/.agent-presets/claude-code-wrapper/agent.cordis.yml`. Find the `tool-subagent-claude-code` row and change two things:

```yaml
    - id: tool-subagent-claude-code
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true                          # ← remove this line
      config:
        provider: claude-code-wrapper          # ← was: claude-code
        toolName: subagent_claude_code
        backgroundMode: one-shot
        maxDepth: provider-managed
```

**3b-2.** In the same directory, create (or edit) `preset.yml` to set the display name and description shown in the UI. A command-line `cp` won't have it; a Web GUI copy will (still showing "Standard mode") — change it to your own:

```yaml
# ~/.dsh/.agent-presets/claude-code-wrapper/preset.yml
name: Claude Code Wrapper
description: Standard mode, but subagent delegation uses the claude-code-wrapper provider.
```

> Without this file, the UI display name falls back to the directory name `claude-code-wrapper`.

**3c.** Switch the default preset to your copy.

> ⚠️ Note: DSH stores the default preset in `~/.dsh/settings.yaml` (what the Web GUI's "Set as default" writes), and it takes priority **over** the profile's `cordis.patch.yml`. So setting `agent-presets.default` in `cordis.patch.yml` has no effect — you must change settings.

**Option 1: use the DSH Web GUI**

In "Agent presets", find your duplicated `claude-code-wrapper` and click "Set as default".

**Option 2: command line**

Edit `~/.dsh/settings.yaml` and change `agent-presets.default` to `claude-code-wrapper`:

```yaml
agent-presets:
  default: claude-code-wrapper
```

**3d.** Restart dsh (settings changes need a restart to take effect). New sessions will automatically use the `claude-code-wrapper` preset and expose the `subagent_claude_code` delegation tool, backed by your wrapper provider.

> If it doesn't take effect after restart, open "Agent presets" in the Web GUI and check whether `claude-code-wrapper` is selected as default — the settings value may have been overridden by a manual selection in the UI.

---

## How it works

### Two planes, two steps

DSH splits a subagent provider's lifecycle across two composition planes:

| Plane | What happens here | How it's configured |
|---|---|---|
| **Host plane** | Provider registers on `ctx.subagents` | Bundle `cordis.patch.yml` (Step 1) + profile `cordis.patch.yml` for config (Step 2) |
| **Agent plane** | An agent gets the `subagent_claude_code` delegation tool that calls the provider | Preset `agent.cordis.yml` (Step 3) |

A bundle's `cordis.patch.yml` can only inject Host-plane rows. The delegation tool lives in the preset's `delegation` group (an isolated agent-plane composition mounted per-session). The two data flows don't cross — this is why even DSH's own built-in `claude-code` provider ships with `disabled: true` and tells users to copy the preset.

### What this fork changes

Three surgical edits over DSH's built-in `dsh-subagent-claude-code` source:

| File | Change |
|---|---|
| `src/index.ts` | `Config` interface + schema add `executablePath: z.string().min(1)` (schemastery fields are optional unless `.required()`); `DEFAULT_PROVIDER_NAME` → `'claude-code-wrapper'` (collision-safe); spec construction passes `executablePath` through. |
| `src/run.ts` | `ClaudeCodeRunSpec` adds `readonly executablePath?: string`; `claudeQueryOptions` passes it as `pathToClaudeCodeExecutable` to the Agent SDK `Options`. |
| `src/index.ts` | `PACKAGE_NAME` / error prefixes updated to the fork's package name. |

Everything else — unattended callbacks, diagnostics, process-tree disposal, permission handling — is unchanged from upstream.

### Why an independent plugin (not a source patch)

| | Source patch on a local branch | This independent plugin |
|---|---|---|
| DSH update impact | rebase + rebuild every time | **zero** — package lives outside the checkout |
| Maintenance surface | 3 lines of source, replayed on conflict | 3 lines of source, frozen in this repo |
| Shareable | manual patch file | `dsh plugin add @yaways/...` |

The `executablePath` value lives in `~/.dsh` (your profile), not in source — change the binary or the path without touching the plugin.

---

## About the build (regular users can skip)

`lib/` (compiled output) is **committed directly to the git repo** — so whether you install from npm or GitHub, `lib/` is there, **no build, no extra steps**.

> Why commit build output to git? Because pnpm 11 has a security policy for git-hosted packages: any git-hosted package with a `prepare`/`postinstall` script is blocked behind an `allowBuilds` allowlist, and that allowlist key includes the full commit hash, which changes every push — impossible to pre-configure. Committing `lib/` removes the need for a `prepare` script, sidestepping the gate entirely. `lib/` is only 208K.

**Only contributors who edit source need to build manually**:

```sh
pnpm install --config.auto-install-peers=false   # skips @deepseek-ai/* peers (provided by the host)
pnpm run build                                     # tsc -b tsconfig.json → lib/*.js
git add lib/ && git commit                         # commit lib/ alongside source changes
```

`tsc` runs with type-checking off (`noCheck: true`) — the source is a verified copy of upstream, types are guaranteed there, and the build only transpiles, so it doesn't need `@deepseek-ai/*` type definitions to compile. If you have a DSH checkout nearby, `tsconfig.json` already references it for project types (`../deepseek-harness/...`); adjust the relative paths if your layout differs.

Or use `link:` install for live edits without rebuilding + committing each time.

## Update impact

| Update source | What's affected |
|---|---|
| **Your CLI binary updates** | Nothing — `executablePath` points at a path (typically a symlink); the binary upgrades in place. |
| **DSH updates** | The plugin package (`src/`, `lib/`) is outside the checkout — untouched. Your `executablePath` config is in `~/.dsh` — untouched. The only maintenance surface is **Step 3's preset copy**: if DSH changes the `standard` preset significantly, diff and merge new rows into your `claude-code-wrapper` copy. The only load-bearing line is `tool-subagent-claude-code`. |
| **Upstream `executablePath` accepted** | If DSH adds `executablePath` to the built-in provider, delete this plugin, remove the Step 3 preset, and set `executablePath` on the built-in `subagent-claude-code` row — the field name matches, so your config carries over with zero migration. |

## Upstream proposal

A feature request to add `executablePath` to the built-in `dsh-subagent-claude-code` is posted to DSH GitHub Discussions. This plugin is the "use it now" bridge until (or unless) that lands.

## License

MIT
