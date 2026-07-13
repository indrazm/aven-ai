import process from 'node:process';
import console from 'node:console';
import {chmod, lstat, mkdir, readFile, readlink, symlink, unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, URL} from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const packagePath = join(projectRoot, 'package.json');
const buildDirectory = join(projectRoot, 'dist');
const binDirectory = resolve(process.env.AVEN_BIN_DIR ?? join(homedir(), '.local', 'bin'));
const argumentsSet = new Set(process.argv.slice(2));
const uninstalling = argumentsSet.delete('--uninstall');
const force = argumentsSet.delete('--force');

if (argumentsSet.size > 0) {
	throw new Error(`Unknown option${argumentsSet.size === 1 ? '' : 's'}: ${[...argumentsSet].join(', ')}`);
}

const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
const binEntries =
	typeof packageManifest.bin === 'string'
		? [[packageManifest.name, packageManifest.bin]]
		: Object.entries(packageManifest.bin ?? {});

if (binEntries.length === 0) throw new Error(`No CLI entries are declared in ${packagePath}`);

const pathExists = async (path) => {
	try {
		return await lstat(path);
	} catch (error) {
		if (error?.code === 'ENOENT') return undefined;
		throw error;
	}
};

const isBuildOutputFromThisCheckout = (path) => {
	const relativePath = relative(buildDirectory, path);
	return (
		relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
	);
};

const install = async (name, source) => {
	const destination = join(binDirectory, name);
	const sourceMetadata = await pathExists(source);
	if (!sourceMetadata?.isFile()) {
		throw new Error(`Built CLI not found at ${source}. Run pnpm build before installing.`);
	}
	await chmod(source, 0o755);
	await mkdir(binDirectory, {recursive: true});

	const destinationMetadata = await pathExists(destination);
	if (destinationMetadata) {
		if (!destinationMetadata.isSymbolicLink()) {
			throw new Error(`Refusing to replace non-symlink command at ${destination}`);
		}
		const currentTarget = resolve(dirname(destination), await readlink(destination));
		if (currentTarget === source) {
			console.log(`${name} is already linked: ${destination} -> ${source}`);
			return;
		}
		if (!isBuildOutputFromThisCheckout(currentTarget) && !force) {
			throw new Error(`Another symlink exists at ${destination}. Re-run with --force to replace it.`);
		}
		await unlink(destination);
	}

	await symlink(source, destination, process.platform === 'win32' ? 'file' : undefined);
	console.log(`Linked ${name}: ${destination} -> ${source}`);
};

const uninstall = async (name, source) => {
	const destination = join(binDirectory, name);
	const destinationMetadata = await pathExists(destination);
	if (!destinationMetadata) {
		console.log(`${name} is not installed at ${destination}`);
		return;
	}
	if (!destinationMetadata.isSymbolicLink()) {
		throw new Error(`Refusing to remove non-symlink command at ${destination}`);
	}
	const currentTarget = resolve(dirname(destination), await readlink(destination));
	if (currentTarget !== source && !isBuildOutputFromThisCheckout(currentTarget)) {
		throw new Error(`Refusing to remove ${destination}; it points to ${currentTarget}, not this checkout.`);
	}
	await unlink(destination);
	console.log(`Removed ${name}: ${destination}`);
};

for (const [name, relativeSource] of binEntries) {
	if (typeof name !== 'string' || typeof relativeSource !== 'string') {
		throw new Error(`Invalid CLI entry in ${packagePath}`);
	}
	const source = resolve(projectRoot, relativeSource);
	if (uninstalling) await uninstall(name, source);
	else await install(name, source);
}

if (!uninstalling) {
	const pathEntries = (process.env.PATH ?? '')
		.split(process.platform === 'win32' ? ';' : ':')
		.map((entry) => resolve(entry));
	if (!pathEntries.includes(binDirectory)) {
		console.warn(
			`${binDirectory} is not currently on PATH. Add it before running ${basename(binEntries[0]?.[0] ?? 'aven')}.`,
		);
	}
}
