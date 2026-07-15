import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import type {StoreApi} from 'zustand/vanilla';
import type {AgentRuntime, RuntimeEvent, SubmitRequest} from '../../agent/index.js';
import {AppProvider, useAppStoreApi} from '../components/app-provider.js';
import type {AppStore} from '../store/app-state.js';
import {type RuntimeSession, useRuntimeSession} from './use-runtime-session.js';

type Harness = {
	session?: RuntimeSession;
	store?: StoreApi<AppStore>;
};

const SessionHarness = ({runtime, harness}: {runtime: AgentRuntime; harness: Harness}) => {
	harness.session = useRuntimeSession(runtime);
	harness.store = useAppStoreApi();
	return null;
};

const renderSession = (runtime: AgentRuntime) => {
	const harness: Harness = {};
	const rendered = render(
		<AppProvider initialMessages={[]}>
			<SessionHarness runtime={runtime} harness={harness} />
		</AppProvider>,
	);
	if (!harness.session || !harness.store) throw new Error('Runtime session harness did not render');
	return {...rendered, session: harness.session, store: harness.store};
};

class GatedRuntime implements AgentRuntime {
	readonly requests: SubmitRequest[] = [];
	readonly steers: SubmitRequest[] = [];
	#releases: Array<() => void> = [];
	activeRuns = 0;
	maximumActiveRuns = 0;
	acceptSteers = true;
	get pendingReleases(): number {
		return this.#releases.length;
	}

	steer(request: SubmitRequest): boolean {
		if (!this.acceptSteers) return false;
		this.steers.push(request);
		return true;
	}

	release(): void {
		this.#releases.shift()?.();
	}

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		this.requests.push(request);
		this.activeRuns += 1;
		this.maximumActiveRuns = Math.max(this.maximumActiveRuns, this.activeRuns);
		try {
			yield {type: 'turn.started', request};
			await new Promise<void>((resolve) => {
				const release = () => {
					signal.removeEventListener('abort', release);
					resolve();
				};
				this.#releases.push(release);
				if (signal.aborted) release();
				else signal.addEventListener('abort', release, {once: true});
			});
			if (!signal.aborted) yield {type: 'turn.completed', turnId: request.id};
		} finally {
			this.activeRuns -= 1;
		}
	}

	dispose(): void {}
}

class SlowInterruptRuntime implements AgentRuntime {
	readonly attempts: string[] = [];
	#finishCleanup: (() => void) | undefined;
	#releaseCurrent: (() => void) | undefined;
	#running = false;

	finishCleanup(): void {
		this.#finishCleanup?.();
	}

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		this.attempts.push(request.content);
		if (this.#running) throw new Error('Another turn is already active.');
		this.#running = true;
		try {
			yield {type: 'turn.started', request};
			await new Promise<void>((resolve) => {
				this.#releaseCurrent = resolve;
				if (signal.aborted) resolve();
				else signal.addEventListener('abort', () => resolve(), {once: true});
			});
			if (signal.aborted) {
				await new Promise<void>((resolve) => {
					this.#finishCleanup = resolve;
				});
				return;
			}
			yield {type: 'turn.completed', turnId: request.id};
		} finally {
			this.#running = false;
		}
	}

	dispose(): void {
		this.#releaseCurrent?.();
		this.#finishCleanup?.();
	}
}

class SlowStartRuntime implements AgentRuntime {
	readonly attempts: string[] = [];
	#release: (() => void) | undefined;

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		this.attempts.push(request.content);
		await new Promise<void>((resolve) => {
			this.#release = resolve;
			if (signal.aborted) resolve();
			else signal.addEventListener('abort', () => resolve(), {once: true});
		});
		if (signal.aborted) return;
		yield {type: 'turn.started', request};
		yield {type: 'turn.completed', turnId: request.id};
	}

	dispose(): void {
		this.#release?.();
	}
}

