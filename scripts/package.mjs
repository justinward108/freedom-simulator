// Builds the deployable site and a zip of it.
//   dist/site/                          the files Netlify serves
//   dist/freedom-simulator-netlify.zip  the same files, for drag-and-drop deploys
// Usage: npm run package
// Netlify also runs this itself when the repo is linked (see netlify.toml).
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'dist', 'site');

// What the game needs at runtime. Everything else (tests, scripts, docs) stays out.
const FILES = ['index.html', 'styles.css'];
const FOLDERS = ['src', 'assets'];
const SKIP = (name) => name.startsWith('.') || name.toLowerCase().endsWith('.md');

function copyFolder(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (SKIP(name)) continue;
    const src = join(from, name);
    const dest = join(to, name);
    if (statSync(src).isDirectory()) copyFolder(src, dest);
    else copyFileSync(src, dest);
  }
}

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const f of FILES) copyFileSync(join(root, f), join(site, f));
for (const d of FOLDERS) copyFolder(join(root, d), join(site, d));

// ---- A small zip writer (no compression), so packaging needs no extra tools on any OS ----

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function zip(dir) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of listFiles(dir)) {
    const name = Buffer.from(relative(dir, file).split(sep).join('/'));
    const data = readFileSync(file);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const out = join(root, 'dist', 'freedom-simulator-netlify.zip');
writeFileSync(out, zip(site));
console.log('Site:', relative(root, site));
console.log('Zip: ', relative(root, out), '(' + Math.round(statSync(out).size / 1024) + ' KB)');
