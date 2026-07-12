import {chmod, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, URL} from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const packageManifest = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const binPaths =
	typeof packageManifest.bin === 'string' ? [packageManifest.bin] : Object.values(packageManifest.bin ?? {});

if (binPaths.length === 0) throw new Error('No CLI entries are declared in package.json');

for (const relativePath of binPaths) {
	if (typeof relativePath !== 'string') throw new Error('Invalid CLI entry in package.json');
	await chmod(resolve(projectRoot, relativePath), 0o755);
}
