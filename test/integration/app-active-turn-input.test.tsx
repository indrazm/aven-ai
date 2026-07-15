import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import type {AgentRuntime, RuntimeEvent, SubmitRequest} from '../../src/modules/agent/index.js';

class ActiveInputRuntime implements AgentRuntime {
	readonly requests: SubmitRequest[] = [];
	readonly steers: SubmitRequest[] = [];
	acceptSteer = true;

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		this.requests.push(request);
		yield {type: 'turn.started', request};
		await new Promise<void>((resolve) => {
			if (signal.aborted) resolve();
			else signal.addEventListener('abort', () => resolve(), {once: true});
		});
	}

	steer(request: SubmitRequest): boolean {
		this.steers.push(request);
		return this.acceptSteer;
	}

	dispose(): void {}
}

const enter = '\r';
const tab = '\t';
const flushInput = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('active-turn composer controls', () => {
	it('steers with Enter and preserves text when the runtime rejects the steer', async () => {
		const runtime = new ActiveInputRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		stdin.write('first');
		await flushInput();
		stdin.write(enter);
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(1));

		stdin.write('follow this');
		await flushInput();
		stdin.write(enter);
		await vi.waitFor(() => expect(runtime.steers).toHaveLength(1));
		expect(runtime.steers[0]).toMatchObject({content: 'follow this', mode: 'prompt'});
		stdin.write('x');
		await flushInput();
		expect(lastFrame()).not.toContain('follow thisx');

		runtime.acceptSteer = false;
		stdin.write('keep this');
		await flushInput();
		stdin.write(enter);
		await vi.waitFor(() => expect(runtime.steers).toHaveLength(2));
		stdin.write('x');
		await flushInput();
		expect(lastFrame()).toContain('keep thisx');
		unmount();
	});

	it('queues with Tab and clears the accepted payload from the editor', async () => {
		const runtime = new ActiveInputRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		stdin.write('first');
		await flushInput();
		stdin.write(enter);
		await vi.waitFor(() => expect(runtime.requests).toHaveLength(1));

		stdin.write('run next');
		await flushInput();
		stdin.write(tab);
		await vi.waitFor(() => expect(lastFrame()).toContain('queued · run next'));
		expect(runtime.steers).toHaveLength(0);
		stdin.write('x');
		await flushInput();
		expect(lastFrame()).not.toContain('run nextx');
		unmount();
	});
});
