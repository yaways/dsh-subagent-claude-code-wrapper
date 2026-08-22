/**
 * Package-owned invariant companion for
 * `@yaways/dsh-subagent-claude-code-wrapper`.
 * @module @yaways/dsh-subagent-claude-code-wrapper/invariant
 */
const PACKAGE_NAME = '@yaways/dsh-subagent-claude-code-wrapper';
/** Cordis companion plugin name. */
export const name = 'subagent-claude-code-wrapper-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: lifecycle pairing belongs to the shared subagent
 * service and process-tree ownership belongs to the subprocess service.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - plugin context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map