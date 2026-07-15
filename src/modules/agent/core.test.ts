import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AssistantContent, Message, Usage, type CompletionModel, type CompletionRequest} from '@anvia/core';
import {createSqliteMemoryStore} from '@anvia/memory-sqlite';
import {createAppStore} from '../app/index.js';
import {AnviaAgentRuntime, type ProviderFactory} from './core.js';
import {ConfigStore} from '../../libs/config/index.js';
import type {ExecCommandResult, PtyRunner} from '../../libs/pty/index.js';
import {SessionCatalog} from '../../libs/session-storage/index.js';
import {MAX_AGENT_TURNS} from './services/prompt-turn-executor.js';
import type {LexaRuntime} from '../../libs/lexa/index.js';

const directories: string[] = [];

const lexa: LexaRuntime = {
	binaryDirectory: '/managed/lexa/bin',
	binaryPath: '/managed/lexa/bin/lexa',
	skill: '# Lexa\n\nUse the managed index.',
	version: '0.10.0',
};

const model: CompletionModel = {
	provider: 'fake',
	defaultModel: 'fake-model',
	capabilities: {
		streaming: false,
		tools: true,
		toolChoice: true,
		imageInput: false,
		documentInput: false,
		outputSchema: false,
		reasoning: false,
	},
	completion: vi.fn(),
};

