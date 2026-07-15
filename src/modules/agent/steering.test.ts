import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AssistantContent, Usage, type CompletionModel, type CompletionRequest, type Message} from '@anvia/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ConfigStore} from '../../libs/config/index.js';
import type {LexaRuntime} from '../../libs/lexa/index.js';
import type {ExecCommandResult, PtyRunner} from '../../libs/pty/index.js';
import {SessionCatalog} from '../../libs/session-storage/index.js';
import {AnviaAgentRuntime} from './core.js';
import {isSteerableRuntime, type RuntimeEvent, type SubmitRequest} from './types.js';

const directories: string[] = [];

const lexa: LexaRuntime = {
	binaryDirectory: '/managed/lexa/bin',
	binaryPath: '/managed/lexa/bin/lexa',
	skill: '# Lexa\n\nUse the managed index.',
	version: '0.10.0',
};

const ptyResult: ExecCommandResult = {
	command: 'pwd',
	cwd: '/workspace',
	exitCode: 0,
	signal: null,
	timedOut: false,
	truncated: false,
	output: '/workspace',
};

const messageText = (message: Message): string => {
	if (message.role === 'system') return message.content;
	if (message.role !== 'user') return '';
	return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
};

const runtimeFixture = async (model: CompletionModel): Promise<AnviaAgentRuntime> => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-steering-'));
	directories.push(directory);
	const ptyRunner: PtyRunner = {run: vi.fn(async () => ptyResult), dispose: vi.fn()};
	return new AnviaAgentRuntime({
		configStore: new ConfigStore(join(directory, 'config.toml')),
		memoryPath: join(directory, 'memory.sqlite'),
		lexa,
		projectRoot: directory,
		ptyRunner,
		sessionCatalog: new SessionCatalog(join(directory, 'sessions.sqlite')),
		providerFactory: () => ({
			model: () => model,
			listModels: async () => ({data: [{id: 'gpt-5'}]}),
		}),
	});
};

const collect = async (iterator: AsyncIterator<RuntimeEvent>): Promise<RuntimeEvent[]> => {
	const events: RuntimeEvent[] = [];
	while (true) {
		const next = await iterator.next();
		if (next.done) return events;
		events.push(next.value);
	}
};

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('AnviaAgentRuntime steering', () => {
	it('buffers preparation-time steering, forwards active steering with mention context, and closes at terminal', async () => {
		const requests: CompletionRequest[] = [];
		let releaseFirstCompletion: (() => void) | undefined;
		const firstCompletionGate = new Promise<void>((resolve) => {
			releaseFirstCompletion = resolve;
		});
		let markFirstCompletionStarted: (() => void) | undefined;
		const firstCompletionStarted = new Promise<void>((resolve) => {
			markFirstCompletionStarted = resolve;
		});
		const model = {
			provider: 'fake',
			defaultModel: 'fake-model',
			capabilities: {
				streaming: true,
				tools: true,
				toolChoice: true,
				imageInput: false,
				documentInput: false,
				outputSchema: false,
				reasoning: false,
			},
			completion: vi.fn(),
			async *streamCompletion(request: CompletionRequest) {
				requests.push(request);
				const turn = requests.length;
				if (turn === 1) {
					markFirstCompletionStarted?.();
					await firstCompletionGate;
				}
				const output = `answer-${turn}`;
				yield {type: 'text_delta' as const, delta: output};
				yield {
					type: 'final' as const,
					response: {choice: [AssistantContent.text(output)], usage: Usage.empty()},
				};
			},
		} as CompletionModel & {streamCompletion(request: CompletionRequest): AsyncIterable<unknown>};
		const runtime = await runtimeFixture(model);
		await runtime.setup('openai', {apiKey: 'test-key'});
		expect(isSteerableRuntime(runtime)).toBe(true);
		expect(runtime.steer({id: 'early', content: 'too early', mode: 'prompt'})).toBe(false);

		const initial: SubmitRequest = {id: 'initial', content: 'Start', mode: 'prompt'};
		const iterator = runtime.run(initial, new AbortController().signal)[Symbol.asyncIterator]();
		expect(await iterator.next()).toMatchObject({value: {type: 'turn.started'}});
		expect(runtime.steer({id: 'preparing', content: 'Preparation steer', mode: 'prompt'})).toBe(true);

		const remainingEvents = collect(iterator);
		await firstCompletionStarted;
		expect(runtime.steer({id: 'bash-steer', content: 'pwd', mode: 'bash'})).toBe(false);
		expect(
			runtime.steer({
				id: 'active',
				content: 'Inspect @src/app.ts',
				mode: 'prompt',
				mentions: [{path: 'src/app.ts', kind: 'file'}],
			}),
		).toBe(true);
		releaseFirstCompletion?.();
		const events = await remainingEvents;

		expect(requests).toHaveLength(2);
		const steeredHistory = requests[1]?.chatHistory ?? [];
		expect(steeredHistory.map(messageText).some((content) => content.includes('Preparation steer'))).toBe(true);
		expect(steeredHistory.map(messageText).filter((content) => content.includes('<system-reminder>'))).toHaveLength(2);
		const mentionMessage = steeredHistory.find(
			(message) =>
				message.role === 'user' &&
				(message.metadata as {avenDisplayContent?: unknown} | undefined)?.avenDisplayContent === 'Inspect @src/app.ts',
		);
		expect(mentionMessage && messageText(mentionMessage)).toContain('<mention kind="file">src/app.ts</mention>');
		expect(mentionMessage?.metadata).toMatchObject({avenDelivery: 'steer'});
		expect(events.at(-1)).toEqual({type: 'turn.completed', turnId: 'initial'});
		const restored = await runtime.loadHistory();
		expect(restored.flatMap((message) => (message.kind === 'user' ? [message.content] : []))).toEqual(
			expect.arrayContaining(['Start', 'Preparation steer', 'Inspect @src/app.ts']),
		);
		expect(JSON.stringify(restored)).not.toContain('<system-reminder>');

		expect(runtime.steer({id: 'late', content: 'Must not leak', mode: 'prompt'})).toBe(false);
		for await (const _event of runtime.run(
			{id: 'next', content: 'Next request', mode: 'prompt'},
			new AbortController().signal,
		)) {
			// Consume the full run so the terminal lifecycle is exercised.
		}
		expect(requests.flatMap((request) => request.chatHistory.map(messageText))).not.toContain('Must not leak');
		runtime.dispose();
		expect(runtime.steer({id: 'disposed', content: 'No', mode: 'prompt'})).toBe(false);
	});

	it('rejects steering while a direct command owns the runtime', async () => {
		const model = {
			provider: 'fake',
			defaultModel: 'fake-model',
			capabilities: {
				streaming: false,
				tools: false,
				toolChoice: false,
				imageInput: false,
				documentInput: false,
				outputSchema: false,
				reasoning: false,
			},
			completion: vi.fn(),
		} as CompletionModel;
		const runtime = await runtimeFixture(model);
		const events = runtime.run({id: 'bash', content: 'pwd', mode: 'bash'}, new AbortController().signal);
		const iterator = events[Symbol.asyncIterator]();
		expect(await iterator.next()).toMatchObject({value: {type: 'turn.started'}});
		expect(runtime.steer({id: 'steer', content: 'Explain instead', mode: 'prompt'})).toBe(false);
		await iterator.return?.();
		runtime.dispose();
	});
});
