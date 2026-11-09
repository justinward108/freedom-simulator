// Bundles index.html, styles.css and src/*.js into one self-contained file in dist/,
// for sharing or previewing the prototype without a web server. Usage: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${readFileSync(join(root, href), 'utf8')}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${code}</script>`;
});

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'freedom-simulator.html');
writeFileSync(out, html);
console.log('Wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