const runtimeFixture = async (factory: ProviderFactory, ptyRunner?: PtyRunner) => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-runtime-'));
	directories.push(directory);
	return new AnviaAgentRuntime({
		configStore: new ConfigStore(join(directory, 'config.toml')),
		memoryPath: join(directory, 'memory.sqlite'),
		lexa,
		projectRoot: directory,
		sessionCatalog: new SessionCatalog(join(directory, 'sessions.sqlite')),
		providerFactory: factory,
		...(ptyRunner ? {ptyRunner} : {}),
	});
};

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('AnviaAgentRuntime configuration', () => {
	it('verifies before persisting and connecting a provider', async () => {
		const listModels = vi.fn(async () => ({data: [{id: 'gpt-5'}, {id: 'gpt-5-mini'}]}));
		const runtime = await runtimeFixture(() => ({model: () => model, listModels}));
		const connected = await runtime.setup('openai', {apiKey: 'test-key'});

		expect(listModels).toHaveBeenCalledOnce();
		expect(connected).toMatchObject({status: 'connected', provider: 'openai', model: 'gpt-5'});
		expect(await runtime.providerStatuses()).toContainEqual(
			expect.objectContaining({id: 'openai', configured: true, active: true}),
		);
		expect(await runtime.modelStatuses()).toEqual([
			{id: 'gpt-5', active: true},
			{id: 'gpt-5-mini', active: false},
		]);
		expect(await runtime.selectModel('gpt-5-mini')).toMatchObject({model: 'gpt-5-mini'});
		expect(await runtime.modelStatuses()).toContainEqual({id: 'gpt-5-mini', active: true});
		runtime.dispose();
	});

	it('does not persist an API key when verification fails', async () => {
		const runtime = await runtimeFixture(() => ({
			model: () => model,
			listModels: async () => {
				throw new Error('invalid key');
			},
		}));

		await expect(runtime.setup('anthropic', {apiKey: 'bad-key'})).rejects.toThrow('invalid key');
		expect(await runtime.providerStatuses()).toContainEqual(
			expect.objectContaining({id: 'anthropic', configured: false, active: false}),
		);
		runtime.dispose();
	});

	it('claims the legacy global history for the first initialized project', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'aven-runtime-legacy-'));
		directories.push(directory);
		const memoryPath = join(directory, 'memory.sqlite');
		const memory = createSqliteMemoryStore({path: memoryPath});
		await memory.append({
			context: {sessionId: 'aven-default'},
			runId: 'legacy-run',
			turn: 1,
			messages: [Message.user('Legacy prompt')],
		});
		const runtime = new AnviaAgentRuntime({
			configStore: new ConfigStore(join(directory, 'config.toml')),
			memoryPath,
			lexa,
			projectRoot: directory,
			sessionCatalog: new SessionCatalog(join(directory, 'sessions.sqlite')),
			providerFactory: () => ({model: () => model, listModels: async () => ({data: []})}),
		});

		await runtime.initializeSessions();
		const legacy = (await runtime.listSessions()).find((session) => session.id === 'aven-default');
		expect(legacy).toMatchObject({title: 'Legacy session', projectRoot: runtime.getProjectRoot(), persisted: true});
		const switched = await runtime.switchSession('aven-default');
		expect(switched.messages).toContainEqual(expect.objectContaining({kind: 'user', content: 'Legacy prompt'}));
		runtime.dispose();
	});

	it('uses the PTY runner for direct bash requests', async () => {
		const result: ExecCommandResult = {
			command: 'pwd',
			cwd: '/workspace',
			exitCode: 0,
			signal: null,
			timedOut: false,
			truncated: false,
			output: '/workspace',
		};
		const ptyRunner: PtyRunner = {run: vi.fn(async () => result), dispose: vi.fn()};
		const runtime = await runtimeFixture(
			() => ({model: () => model, listModels: async () => ({data: [{id: 'gpt-5'}]})}),
			ptyRunner,
		);
		const originalSession = runtime.getActiveSession();
		const events = [];
		for await (const event of runtime.run({id: 'bash', content: 'pwd', mode: 'bash'}, new AbortController().signal))
			events.push(event);

		expect(ptyRunner.run).toHaveBeenCalledWith('pwd', expect.objectContaining({signal: expect.any(AbortSignal)}));
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({status: 'success', detail: expect.stringContaining('/workspace')}),
			}),
		);
		expect(await runtime.loadHistory()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({kind: 'user', variant: 'bash', content: 'pwd'}),
				expect.objectContaining({kind: 'tool', name: 'ExecCommand', status: 'success'}),
			]),
		);
		expect(runtime.getActiveSession()).toMatchObject({
			id: originalSession.id,
			title: '$ pwd',
			persisted: true,
		});
		const emptySession = runtime.startNewSession();
		expect(emptySession).toMatchObject({title: 'New session', persisted: false});
		expect((await runtime.listSessions()).map((session) => session.id)).toEqual([emptySession.id, originalSession.id]);
		const replacementSession = runtime.startNewSession();
		expect((await runtime.listSessions()).map((session) => session.id)).toEqual([
			replacementSession.id,
			originalSession.id,
		]);
		const switched = await runtime.switchSession(originalSession.id);
		expect(switched.messages).toEqual(
			expect.arrayContaining([expect.objectContaining({kind: 'user', variant: 'bash', content: 'pwd'})]),
		);
		runtime.dispose();
	});

	it('blocks session changes while a turn iterator is active', async () => {
		const result: ExecCommandResult = {
			command: 'pwd',
			cwd: '/workspace',
			exitCode: 0,
			signal: null,
			timedOut: false,
			truncated: false,
			output: '/workspace',
		};
		const ptyRunner: PtyRunner = {run: vi.fn(async () => result), dispose: vi.fn()};
		const runtime = await runtimeFixture(() => ({model: () => model, listModels: async () => ({data: []})}), ptyRunner);
		const events = runtime.run({id: 'busy', content: 'pwd', mode: 'bash'}, new AbortController().signal);
		const iterator = events[Symbol.asyncIterator]();
		expect(await iterator.next()).toMatchObject({value: {type: 'turn.started'}});
		expect(() => runtime.startNewSession()).toThrow('active turn');
		await iterator.return?.();
		expect(runtime.startNewSession()).toMatchObject({title: 'New session'});
		runtime.dispose();
	});

	it('streams an agent tool loop and reloads its shared SQLite history', async () => {
		let modelTurn = 0;
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion() {
				modelTurn += 1;
				if (modelTurn === 1) {
					yield {type: 'text_delta' as const, delta: 'Checking the workspace.'};
					yield {
						type: 'final' as const,
						response: {
							choice: [
								AssistantContent.text('Checking the workspace.'),
								AssistantContent.toolCall('call-1', 'ExecCommand', {command: 'pwd'}),
							],
							usage: Usage.empty(),
						},
					};
					return;
				}
				yield {type: 'text_delta' as const, delta: 'Workspace inspected.'};
				yield {
					type: 'final' as const,
					response: {choice: [AssistantContent.text('Workspace inspected.')], usage: Usage.empty()},
				};
			},
		} as CompletionModel & {streamCompletion: () => AsyncIterable<unknown>};
		const result: ExecCommandResult = {
			command: 'pwd',
			cwd: '/workspace',
			exitCode: 0,
			signal: null,
			timedOut: false,
			truncated: false,
			output: '/workspace',
		};
		const ptyRunner: PtyRunner = {run: vi.fn(async () => result), dispose: vi.fn()};
		const runtime = await runtimeFixture(
			() => ({model: () => streamingModel, listModels: async () => ({data: [{id: 'gpt-5'}]})}),
			ptyRunner,
		);
		await runtime.setup('openai', {apiKey: 'test-key'});
		const events = [];
		for await (const event of runtime.run(
			{id: 'prompt', content: 'Inspect the workspace', mode: 'prompt'},
			new AbortController().signal,
		))
			events.push(event);

		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.appended',
				message: expect.objectContaining({name: 'ExecCommand', status: 'running'}),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({type: 'message.replaced', message: expect.objectContaining({status: 'success'})}),
		);
		expect(events).toContainEqual({
			type: 'assistant.delta',
			messageId: 'assistant-prompt-turn-2',
			delta: 'Workspace inspected.',
		});
		expect(events.at(-1)).toEqual({type: 'turn.completed', turnId: 'prompt'});
		const store = createAppStore();
		for (const event of events) store.getState().applyRuntimeEvent(event);
		expect(store.getState().messages.map((message) => message.kind)).toEqual([
			'user',
			'assistant',
			'tool',
			'assistant',
		]);
		expect(store.getState().messages.map((message) => (message.kind === 'assistant' ? message.content : ''))).toEqual([
			'',
			'Checking the workspace.',
			'',
			'Workspace inspected.',
		]);

		const history = await runtime.loadHistory();
		expect(history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({kind: 'user', content: 'Inspect the workspace'}),
				expect.objectContaining({kind: 'tool', summary: 'pwd', status: 'success'}),
				expect.objectContaining({kind: 'assistant', content: 'Workspace inspected.'}),
			]),
		);
		runtime.dispose();
	});

	it('can complete a tool-driven task that requires more than eight model turns', async () => {
		expect(MAX_AGENT_TURNS).toBe(50);
		let modelTurn = 0;
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion() {
				modelTurn += 1;
				const choice =
					modelTurn <= 9
						? [AssistantContent.toolCall(`call-${modelTurn}`, 'ExecCommand', {command: `step-${modelTurn}`})]
						: [AssistantContent.text('All nine steps completed.')];
				yield {type: 'final' as const, response: {choice, usage: Usage.empty()}};
			},
		} as CompletionModel & {streamCompletion: () => AsyncIterable<unknown>};
		const ptyRunner: PtyRunner = {
			run: vi.fn(async (command) => ({
				command,
				cwd: '/workspace',
				exitCode: 0,
				signal: null,
				timedOut: false,
				truncated: false,
				output: command,
			})),
			dispose: vi.fn(),
		};
		const runtime = await runtimeFixture(
			() => ({model: () => streamingModel, listModels: async () => ({data: [{id: 'gpt-5'}]})}),
			ptyRunner,
		);
		await runtime.setup('openai', {apiKey: 'test-key'});
		const events = [];
		for await (const event of runtime.run(
			{id: 'long-prompt', content: 'Complete all nine steps', mode: 'prompt'},
			new AbortController().signal,
		)) {
			events.push(event);
		}

		expect(modelTurn).toBe(10);
		expect(ptyRunner.run).toHaveBeenCalledTimes(9);
		expect(events.at(-1)).toEqual({type: 'turn.completed', turnId: 'long-prompt'});
		expect(events).toContainEqual({
			type: 'assistant.delta',
			messageId: 'assistant-long-prompt-turn-10',
			delta: 'All nine steps completed.',
		});
		runtime.dispose();
	});

	it('reloads hierarchical project instructions for every prompt run', async () => {
		const instructions: string[] = [];
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion(request: CompletionRequest) {
				instructions.push(request.instructions ?? '');
				yield {
					type: 'final' as const,
					response: {choice: [AssistantContent.text('Done.')], usage: Usage.empty()},
				};
			},
		} as CompletionModel & {streamCompletion: (request: CompletionRequest) => AsyncIterable<unknown>};
		const runtime = await runtimeFixture(() => ({
			model: () => streamingModel,
			listModels: async () => ({data: [{id: 'gpt-5'}]}),
		}));
		await runtime.setup('openai', {apiKey: 'test-key'});
		const rulesPath = join(runtime.getProjectRoot(), 'AGENTS.md');
		await writeFile(rulesPath, 'FIRST_RULE_VERSION');
		for await (const _event of runtime.run(
			{id: 'rules-one', content: 'First prompt', mode: 'prompt'},
			new AbortController().signal,
		)) {
			// Consume the first prompt.
		}
		await writeFile(rulesPath, 'SECOND_RULE_VERSION');
		for await (const _event of runtime.run(
			{id: 'rules-two', content: 'Second prompt', mode: 'prompt'},
			new AbortController().signal,
		)) {
			// Consume the second prompt.
		}

		expect(instructions).toHaveLength(2);
		expect(instructions[0]).toContain('FIRST_RULE_VERSION');
		expect(instructions[1]).toContain('SECOND_RULE_VERSION');
		expect(instructions[1]).not.toContain('FIRST_RULE_VERSION');
		runtime.dispose();
	});

	it('keeps varied command failures separate and retains a global circuit breaker', async () => {
		let modelTurn = 0;
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion() {
				modelTurn += 1;
				yield {
					type: 'final' as const,
					response: {
						choice: [
							AssistantContent.toolCall(`failure-${modelTurn}`, 'ExecCommand', {
								command: `fail-${modelTurn}`,
							}),
						],
						usage: Usage.empty(),
					},
				};
			},
		} as CompletionModel & {streamCompletion: () => AsyncIterable<unknown>};
		const ptyRunner: PtyRunner = {
			run: vi.fn(async (command) => ({
				command,
				cwd: '/workspace',
				exitCode: 1,
				signal: null,
				timedOut: false,
				truncated: false,
				output: 'failed',
			})),
			dispose: vi.fn(),
		};
		const runtime = await runtimeFixture(
			() => ({model: () => streamingModel, listModels: async () => ({data: [{id: 'gpt-5'}]})}),
			ptyRunner,
		);
		await runtime.setup('openai', {apiKey: 'test-key'});
		const events = [];
		let failure: unknown;
		try {
			for await (const event of runtime.run(
				{id: 'failing-prompt', content: 'Keep trying', mode: 'prompt'},
				new AbortController().signal,
			)) {
				events.push(event);
			}
		} catch (error) {
			failure = error;
		}

		const visibleFailures = events.filter(
			(event) => event.type === 'message.replaced' && event.message.kind === 'tool' && event.message.status === 'error',
		);
		expect(modelTurn).toBe(10);
		expect(ptyRunner.run).toHaveBeenCalledTimes(10);
		expect(visibleFailures).toHaveLength(10);
		expect(JSON.stringify(events)).not.toContain('agent_guidance');
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain('Tool calls failed 10 consecutive times without a success.');
		runtime.dispose();
	});

	it('skips a third repeated tool call and stops after the fifth repetition', async () => {
		let modelTurn = 0;
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion() {
				modelTurn += 1;
				yield {
					type: 'final' as const,
					response: {
						choice: [AssistantContent.toolCall(`repeat-${modelTurn}`, 'ExecCommand', {command: 'pwd'})],
						usage: Usage.empty(),
					},
				};
			},
		} as CompletionModel & {streamCompletion: () => AsyncIterable<unknown>};
		const ptyRunner: PtyRunner = {
			run: vi.fn(async (command) => ({
				command,
				cwd: '/workspace',
				exitCode: 0,
				signal: null,
				timedOut: false,
				truncated: false,
				output: '/workspace',
			})),
			dispose: vi.fn(),
		};
		const runtime = await runtimeFixture(
			() => ({model: () => streamingModel, listModels: async () => ({data: [{id: 'gpt-5'}]})}),
			ptyRunner,
		);
		await runtime.setup('openai', {apiKey: 'test-key'});
		const events = [];
		let failure: unknown;
		try {
			for await (const event of runtime.run(
				{id: 'repeating-prompt', content: 'Repeat forever', mode: 'prompt'},
				new AbortController().signal,
			)) {
				events.push(event);
			}
		} catch (error) {
			failure = error;
		}

		const skippedResults = events.filter(
			(event) =>
				event.type === 'message.replaced' &&
				event.message.kind === 'tool' &&
				event.message.detail?.includes('repeating tool-call pattern') === true,
		);
		expect(modelTurn).toBe(5);
		expect(ptyRunner.run).toHaveBeenCalledTimes(2);
		expect(skippedResults).toHaveLength(3);
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain('repeating tool-call pattern occurred 5 times');
		runtime.dispose();
	});

	it('runs a Read-to-Edit tool loop and emits the resulting file diff', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'aven-runtime-file-'));
		directories.push(directory);
		const path = join(directory, 'source.txt');
		await writeFile(path, 'before\n');
		let modelTurn = 0;
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion() {
				modelTurn += 1;
				if (modelTurn === 1) {
					yield {
						type: 'final' as const,
						response: {
							choice: [AssistantContent.toolCall('read-1', 'Read', {file_path: path})],
							usage: Usage.empty(),
						},
					};
					return;
				}
				if (modelTurn === 2) {
					yield {
						type: 'final' as const,
						response: {
							choice: [
								AssistantContent.toolCall('edit-1', 'Edit', {
									file_path: path,
									old_string: 'before',
									new_string: 'after',
								}),
							],
							usage: Usage.empty(),
						},
					};
					return;
				}
				yield {type: 'text_delta' as const, delta: 'Updated the file.'};
				yield {
					type: 'final' as const,
					response: {choice: [AssistantContent.text('Updated the file.')], usage: Usage.empty()},
				};
			},
		} as CompletionModel & {streamCompletion: () => AsyncIterable<unknown>};
		const runtime = await runtimeFixture(() => ({
			model: () => streamingModel,
			listModels: async () => ({data: [{id: 'gpt-5'}]}),
		}));
		await runtime.setup('openai', {apiKey: 'test-key'});
		const events = [];
		for await (const event of runtime.run(
			{id: 'file-prompt', content: 'Update the file', mode: 'prompt'},
			new AbortController().signal,
		)) {
			events.push(event);
		}

		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({name: 'Read', status: 'success', group: 'read'}),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({name: 'Edit', status: 'success', group: 'edit'}),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.appended',
				message: expect.objectContaining({
					id: 'diff-tool-file-prompt-2-edit-1',
					kind: 'diff',
					file: path,
					presentation: 'patch',
					additions: 1,
					deletions: 1,
					hunks: [expect.objectContaining({lines: ['-before', '+after']})],
				}),
			}),
		);
		expect(await readFile(path, 'utf8')).toBe('after\n');
		expect(await runtime.loadHistory()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({kind: 'tool', name: 'Read', status: 'success'}),
				expect.objectContaining({kind: 'tool', name: 'Edit', status: 'success'}),
			]),
		);
		runtime.dispose();
	});

	it('clears Read-before-Edit state when starting a new session', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'aven-runtime-isolation-'));
		directories.push(directory);
		const path = join(directory, 'isolated.txt');
		await writeFile(path, 'before');
		let modelTurn = 0;
		const streamingModel = {
			...model,
			capabilities: {...model.capabilities, streaming: true},
			async *streamCompletion() {
				modelTurn += 1;
				const choice =
					modelTurn === 1
						? [AssistantContent.toolCall('read-isolation', 'Read', {file_path: path})]
						: modelTurn === 2
							? [AssistantContent.text('Read complete.')]
							: modelTurn === 3
								? [
										AssistantContent.toolCall('edit-isolation', 'Edit', {
											file_path: path,
											old_string: 'before',
											new_string: 'after',
										}),
									]
								: [AssistantContent.text('Edit attempted.')];
				yield {type: 'final' as const, response: {choice, usage: Usage.empty()}};
			},
		} as CompletionModel & {streamCompletion: () => AsyncIterable<unknown>};
		const runtime = await runtimeFixture(() => ({
			model: () => streamingModel,
			listModels: async () => ({data: [{id: 'gpt-5'}]}),
		}));
		await runtime.setup('openai', {apiKey: 'test-key'});
		for await (const _event of runtime.run(
			{id: 'read-session', content: 'Read it', mode: 'prompt'},
			new AbortController().signal,
		)) {
			// Consume the first session.
		}
		runtime.startNewSession();
		const events = [];
		for await (const event of runtime.run(
			{id: 'edit-session', content: 'Edit it', mode: 'prompt'},
			new AbortController().signal,
		)) {
			events.push(event);
		}

		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({name: 'Edit', status: 'error', detail: expect.stringContaining('Read')}),
			}),
		);
		expect(await readFile(path, 'utf8')).toBe('before');
		runtime.dispose();
	});
});
