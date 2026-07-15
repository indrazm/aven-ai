import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import {RecoveringRuntime, SupersededRuntime} from '../support/runtime-fakes.js';

describe('App turn lifecycle', () => {
	it('starts the next prompt after a failed turn instead of queueing forever', async () => {
		const runtime = new RecoveringRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		stdin.write('first');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('first run failed');

		stdin.write('second');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.runs).toBe(2);
		expect(lastFrame()).toContain('Recovered successfully.');
		expect(lastFrame()).not.toContain('queued · second');
		unmount();
	});

	it('drains an already queued prompt when the active turn fails', async () => {
		const runtime = new RecoveringRuntime(true);
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		stdin.write('first');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('second');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\t');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('queued · second');

		runtime.releaseFirstRun();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.runs).toBe(2);
		expect(lastFrame()).toContain('Recovered successfully.');
		expect(lastFrame()).not.toContain('queued · second');
		unmount();
	});

	it('ignores late events from a runtime that does not honor cancellation', async () => {
		const runtime = new SupersededRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		stdin.write('first');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\u0003');
		await new Promise((resolve) => setTimeout(resolve, 0));

		stdin.write('second');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.runs).toBe(1);
		expect(lastFrame()).toContain('queued · second');

		runtime.releaseFirst();
		await vi.waitFor(() => expect(runtime.runs).toBe(2));
		expect(lastFrame()).not.toContain('Stale response.');
		expect(lastFrame()).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u);
		expect(lastFrame()).toContain('Mock · local');

		runtime.releaseSecond();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('Current response.');
		expect(lastFrame()).toContain('Mock · local');
		unmount();
	});
});