describe('runtime session queue', () => {
	it('runs every queued request serially in FIFO order', async () => {
		const runtime = new GatedRuntime();
		const {session, store, unmount} = renderSession(runtime);

		expect(session.submit('first', 'prompt')).toBe(true);
		expect(session.enqueue('second', 'prompt')).toBe(true);
		expect(session.enqueue('third', 'prompt')).toBe(true);
		expect(session.enqueue('fourth', 'prompt')).toBe(true);
		await vi.waitFor(() => expect(runtime.requests.map((request) => request.content)).toEqual(['first']));
		await vi.waitFor(() => expect(runtime.pendingReleases).toBe(1));
		expect(store.getState().queuedRequests.map((request) => request.content)).toEqual(['second', 'third', 'fourth']);

		for (const expected of ['second', 'third', 'fourth']) {
			runtime.release();
			await vi.waitFor(() => expect(runtime.requests.at(-1)?.content).toBe(expected));
			await vi.waitFor(() => expect(runtime.pendingReleases).toBe(1));
			expect(runtime.maximumActiveRuns).toBe(1);
		}
		runtime.release();
		await vi.waitFor(() => expect(runtime.activeRuns).toBe(0));
		expect(runtime.requests.map((request) => request.content)).toEqual(['first', 'second', 'third', 'fourth']);
		expect(store.getState().queuedRequests).toEqual([]);
		unmount();
	});

	it('waits for interrupted runtime cleanup before starting queued work', async () => {
		const runtime = new SlowInterruptRuntime();
		const {session, store, unmount} = renderSession(runtime);

		expect(session.submit('first', 'prompt')).toBe(true);
		await vi.waitFor(() => expect(store.getState().activeTurnId).not.toBeNull());
		expect(session.enqueue('second', 'prompt')).toBe(true);
		session.interrupt();
		expect(session.submit('third', 'prompt')).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.attempts).toEqual(['first']);
		expect(store.getState().queuedRequests.map((request) => request.content)).toEqual(['second', 'third']);

		runtime.finishCleanup();
		await vi.waitFor(() => expect(runtime.attempts).toEqual(['first', 'second']));
		expect(store.getState().queuedRequests.map((request) => request.content)).toEqual(['third']);
		expect(store.getState().messages).toContainEqual(expect.objectContaining({content: 'Interrupted by user'}));
		unmount();
	});

	it('hands queued work to a replacement runtime without reviving the disposed worker', async () => {
		const previousRuntime = new SlowInterruptRuntime();
		const nextRuntime = new GatedRuntime();
		const harness: Harness = {};
		const rendered = render(
			<AppProvider initialMessages={[]}>
				<SessionHarness runtime={previousRuntime} harness={harness} />
			</AppProvider>,
		);
		if (!harness.session || !harness.store) throw new Error('Runtime session harness did not render');

		expect(harness.session.submit('first', 'prompt')).toBe(true);
		await vi.waitFor(() => expect(harness.store?.getState().activeTurnId).not.toBeNull());
		expect(harness.session.enqueue('second', 'prompt')).toBe(true);

		rendered.rerender(
			<AppProvider initialMessages={[]}>
				<SessionHarness runtime={nextRuntime} harness={harness} />
			</AppProvider>,
		);

		await vi.waitFor(() => expect(nextRuntime.requests.map((request) => request.content)).toEqual(['second']));
		expect(previousRuntime.attempts).toEqual(['first']);
		expect(harness.store.getState().messages).toContainEqual(
			expect.objectContaining({content: 'The runtime changed before the active turn completed.'}),
		);
		expect(harness.store.getState().queuedRequests).toEqual([]);

		previousRuntime.finishCleanup();
		await vi.waitFor(() => expect(nextRuntime.pendingReleases).toBe(1));
		nextRuntime.release();
		await vi.waitFor(() => expect(nextRuntime.activeRuns).toBe(0));
		rendered.unmount();
	});

	it('records an accepted request when replacement happens before the first runtime event', async () => {
		const previousRuntime = new SlowStartRuntime();
		const nextRuntime = new GatedRuntime();
		const harness: Harness = {};
		const rendered = render(
			<AppProvider initialMessages={[]}>
				<SessionHarness runtime={previousRuntime} harness={harness} />
			</AppProvider>,
		);
		if (!harness.session || !harness.store) throw new Error('Runtime session harness did not render');

		expect(harness.session.submit('first', 'prompt')).toBe(true);
		await vi.waitFor(() => expect(previousRuntime.attempts).toEqual(['first']));
		expect(harness.store.getState().activeTurnId).toBeNull();

		rendered.rerender(
			<AppProvider initialMessages={[]}>
				<SessionHarness runtime={nextRuntime} harness={harness} />
			</AppProvider>,
		);

		await vi.waitFor(() =>
			expect(harness.store?.getState().messages).toEqual(
				expect.arrayContaining([
					expect.objectContaining({kind: 'user', content: 'first'}),
					expect.objectContaining({content: 'The runtime changed before the active turn completed.'}),
				]),
			),
		);
		expect(nextRuntime.requests).toEqual([]);
		expect(harness.store.getState().activeTurnId).toBeNull();
		rendered.unmount();
	});

	it('separates idle submission, active steering, and explicit queueing', async () => {
		const runtime = new GatedRuntime();
		const {session, store, unmount} = renderSession(runtime);

		expect(session.submit('first', 'prompt')).toBe(true);
		await vi.waitFor(() => expect(store.getState().activeTurnId).not.toBeNull());
		expect(session.submit('not accepted', 'prompt')).toBe(false);
		expect(session.steer('redirect', 'prompt', [{path: 'src', kind: 'directory'}])).toBe(true);
		expect(session.enqueue('echo queued', 'bash')).toBe(true);
		expect(runtime.steers).toMatchObject([
			{content: 'redirect', mode: 'prompt', mentions: [{path: 'src', kind: 'directory'}]},
		]);
		expect(store.getState().messages).toContainEqual(
			expect.objectContaining({kind: 'user', variant: 'prompt', content: 'redirect'}),
		);
		runtime.acceptSteers = false;
		expect(session.steer('rejected redirect', 'prompt')).toBe(false);
		expect(store.getState().messages).not.toContainEqual(expect.objectContaining({content: 'rejected redirect'}));
		expect(store.getState().queuedRequests).toMatchObject([{content: 'echo queued', mode: 'bash'}]);

		runtime.release();
		await vi.waitFor(() =>
			expect(runtime.requests.map((request) => request.content)).toEqual(['first', 'echo queued']),
		);
		unmount();
	});
});
