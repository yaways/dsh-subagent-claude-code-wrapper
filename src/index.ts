/**
 * Profile-named Claude Code one-shot subagent provider with configurable CLI
 * executable path. Every accepted run invokes the official Agent SDK in the
 * delegating Session's workspace and places the SDK-spawned real CLI under
 * the shared subprocess owner.
 *
 * Forked from @deepseek-ai/dsh-subagent-claude-code with one added config
 * field: executablePath (passed through to the SDK's
 * pathToClaudeCodeExecutable option).
 *
 * @module @yaways/dsh-subagent-claude-code-wrapper
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  assertPositiveFinite,
  NO_START_CAPABILITIES,
  resolveChildCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import {
  CLAUDE_CODE_PERMISSION_MODES,
  DEFAULT_CLAUDE_CODE_PERMISSION_MODE,
  DEFAULT_DISPOSE_GRACE_MS,
  claudeCodeStartupFailure,
  startClaudeCodeRun,
  type ClaudeCodePermissionMode,
  type ClaudeCodeRunSpec,
} from './run.ts'

export const name = 'subagent-claude-code-wrapper'
export const inject = ['subagents', 'subprocess']

const DEFAULT_PROVIDER_NAME = 'claude-code-wrapper'

/* jscpd:ignore-start -- sibling product providers intentionally expose
 * overlapping deployment-owned fields without adding a shared config owner. */
/** Deployment-owned permission, environment, executable, and process-release settings. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `claude-code-wrapper`). */
  providerName?: string
  /**
   * Absolute path to a Claude-compatible CLI to spawn instead of the
   * SDK-bundled CLI. Unset uses the SDK default. The SDK passes this as
   * `pathToClaudeCodeExecutable`; the provider's custom spawn hook builds
   * argv from `SpawnOptions.command`, which the SDK sets from this value.
   */
  executablePath?: string
  /**
   * Explicit environment entries layered over the subprocess seam's
   * credential-scrubbed parent environment.
   */
  env?: Record<string, string>
  /**
   * Native non-interactive mode fixed for this Provider instance. Defaults to
   * `dontAsk`; `acceptEdits` accepts edits, `auto` uses the native classifier,
   * `plan` returns a plan without approving execution, and
   * `bypassPermissions` explicitly skips permission checks.
   */
  permissionMode?: ClaudeCodePermissionMode
  /** Grace in milliseconds for Claude Code process-tree termination. */
  disposeGraceMs?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  executablePath: z.string().min(1),
  env: z.dict(z.string()).default({}),
  permissionMode: z.union([...CLAUDE_CODE_PERMISSION_MODES])
    .default(DEFAULT_CLAUDE_CODE_PERMISSION_MODE),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

type ResolvedConfig = Required<Config>
/* jscpd:ignore-end */

/* jscpd:ignore-start -- Cordis registration and shared-seam plumbing mirror
 * the upstream provider; each product's lifecycle remains package-private. */
class ClaudeCodeProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  async start(request: ResolvedSubagentStartRequest) {
    const parentCwd = request.parent.session.header.cwd
    if (parentCwd === undefined) {
      throw new Error(
        'subagent-claude-code-wrapper: no working directory for the child — delegate from a parent session that has one',
      )
    }
    let cwd: string
    try {
      cwd = resolveChildCwd(
        'subagent-claude-code-wrapper',
        undefined,
        parentCwd,
      )
    } catch (error: unknown) {
      if (request.signal.aborted) {
        throw new Error(
          'subagent-claude-code-wrapper: request was aborted before SDK startup',
        )
      }
      const failure = claudeCodeStartupFailure(error)
      this.ctx.logger.warn(
        `subagent-claude-code-wrapper "${this.name}": child start failed: %o`,
        failure,
      )
      throw failure
    }
    const spec: ClaudeCodeRunSpec = {
      cwd,
      executablePath: this.config.executablePath,
      permissionMode: this.config.permissionMode,
      env: this.config.env,
      disposeGraceMs: this.config.disposeGraceMs,
      spawn: spawnSpec => this.ctx.subprocess.spawn(spawnSpec),
      onError: (error, stopReason) => {
        this.ctx.logger.warn(
          `subagent-claude-code-wrapper "${this.name}": child run failed (${stopReason}): %o`,
          error,
        )
      },
    }
    return startClaudeCodeRun(request, spec)
  }
}

/**
 * Register one Profile-named Claude Code provider.
 * @param ctx - context carrying shared subagent and subprocess services.
 * @param config - registry name, executable path, permission mode, child environment, and disposal grace.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    providerName: config.providerName ?? DEFAULT_PROVIDER_NAME,
    executablePath: config.executablePath as string,
    env: config.env as Record<string, string>,
    permissionMode: config.permissionMode ?? DEFAULT_CLAUDE_CODE_PERMISSION_MODE,
    disposeGraceMs: config.disposeGraceMs as number,
  }
  assertPositiveFinite(
    'subagent-claude-code-wrapper',
    'disposeGraceMs',
    resolved.disposeGraceMs,
  )
  if (resolved.disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `subagent-claude-code-wrapper: disposeGraceMs must be no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  ctx.subagents.registerProvider(new ClaudeCodeProvider(
    resolved.providerName,
    ctx,
    resolved,
  ))
}
/* jscpd:ignore-end */
