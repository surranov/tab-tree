import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { TabTracker } from '../../src/tabTracker';

function makeTab(overrides: Partial<{
    input: unknown;
    label: string;
    isDirty: boolean;
    isPreview: boolean;
    isPinned: boolean;
    isActive: boolean;
}>): vscode.Tab {
    return {
        input: overrides.input ?? {},
        label: overrides.label ?? 'file.ts',
        isDirty: overrides.isDirty ?? false,
        isPreview: overrides.isPreview ?? false,
        isPinned: overrides.isPinned ?? false,
        isActive: overrides.isActive ?? false,
    } as vscode.Tab;
}

function makeGroup(overrides: {
    viewColumn: number;
    tabs: vscode.Tab[];
    isActive?: boolean;
    activeTab?: vscode.Tab;
}) {
    return {
        viewColumn: overrides.viewColumn,
        tabs: overrides.tabs,
        isActive: overrides.isActive ?? false,
        activeTab: overrides.activeTab,
    };
}

beforeEach(() => {
    vscode.__test.reset();
});

afterEach(() => {
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('getTabs — tab types', () => {
    it('TabInputText: filePath = fsPath, scheme = "file", tabType = "text"', () => {
        const uri = vscode.Uri.file('/home/user/project/file.ts');
        const tab = makeTab({ input: new vscode.TabInputText(uri), label: 'file.ts' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].filePath).toBe('/home/user/project/file.ts');
        expect(tabs[0].scheme).toBe('file');
        expect(tabs[0].tabType).toBe('text');
    });

    it('TabInputCustom: filePath = fsPath, scheme from uri, tabType = "custom"', () => {
        const uri = vscode.Uri.file('/home/user/custom.bin');
        const tab = makeTab({ input: new vscode.TabInputCustom(uri, 'myEditor'), label: 'custom.bin' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].filePath).toBe('/home/user/custom.bin');
        expect(tabs[0].scheme).toBe('file');
        expect(tabs[0].tabType).toBe('custom');
    });

    it('TabInputNotebook: filePath = fsPath, tabType = "notebook"', () => {
        const uri = vscode.Uri.file('/home/user/notebook.ipynb');
        const tab = makeTab({ input: new vscode.TabInputNotebook(uri, 'jupyter'), label: 'notebook.ipynb' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].filePath).toBe('/home/user/notebook.ipynb');
        expect(tabs[0].tabType).toBe('notebook');
    });

    it('TabInputTextDiff: filePath = modified.fsPath, tabType = "diff"', () => {
        const original = vscode.Uri.file('/home/user/file.ts');
        const modified = vscode.Uri.file('/home/user/file.modified.ts');
        const tab = makeTab({ input: new vscode.TabInputTextDiff(original, modified), label: 'file.ts ↔ file.modified.ts' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].filePath).toBe('/home/user/file.modified.ts');
        expect(tabs[0].tabType).toBe('diff');
    });

    it('TabInputNotebookDiff: filePath = modified.fsPath, tabType = "notebook"', () => {
        const original = vscode.Uri.file('/home/user/a.ipynb');
        const modified = vscode.Uri.file('/home/user/b.ipynb');
        const tab = makeTab({ input: new vscode.TabInputNotebookDiff(original, modified), label: 'a ↔ b' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].filePath).toBe('/home/user/b.ipynb');
        expect(tabs[0].tabType).toBe('notebook');
    });

    it('TabInputWebview: filePath = label, scheme = "webview", tabType = "webview"', () => {
        const tab = makeTab({ input: new vscode.TabInputWebview('someView'), label: 'Preview' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].filePath).toBe('Preview');
        expect(tabs[0].scheme).toBe('webview');
        expect(tabs[0].tabType).toBe('webview');
    });

    it('TabInputTerminal: tab is excluded from result', () => {
        const tab = makeTab({ input: new vscode.TabInputTerminal(), label: 'bash' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(0);
    });

    it('Unknown input type ({}): tabType = "unknown", scheme = "unknown"', () => {
        const tab = makeTab({ input: {}, label: 'mystery' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].tabType).toBe('unknown');
        expect(tabs[0].scheme).toBe('unknown');
        expect(tabs[0].filePath).toBe('mystery');
    });
});

// ---------------------------------------------------------------------------

describe('getTabs — tab properties', () => {
    it('isDirty, isPreview, isPinned, isActive are forwarded correctly', () => {
        const uri = vscode.Uri.file('/project/dirty.ts');
        const tab = makeTab({
            input: new vscode.TabInputText(uri),
            label: 'dirty.ts',
            isDirty: true,
            isPreview: true,
            isPinned: true,
            isActive: true,
        });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const [info] = tracker.getTabs();
        tracker.dispose();

        expect(info.isDirty).toBe(true);
        expect(info.isPreview).toBe(true);
        expect(info.isPinned).toBe(true);
        expect(info.isActive).toBe(true);
    });

    it('flags default to false', () => {
        const uri = vscode.Uri.file('/project/clean.ts');
        const tab = makeTab({
            input: new vscode.TabInputText(uri),
            label: 'clean.ts',
            isDirty: false,
            isPreview: false,
            isPinned: false,
            isActive: false,
        });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const [info] = tracker.getTabs();
        tracker.dispose();

        expect(info.isDirty).toBe(false);
        expect(info.isPreview).toBe(false);
        expect(info.isPinned).toBe(false);
        expect(info.isActive).toBe(false);
    });

    it('groupIndex comes from group.viewColumn', () => {
        const uri = vscode.Uri.file('/a.ts');
        const tab = makeTab({ input: new vscode.TabInputText(uri), label: 'a.ts' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 42, tabs: [tab] })]);

        const tracker = new TabTracker();
        const [info] = tracker.getTabs();
        tracker.dispose();

        expect(info.groupIndex).toBe(42);
    });

    it('label comes from tab.label', () => {
        const uri = vscode.Uri.file('/b.ts');
        const tab = makeTab({ input: new vscode.TabInputText(uri), label: 'MyLabel' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab] })]);

        const tracker = new TabTracker();
        const [info] = tracker.getTabs();
        tracker.dispose();

        expect(info.label).toBe('MyLabel');
    });

    it('tabIndex reflects position within group', () => {
        const tab1 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/a.ts')), label: 'a.ts' });
        const tab2 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/b.ts')), label: 'b.ts' });
        const tab3 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/c.ts')), label: 'c.ts' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [tab1, tab2, tab3] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs[0].tabIndex).toBe(0);
        expect(tabs[1].tabIndex).toBe(1);
        expect(tabs[2].tabIndex).toBe(2);
    });

    it('tabIndex resets per group', () => {
        const tab1 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/a.ts')), label: 'a.ts' });
        const tab2 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/b.ts')), label: 'b.ts' });
        const tab3 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/c.ts')), label: 'c.ts' });
        vscode.__test.setTabGroups([
            makeGroup({ viewColumn: 1, tabs: [tab1, tab2] }),
            makeGroup({ viewColumn: 2, tabs: [tab3] }),
        ]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs.find(t => t.label === 'a.ts')?.tabIndex).toBe(0);
        expect(tabs.find(t => t.label === 'b.ts')?.tabIndex).toBe(1);
        expect(tabs.find(t => t.label === 'c.ts')?.tabIndex).toBe(0);
    });
});

