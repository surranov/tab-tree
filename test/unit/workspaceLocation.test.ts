import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { getWorkspaceLocation } from '../../src/workspaceLocation';

beforeEach(() => {
    vscode.__test.reset();
});

describe('getWorkspaceLocation — путь внутри workspace', () => {
    it('файл внутри single-root workspace → возвращает folder и POSIX relative', () => {
        vscode.__test.setWorkspaceFolders(['/project']);

        const result = getWorkspaceLocation('/project/src/app.ts');

        expect(result).toBeDefined();
        expect(result!.folder.uri.fsPath).toBe('/project');
        expect(result!.relative).toBe('src/app.ts');
    });

    it('файл в корне workspace → relative с именем файла', () => {
        vscode.__test.setWorkspaceFolders(['/project']);

        const result = getWorkspaceLocation('/project/a.ts');

        expect(result!.relative).toBe('a.ts');
    });

    it('absPath === folder root → relative пустая строка', () => {
        vscode.__test.setWorkspaceFolders(['/project']);

        const result = getWorkspaceLocation('/project');

        expect(result).toBeDefined();
        expect(result!.relative).toBe('');
    });

    it('multi-root: выбирается folder который владеет файлом', () => {
        vscode.__test.setWorkspaceFolders(['/project-a', '/project-b']);

        const result = getWorkspaceLocation('/project-b/lib/util.ts');

        expect(result!.folder.uri.fsPath).toBe('/project-b');
        expect(result!.relative).toBe('lib/util.ts');
    });
});

describe('getWorkspaceLocation — внешние пути', () => {
    it('файл вне любого workspace folder → undefined', () => {
        vscode.__test.setWorkspaceFolders(['/project']);

        const result = getWorkspaceLocation('/elsewhere/file.ts');

        expect(result).toBeUndefined();
    });

    it('нет открытых workspace folders → undefined', () => {
        const result = getWorkspaceLocation('/project/file.ts');

        expect(result).toBeUndefined();
    });
});

describe('getWorkspaceLocation — Windows-пути (regression issue #12)', () => {
    it('Windows fsPath с обратными слешами → relative нормализован к POSIX', () => {
        vscode.__test.setWorkspaceFolders(['C:\\Users\\project']);

        const result = getWorkspaceLocation('C:\\Users\\project\\src\\file.ts');

        expect(result).toBeDefined();
        expect(result!.relative).toBe('src/file.ts');
    });

    it('Windows root: глубоко вложенный файл → relative с прямыми слешами', () => {
        vscode.__test.setWorkspaceFolders(['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Phantom Brigade\\Scratch\\LiveryGui']);

        const result = getWorkspaceLocation('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Phantom Brigade\\Scratch\\LiveryGui\\source\\notes.txt');

        expect(result).toBeDefined();
        expect(result!.relative).toBe('source/notes.txt');
    });
});
