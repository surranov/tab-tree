import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'images/icon.svg');
const pngPath = resolve(root, 'images/icon.png');

const svg = readFileSync(svgPath);
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
const rendered = resvg.render();
writeFileSync(pngPath, rendered.asPng());
console.log(`wrote ${pngPath} (${rendered.width}×${rendered.height})`);
