/**
 * Whitelist of third-party commands the Tab Tree re-exposes as context-menu entries.
 *
 * VS Code offers no runtime API for dynamically contributing menu items or enumerating
 * other extensions' menu contributions. The only option for plumbing commands
 * from extensions like GitLens or the TypeScript language features into our custom
 * TreeView is to statically declare menu entries in our own package.json and guard
 * them with a `when` clause tied to a context key we maintain ourselves.
 *
 * For each whitelisted entry we:
 *  1. declare a wrapper command (wrapperId) in package.json + register a handler
 *     in extension.ts that delegates to the real commandId with a URI argument;
 *  2. expose it under view/item/context with when = contextKey [&& extraWhen];
 *  3. flip contextKey on/off at activation and whenever the set of installed
 *     extensions changes, based on whether commandId is actually registered.
 *
 * Result: users who do not have GitLens (or any other listed extension) never see
 * the corresponding items. No hardcoded dependency, no stale entries, no warnings
 * firing against nonexistent commands.
 */

export interface IThirdPartyCommand {
    /** Command id owned by a third-party extension or built-in feature. */
    readonly commandId: string;
    /** Our own wrapper command id that delegates to commandId. */
    readonly wrapperId: string;
    /** Custom context key flipped based on commandId availability. */
    readonly contextKey: string;
    /** Menu item title shown in our context menu. */
    readonly title: string;
    /** view/item/context group, e.g. "7_git@5". */
    readonly menuGroup: string;
    /** Extra when-clause fragment appended after the availability check. */
    readonly extraWhen?: string;
}

export const THIRD_PARTY_COMMANDS: readonly IThirdPartyCommand[] = [
    {
        commandId: 'typescript.findAllFileReferences',
        wrapperId: 'tabTree.findFileReferences',
        contextKey: 'tabTree.ext.tsFileReferencesAvailable',
        title: 'Find File References',
        menuGroup: '5_find@2',
        extraWhen: '(resourceLangId == typescript || resourceLangId == typescriptreact || resourceLangId == javascript || resourceLangId == javascriptreact)',
    },
    {
        commandId: 'gitlens.openFileHistory',
        wrapperId: 'tabTree.openFileHistory',
        contextKey: 'tabTree.ext.gitlensOpenFileHistoryAvailable',
        title: 'Open File History',
        menuGroup: '7_git@5',
    },
    {
        commandId: 'gitlens.openFileHistoryInGraph',
        wrapperId: 'tabTree.openFileHistoryInGraph',
        contextKey: 'tabTree.ext.gitlensOpenFileHistoryInGraphAvailable',
        title: 'Open File History in Commit Graph',
        menuGroup: '7_git@6',
    },
    {
        commandId: 'gitlens.visualizeHistory.file',
        wrapperId: 'tabTree.visualizeFileHistory',
        contextKey: 'tabTree.ext.gitlensVisualizeFileHistoryAvailable',
        title: 'Open Visual File History',
        menuGroup: '7_git@7',
    },
    {
        commandId: 'gitlens.quickOpenFileHistory',
        wrapperId: 'tabTree.quickOpenFileHistory',
        contextKey: 'tabTree.ext.gitlensQuickOpenFileHistoryAvailable',
        title: 'Quick Open File History',
        menuGroup: '7_git@8',
    },
];

/**
 * Pure helper. Given the set of command ids currently registered in VS Code,
 * compute {contextKey → boolean} updates for every whitelisted command.
 * Kept pure so it can be unit-tested without the vscode namespace.
 */
export function computeContextKeyUpdates(
    availableCommandIds: ReadonlySet<string>,
    commands: readonly IThirdPartyCommand[] = THIRD_PARTY_COMMANDS,
): Record<string, boolean> {
    const updates: Record<string, boolean> = {};
    for (const cmd of commands) {
        updates[cmd.contextKey] = availableCommandIds.has(cmd.commandId);
    }
    return updates;
}
