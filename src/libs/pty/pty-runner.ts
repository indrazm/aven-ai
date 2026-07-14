import process from 'node:process';
import {accessSync, chmodSync, constants, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import * as nodePty from 'node-pty';
import stripAnsi from 'strip-ansi';

export type ExecCommandResult = {
	command: string;
	cwd: string;
	exitCode: number | null;
	signal: number | null;
	timedOut: boolean;
	truncated: boolean;
	output: string;
};

export type ExecCommandOptions = {
	signal?: AbortSignal;
	timeoutMs?: number;
};

export interface PtyRunner {
	run(command: string, options?: ExecCommandOptions): Promise<ExecCommandResult>;
	dispose(): void;
}

const OUTPUT_LIMIT = 64 * 1024;
const OUTPUT_HALF = OUTPUT_LIMIT / 2;
const DEFAULT_TIMEOUT = 120_000;
const TRUNCATION_MARKER = '\n… output truncated …\n';

type OutputCapture = {
	first: Buffer;
	tail: Buffer;
	total: number;
};

const appendOutput = (capture: OutputCapture, data: string): void => {
	const chunk = Buffer.from(data);
	capture.total += chunk.length;
	let offset = 0;
	if (capture.first.length < OUTPUT_HALF) {
		const remaining = OUTPUT_HALF - capture.first.length;
		const firstPart = chunk.subarray(0, remaining);
		capture.first = Buffer.concat([capture.first, firstPart]);
		offset = firstPart.length;
	}
	const combinedTail = Buffer.concat([capture.tail, chunk.subarray(offset)]);
	capture.tail = combinedTail.subarray(Math.max(0, combinedTail.length - OUTPUT_HALF));
};

const captureText = (capture: OutputCapture): {output: string; truncated: boolean} => {
	const truncated = capture.total > OUTPUT_LIMIT;
	const raw = `${capture.first.toString('utf8')}${truncated ? TRUNCATION_MARKER : ''}${capture.tail.toString('utf8')}`;
	return {
		truncated,
		output: stripAnsi(raw)
			.replaceAll('\r\n', '\n')
			.replaceAll('\r', '\n')
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
			.trimEnd(),
	};
};

export const activeShell = (): string => {
	if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe';
	return process.env.SHELL ?? '/bin/sh';
};

const shellCommand = (command: string): {file: string; args: string[]} => {
	if (process.platform === 'win32') {
		const file = activeShell();
		if (process.env.COMSPEC) return {file, args: ['/d', '/s', '/c', command]};
		return {file, args: ['-NoLogo', '-NoProfile', '-Command', command]};
	}
	return {file: activeShell(), args: ['-lc', command]};
};

const ensureSpawnHelperIsExecutable = (): void => {
	if (process.platform === 'win32') return;
	const require = createRequire(import.meta.url);
	const packageRoot = dirname(require.resolve('node-pty/package.json'));
	for (const helper of [
		join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
		join(packageRoot, 'build', 'Release', 'spawn-helper'),
	]) {
		if (!existsSync(helper)) continue;
		try {
			accessSync(helper, constants.X_OK);
		} catch {
			chmodSync(helper, 0o755);
		}
	}
};

export class NodePtyRunner implements PtyRunner {
	readonly cwd: string;
	readonly #active = new Set<nodePty.IPty>();
	readonly #forceTimers = new Map<nodePty.IPty, NodeJS.Timeout>();
	#disposed = false;

	constructor(cwd = process.cwd()) {
		ensureSpawnHelperIsExecutable();
		this.cwd = cwd;
	}

	run(command: string, options: ExecCommandOptions = {}): Promise<ExecCommandResult> {
		if (this.#disposed) return Promise.reject(new Error('PTY runner has been disposed'));
		const normalized = command.trim();
		if (!normalized) return Promise.reject(new Error('Command must not be empty'));
		if (options.signal?.aborted) return Promise.reject(options.signal.reason ?? new Error('Aborted'));

		const shell = shellCommand(normalized);
		const environment = Object.fromEntries(
			Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
		);
		const terminal = nodePty.spawn(shell.file, shell.args, {
			name: 'xterm-256color',
			cwd: this.cwd,
			cols: Math.max(20, process.stdout.columns ?? 120),
			rows: Math.max(5, process.stdout.rows ?? 30),
			env: {...environment, TERM: 'xterm-256color'},
		});
		this.#active.add(terminal);

		return new Promise((resolve, reject) => {
			const capture: OutputCapture = {first: Buffer.alloc(0), tail: Buffer.alloc(0), total: 0};
			let timedOut = false;
			let aborted = false;
			const terminate = () => this.#terminate(terminal);
			const timeout = setTimeout(() => {
				timedOut = true;
				terminate();
			}, options.timeoutMs ?? DEFAULT_TIMEOUT);

			const abort = () => {
				aborted = true;
				terminate();
			};
			options.signal?.addEventListener('abort', abort, {once: true});
			terminal.onData((data) => appendOutput(capture, data));
			terminal.onExit(({exitCode, signal}) => {
				clearTimeout(timeout);
				const forceTimer = this.#forceTimers.get(terminal);
				if (forceTimer) clearTimeout(forceTimer);
				this.#forceTimers.delete(terminal);
				options.signal?.removeEventListener('abort', abort);
				this.#active.delete(terminal);
				if (aborted) {
					reject(options.signal?.reason ?? new Error('Aborted'));
					return;
				}
				const result = captureText(capture);
				resolve({
					command: normalized,
					cwd: this.cwd,
					exitCode: Number.isInteger(exitCode) ? exitCode : null,
					signal: signal !== undefined && Number.isInteger(signal) ? signal : null,
					timedOut,
					truncated: result.truncated,
					output: result.output,
				});
			});
		});
	}

	dispose(): void {
		this.#disposed = true;
		for (const terminal of this.#active) this.#terminate(terminal);
	}

	#terminate(terminal: nodePty.IPty): void {
		if (this.#forceTimers.has(terminal)) return;
		const timer = setTimeout(() => {
			if (this.#active.has(terminal)) terminal.kill('SIGKILL');
		}, 1000);
		this.#forceTimers.set(terminal, timer);
		terminal.kill();
	}
}

export const commandResultDetail = (result: ExecCommandResult): string => {
	const status = result.timedOut ? 'Timed out' : `Exit code: ${result.exitCode ?? 'unknown'}`;
	const signal = result.signal && result.signal !== 0 ? `Signal: ${result.signal}` : '';
	return [status, signal, result.truncated ? 'Output was truncated.' : '', result.output || '(no output)']
		.filter(Boolean)
		.join('\n');
};
