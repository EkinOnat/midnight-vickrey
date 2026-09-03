import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'managed', 'vickrey');
const destination = path.join(root, 'public', 'managed', 'vickrey');

for (const directory of ['keys', 'zkir']) {
  const from = path.join(source, directory);
  const to = path.join(destination, directory);
  if (!fs.existsSync(from)) {
    throw new Error(`Missing managed/vickrey/${directory}; run npm run compile first.`);
  }
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const file = path.join(from, name);
    if (fs.statSync(file).isFile()) fs.copyFileSync(file, path.join(to, name));
  }
}

console.log('Staged Vickrey proving keys and ZKIR for the browser.');
