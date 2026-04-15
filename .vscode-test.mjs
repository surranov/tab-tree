import { defineConfig } from '@vscode/test-cli';
import path from 'path';

export default defineConfig({
    files: 'out/test/integration/suite/**/*.test.js',
    version: 'stable',
    workspaceFolder: path.resolve('test/fixtures/workspace'),
    mocha: {
        ui: 'tdd',
        timeout: 30000,
    },
});