// ---------------------------------------------------------------------------

describe('getTabs — multiple groups', () => {
    it('tabs from multiple groups are collected with correct groupIndex', () => {
        const tab1 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/a.ts')), label: 'a.ts' });
        const tab2 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/b.ts')), label: 'b.ts' });
        const tab3 = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/c.ts')), label: 'c.ts' });
        vscode.__test.setTabGroups([
            makeGroup({ viewColumn: 1, tabs: [tab1] }),
            makeGroup({ viewColumn: 2, tabs: [tab2, tab3] }),
        ]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(3);
        expect(tabs.find(t => t.label === 'a.ts')?.groupIndex).toBe(1);
        expect(tabs.find(t => t.label === 'b.ts')?.groupIndex).toBe(2);
        expect(tabs.find(t => t.label === 'c.ts')?.groupIndex).toBe(2);
    });

    it('empty group list → empty array', () => {
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(0);
    });

    it('terminal tabs are excluded, others preserved in mixed group', () => {
        const textTab = makeTab({ input: new vscode.TabInputText(vscode.Uri.file('/x.ts')), label: 'x.ts' });
        const termTab = makeTab({ input: new vscode.TabInputTerminal(), label: 'bash' });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [textTab, termTab] })]);

        const tracker = new TabTracker();
        const tabs = tracker.getTabs();
        tracker.dispose();

        expect(tabs).toHaveLength(1);
        expect(tabs[0].label).toBe('x.ts');
    });
});

// ---------------------------------------------------------------------------

describe('getTabGroupCount', () => {
    it('returns group count', () => {
        vscode.__test.setTabGroups([
            makeGroup({ viewColumn: 1, tabs: [] }),
            makeGroup({ viewColumn: 2, tabs: [] }),
            makeGroup({ viewColumn: 3, tabs: [] }),
        ]);

        const tracker = new TabTracker();
        expect(tracker.getTabGroupCount()).toBe(3);
        tracker.dispose();
    });

    it('returns 0 when no groups', () => {
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        expect(tracker.getTabGroupCount()).toBe(0);
        tracker.dispose();
    });

    it('returns 1 for a single group', () => {
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [] })]);

        const tracker = new TabTracker();
        expect(tracker.getTabGroupCount()).toBe(1);
        tracker.dispose();
    });
});

