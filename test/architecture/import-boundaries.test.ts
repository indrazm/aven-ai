import {existsSync, readFileSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {extname, relative, resolve} from 'node:path';
import {parse} from '@babel/eslint-parser';
import {describe, expect, it} from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');

const allowedDependencies: Record<string, ReadonlySet<string>> = {
	root: new Set(['modules/app']),
	utils: new Set(['utils']),
	'libs/config': new Set(['libs/config', 'libs/provider-definitions', 'utils']),
	'libs/lexa': new Set(['libs/lexa', 'utils']),
	'libs/provider-clients': new Set(['libs/provider-clients', 'libs/provider-definitions', 'utils']),
	'libs/provider-definitions': new Set(['libs/provider-definitions', 'utils']),
	'libs/pty': new Set(['libs/pty', 'utils']),
	'libs/session-storage': new Set(['libs/session-storage', 'utils']),
	'libs/terminal': new Set(['libs/terminal', 'utils']),
	'modules/providers': new Set([
		'modules/providers',
		'libs/config',
		'libs/provider-clients',
		'libs/provider-definitions',
		'utils',
	]),
	'modules/sessions': new Set(['modules/sessions', 'libs/session-storage', 'utils']),
	'modules/conversation': new Set(['modules/conversation', 'libs/terminal', 'utils']),
	'modules/commands': new Set(['modules/commands', 'utils']),
	'modules/agent': new Set([
		'modules/agent',
		'modules/conversation',
		'modules/providers',
		'modules/sessions',
		'libs/config',
		'libs/lexa',
		'libs/provider-clients',
		'libs/pty',
		'libs/session-storage',
		'utils',
	]),
	'modules/composer': new Set(['modules/composer', 'modules/agent', 'modules/commands', 'libs/terminal', 'utils']),
	'modules/overlays': new Set([
		'modules/overlays',
		'modules/commands',
		'modules/conversation',
		'modules/providers',
		'modules/sessions',
		'libs/terminal',
		'utils',
	]),
	'modules/app': new Set([
		'modules/app',
		'modules/agent',
		'modules/commands',
		'modules/composer',
		'modules/conversation',
		'modules/overlays',
		'modules/providers',
		'modules/sessions',
		'libs/lexa',
		'libs/terminal',
		'utils',
	]),
};

const architecturePackage = (module: string): string | undefined => {
	if (module === 'index.ts') return 'root';
	const [kind, name] = module.split('/');
	if (kind === 'utils') return 'utils';
	if ((kind === 'libs' || kind === 'modules') && name) return `${kind}/${name}`;
	return undefined;
};

const sourceFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, {withFileTypes: true});
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) return sourceFiles(path);
			if (!['.ts', '.tsx'].includes(extname(entry.name)) || entry.name.includes('.test.')) return [];
			return [path];
		}),
	);
	return files.flat();
};

const relativeModule = (path: string): string => relative(sourceRoot, path).replaceAll('\\', '/');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const stringLiteralValue = (value: unknown): string | undefined => {
	if (!isRecord(value)) return undefined;
	return (value.type === 'Literal' || value.type === 'StringLiteral') && typeof value.value === 'string'
		? value.value
		: undefined;
};

const moduleSpecifiers = (path: string): string[] => {
	const source = parse(readFileSync(path, 'utf8'), {
		requireConfigFile: false,
		babelOptions: {
			presets: [['@babel/preset-typescript', {ignoreExtensions: true}]],
			parserOpts: {plugins: path.endsWith('.tsx') ? ['jsx'] : []},
		},
	});
	const specifiers: string[] = [];
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (!isRecord(node)) return;
		if (
			node.type === 'ImportDeclaration' ||
			node.type === 'ExportNamedDeclaration' ||
			node.type === 'ExportAllDeclaration'
		) {
			const sourceValue = stringLiteralValue(node.source);
			if (sourceValue) specifiers.push(sourceValue);
		}
		if (node.type === 'ImportExpression') {
			const sourceValue = stringLiteralValue(node.source);
			if (sourceValue) specifiers.push(sourceValue);
		}
		for (const [key, value] of Object.entries(node)) {
			if (!['loc', 'start', 'end', 'range'].includes(key)) visit(value);
		}
	};
	visit(source);
	return specifiers.filter((specifier) => specifier.startsWith('.'));
};

const resolveSourceImport = (importer: string, specifier: string): string | undefined => {
	const unresolved = resolve(importer, '..', specifier).replace(/\.js$/u, '');
	return [
		`${unresolved}.ts`,
		`${unresolved}.tsx`,
		resolve(unresolved, 'index.ts'),
		resolve(unresolved, 'index.tsx'),
	].find((candidate) => existsSync(candidate));
};

const dependencyGraph = async (): Promise<Map<string, string[]>> => {
	const files = await sourceFiles(sourceRoot);
	return new Map(
		files.map((path) => [
			relativeModule(path),
			moduleSpecifiers(path).flatMap((specifier) => {
				const target = resolveSourceImport(path, specifier);
				return target ? [relativeModule(target)] : [];
			}),
		]),
	);
};

const cyclesIn = (graph: ReadonlyMap<string, readonly string[]>): string[][] => {
	const visited = new Set<string>();
	const active = new Set<string>();
	const stack: string[] = [];
	const cycles: string[][] = [];

	const visit = (module: string): void => {
		visited.add(module);
		active.add(module);
		stack.push(module);
		for (const dependency of graph.get(module) ?? []) {
			if (!visited.has(dependency)) visit(dependency);
			else if (active.has(dependency)) {
				const start = stack.indexOf(dependency);
				cycles.push([...stack.slice(start), dependency]);
			}
		}
		stack.pop();
		active.delete(module);
	};

	for (const module of graph.keys()) {
		if (!visited.has(module)) visit(module);
	}
	return cycles;
};

describe('source architecture', () => {
	it('enforces the documented dependency direction', async () => {
		const violations: string[] = [];
		for (const [module, dependencies] of await dependencyGraph()) {
			const sourcePackage = architecturePackage(module);
			const allowed = sourcePackage ? allowedDependencies[sourcePackage] : undefined;
			if (!allowed) {
				violations.push(`${module} has no declared architecture package`);
				continue;
			}
			for (const dependency of dependencies) {
				const targetPackage = architecturePackage(dependency);
				if (!targetPackage || !allowed.has(targetPackage)) violations.push(`${module} -> ${dependency}`);
			}
		}
		expect(violations).toEqual([]);
	});

	it('requires public indexes for cross-package imports', async () => {
		const violations: string[] = [];
		for (const [module, dependencies] of await dependencyGraph()) {
			const sourcePackage = architecturePackage(module);
			for (const dependency of dependencies) {
				const targetPackage = architecturePackage(dependency);
				if (
					targetPackage &&
					targetPackage !== 'utils' &&
					targetPackage !== sourcePackage &&
					dependency !== `${targetPackage}/index.ts`
				)
					violations.push(`${module} -> ${dependency}`);
			}
		}
		expect(violations).toEqual([]);
	});

	it('does not contain circular source dependencies', async () => {
		expect(cyclesIn(await dependencyGraph())).toEqual([]);
	});
});
