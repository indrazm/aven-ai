import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import type {AgentRuntime, RuntimeEvent, SubmitRequest} from '../../src/modules/agent/index.js';

class ControlledSteeringRuntime implements AgentRuntime {
	readonly requests: SubmitRequest[] = [];
	readonly steeringRequests: SubmitRequest[] = [];
	activeRuns = 0;
	maxActiveRuns = 0;
	readonly #releases: Array<() => void> = [];

	steer(request: SubmitRequest): boolean {
		if (this.activeRuns === 0) return false;
		this.steeringRequests.push(request);
		return true;
	}

	release(runIndex: number): void {
		this.#releases[runIndex]?.();
	}

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		this.requests.push(request);
		this.activeRuns += 1;
		this.maxActiveRuns = Math.max(this.maxActiveRuns, this.activeRuns);
		try {
			yield {type: 'turn.started', request};
			yield {type: 'status.changed', status: 'thinking'};
			await new Promise<void>((resolve) => {
				let settled = false;
				const finish = () => {
					if (settled) return;
					settled = true;
					signal.removeEventListener('abort', finish);
					resolve();
				};
				this.#releases.push(finish);
				if (signal.aborted) finish();
				else signal.addEventListener('abort', finish, {once: true});
			});
			if (signal.aborted) return;
			yield {
				type: 'message.appended',
				message: {
					id: `assistant-${request.id}`,
					kind: 'assistant',
					variant: 'text',
					content: `Completed ${request.content}`,
				},
			};
			yield {type: 'turn.completed', turnId: request.id};
		} finally {
			this.activeRuns -= 1;
		}
	}

	dispose(): void {
		for (const release of this.#releases) release();
	}
}

const flushInput = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('active-turn steering and queued prompts', () => {
	it('uses Enter to steer the active run and Tab to queue the next run', async () => {
		const runtime = new ControlledSteeringRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);

		stdin.write('first request');
		await flushInput();
		stdin.write('\r');
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(1));
		await vi.waitFor(() => expect(lastFrame()).toContain('enter steer'));
		expect(lastFrame()).toContain('tab queue');

		stdin.write('adjust the active request');
		await flushInput();
		stdin.write('\r');
		await vi.waitFor(() => expect(runtime.steeringRequests).toHaveLength(1));
		expect(runtime.steeringRequests[0]).toMatchObject({
			content: 'adjust the active request',
			mode: 'prompt',
		});
		expect(lastFrame()).toContain('adjust the active request');
		expect(lastFrame()).not.toContain('queued · adjust the active request');

		stdin.write('run this afterward');
		await flushInput();
		stdin.write('\t');
		await vi.waitFor(() => expect(lastFrame()).toContain('queued · run this afterward'));
		expect(runtime.steeringRequests).toHaveLength(1);
		expect(runtime.requests).toHaveLength(1);

		runtime.release(0);
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(2));
		expect(runtime.requests[1]).toMatchObject({content: 'run this afterward', mode: 'prompt'});
		runtime.release(1);
		await vi.waitFor(() => expect(lastFrame()).toContain('Completed run this afterward'));
		unmount();
	});

	it('drains multiple Tab-queued prompts in FIFO order without overlapping runs', async () => {
		const runtime = new ControlledSteeringRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);

		stdin.write('first');
		await flushInput();
		stdin.write('\r');
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(1));

		stdin.write('second');
		await flushInput();
		stdin.write('\t');
		await flushInput();
		stdin.write('third');
		await flushInput();
		stdin.write('\t');
		await vi.waitFor(() => {
			expect(lastFrame()).toContain('queued · second');
			expect(lastFrame()).toContain('queued · third');
		});
		expect(runtime.requests).toHaveLength(1);

		runtime.release(0);
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(2));
		expect(runtime.requests.map((request) => request.content)).toEqual(['first', 'second']);
		expect(lastFrame()).toContain('queued · third');
		expect(runtime.maxActiveRuns).toBe(1);

		runtime.release(1);
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(3));
		expect(runtime.requests.map((request) => request.content)).toEqual(['first', 'second', 'third']);
		expect(runtime.maxActiveRuns).toBe(1);

		runtime.release(2);
		await vi.waitFor(() => expect(lastFrame()).toContain('Completed third'));
		unmount();
	});
});