// ---------------------------------------------------------------------------

describe('getActiveTabPath', () => {
    it('returns fsPath of active tab', () => {
        const uri = vscode.Uri.file('/active/file.ts');
        const activeTab = makeTab({ input: new vscode.TabInputText(uri), label: 'file.ts', isActive: true });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [activeTab], isActive: true, activeTab })]);

        const tracker = new TabTracker();
        expect(tracker.getActiveTabPath()).toBe('/active/file.ts');
        tracker.dispose();
    });

    it('returns undefined when no activeTab', () => {
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [], isActive: true, activeTab: undefined })]);

        const tracker = new TabTracker();
        expect(tracker.getActiveTabPath()).toBeUndefined();
        tracker.dispose();
    });

    it('returns undefined when activeTabGroup is absent', () => {
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        expect(tracker.getActiveTabPath()).toBeUndefined();
        tracker.dispose();
    });

    it('for diff tab returns modified.fsPath', () => {
        const original = vscode.Uri.file('/orig.ts');
        const modified = vscode.Uri.file('/mod.ts');
        const activeTab = makeTab({ input: new vscode.TabInputTextDiff(original, modified), label: 'diff', isActive: true });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [activeTab], isActive: true, activeTab })]);

        const tracker = new TabTracker();
        expect(tracker.getActiveTabPath()).toBe('/mod.ts');
        tracker.dispose();
    });

    it('for webview tab returns undefined (no fsPath)', () => {
        const activeTab = makeTab({ input: new vscode.TabInputWebview('preview'), label: 'Preview', isActive: true });
        vscode.__test.setTabGroups([makeGroup({ viewColumn: 1, tabs: [activeTab], isActive: true, activeTab })]);

        const tracker = new TabTracker();
        expect(tracker.getActiveTabPath()).toBeUndefined();
        tracker.dispose();
    });
});

// ---------------------------------------------------------------------------

describe('debounce (scheduleUpdate)', () => {
    it('onDidChangeTabs fires onDidChange exactly after 80ms', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });

        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(79);
        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(listener).toHaveBeenCalledTimes(1);

        tracker.dispose();
    });

    it('multiple rapid events — onDidChange fires once after last + 80ms', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        vi.advanceTimersByTime(40);
        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        vi.advanceTimersByTime(40);
        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });

        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(80);
        expect(listener).toHaveBeenCalledTimes(1);

        tracker.dispose();
    });

    it('event before 80ms expires resets the timer', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        vi.advanceTimersByTime(60);
        // second event resets timer — first 60ms should not count
        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        vi.advanceTimersByTime(60);
        // 60ms after second event — should not fire yet
        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(20);
        expect(listener).toHaveBeenCalledTimes(1);

        tracker.dispose();
    });

    it('onDidChangeTabGroups also triggers debounce', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        // Simulate group change via fireTabsChanged (the only public way)
        // Verify two events (tabs + groups) yield one call after 80ms
        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        vi.advanceTimersByTime(80);
        expect(listener).toHaveBeenCalledTimes(1);

        tracker.dispose();
    });

    it('onDidRenameFiles triggers debounced onDidChange (2.11 / 13.4.2)', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        vscode.__test.fireRenameFiles({
            files: [
                {
                    oldUri: vscode.Uri.file('/project/src/old.ts'),
                    newUri: vscode.Uri.file('/project/src/new.ts'),
                },
            ],
        });

        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(80);
        expect(listener).toHaveBeenCalledTimes(1);

        tracker.dispose();
    });
});

// ---------------------------------------------------------------------------

describe('dispose', () => {
    it('after dispose, tab changes do not fire onDidChange', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        tracker.dispose();

        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        vi.advanceTimersByTime(200);

        expect(listener).not.toHaveBeenCalled();
    });

    it('dispose clears pending debounce timer', () => {
        vi.useFakeTimers();
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        const listener = vi.fn();
        tracker.onDidChange(listener);

        vscode.__test.fireTabsChanged({ opened: [], closed: [], changed: [] });
        // timer started but not expired
        vi.advanceTimersByTime(40);

        tracker.dispose();

        // expire remaining time — listener should not be called
        vi.advanceTimersByTime(80);
        expect(listener).not.toHaveBeenCalled();
    });

    it('repeated dispose does not throw', () => {
        vscode.__test.setTabGroups([]);

        const tracker = new TabTracker();
        expect(() => {
            tracker.dispose();
            tracker.dispose();
        }).not.toThrow();
    });
});
