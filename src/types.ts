/**
 * Core types for Tab Tree.
 * NO dependency on 'vscode' module — keeps tree logic unit-testable.
 */

export enum ETreeNodeType {
    WorkspaceRoot = 'workspaceRoot',
    TabGroup = 'tabGroup',
    Folder = 'folder',
    File = 'file',
    NonFileTab = 'nonFileTab',
    ExternalRoot = 'externalRoot',
}

export type TTabType = 'text' | 'diff' | 'notebook' | 'custom' | 'webview' | 'terminal' | 'unknown';

export interface ITabInfo {
    filePath: string;
    scheme: string;
    label: string;
    groupIndex: number;
    isDirty: boolean;
    isPreview: boolean;
    isPinned: boolean;
    isActive: boolean;
    tabType: TTabType;
}

export interface ITreeNode {
    type: ETreeNodeType;
    label: string;
    path: string;
    children: ITreeNode[];
    tabInfo?: ITabInfo;
}

export interface IBuildTreeInput {
    tabs: ITabInfo[];
    workspaceRoots: string[];
    tabGroupCount: number;
}
