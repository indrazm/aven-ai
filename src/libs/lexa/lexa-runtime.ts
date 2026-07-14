import {execFile} from 'node:child_process';
import {dirname} from 'node:path';

const SUPPORTED_TARGETS = new Set(['darwin-arm64', 'darwin-x64', 'linux-x64']);
const NATIVE_MODULE = 'lexa-index';
const SKILL_MODULE = 'lexa-index/skill';

type ModuleImporter = (specifier: string) => Promise<unknown>;
type BinaryVersionRunner = (binaryPath: string) => Promise<string>;

export type LexaRuntime = Readonly<{
	binaryDirectory: string;
	binaryPath: string;
	skill: string;
	version: string;
}>;

export type LoadLexaRuntimeOptions = {
	architecture?: string;
	importModule?: ModuleImporter;
	platform?: string;
	runVersion?: BinaryVersionRunner;
};

const importModule: ModuleImporter = (specifier) => import(specifier);

const runVersion: BinaryVersionRunner = (binaryPath) =>
	new Promise((resolve, reject) => {
		execFile(binaryPath, ['--version'], {encoding: 'utf8', timeout: 10_000}, (error, stdout, stderr) => {
			const output = `${stdout}${stderr}`.trim();
			if (error) {
				reject(new Error([error.message, output].filter(Boolean).join('\n'), {cause: error}));
				return;
			}
			resolve(output);
		});
	});

const record = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const stringExport = (module: unknown, name: string): string | undefined => {
	const value = record(module)?.[name];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const versionPattern = (version: string): RegExp =>
	new RegExp(`(?:^|\\s)${version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:\\s|$)`, 'u');

export const loadLexaRuntime = async (options: LoadLexaRuntimeOptions = {}): Promise<LexaRuntime> => {
	const platform = options.platform ?? process.platform;
	const architecture = options.architecture ?? process.arch;
	const target = `${platform}-${architecture}`;
	if (!SUPPORTED_TARGETS.has(target)) {
		throw new Error(`Aven requires Lexa, which does not currently support ${target}.`);
	}

	let nativeModule: unknown;
	let skillModule: unknown;
	try {
		[nativeModule, skillModule] = await Promise.all([
			(options.importModule ?? importModule)(NATIVE_MODULE),
			(options.importModule ?? importModule)(SKILL_MODULE),
		]);
	} catch (error) {
		throw new Error(
			`Aven could not load its required Lexa installation. Reinstall aven-ai with optional dependencies enabled. ${errorDetail(error)}`,
			{cause: error},
		);
	}

	const binaryPath = stringExport(nativeModule, 'binaryPath');
	const nativeVersion = stringExport(nativeModule, 'lexaVersion');
	const skill = stringExport(skillModule, 'lexaSkill');
	const skillVersion = stringExport(skillModule, 'lexaVersion');
	if (!binaryPath || !nativeVersion || !skill || !skillVersion) {
		throw new Error('Aven loaded an invalid Lexa package. Reinstall aven-ai.');
	}
	if (nativeVersion !== skillVersion) {
		throw new Error(`Aven loaded mismatched Lexa packages (${nativeVersion} and ${skillVersion}). Reinstall aven-ai.`);
	}

	let versionOutput: string;
	try {
		versionOutput = await (options.runVersion ?? runVersion)(binaryPath);
	} catch (error) {
		throw new Error(`Aven could not start its required Lexa ${nativeVersion} binary. ${errorDetail(error)}`, {
			cause: error,
		});
	}
	if (!versionPattern(nativeVersion).test(versionOutput)) {
		throw new Error(
			`Aven expected Lexa ${nativeVersion}, but the packaged binary reported ${versionOutput.trim() || '(no version)'}.`,
		);
	}

	return {binaryDirectory: dirname(binaryPath), binaryPath, skill, version: nativeVersion};
};
