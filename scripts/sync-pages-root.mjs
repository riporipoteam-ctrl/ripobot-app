import { cp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'dist');
const entries = await readdir(output, { withFileTypes: true });

await rm(resolve(root, 'assets'), { recursive: true, force: true });

for (const entry of entries) {
  await cp(resolve(output, entry.name), resolve(root, entry.name), { recursive: true, force: true });
}

console.log('Copied the production build to the GitHub Pages document root.');
