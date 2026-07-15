import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import {SessionRuntime} from '../support/runtime-fakes.js';

describe('App project-session flows', () => {
	it('resumes the most recent project session directly', async () => {
		const runtime = new SessionRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('/workspace/alpha');

		stdin.write('/resume-last');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(runtime.active.id).toBe('previous-session');
		expect(lastFrame()).toContain('Continue the previous work');
		unmount();
	});

	it('switches or creates sessions from commands', async () => {
		const runtime = new SessionRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		await new Promise((resolve) => setTimeout(resolve, 0));

		stdin.write('/resume');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('Project sessions');
		expect(lastFrame()).toContain('Previous work');
		stdin.write('\u001B[B');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.active.id).toBe('previous-session');
		expect(lastFrame()).toContain('Continue the previous work');

		stdin.write('/new');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.active.title).toBe('New session');
		expect(lastFrame()).toContain('Started a new session');
		unmount();
	});

	it('does not execute session commands entered during an active turn', async () => {
		const runtime = new SessionRuntime(true);
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('working');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('/new');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(runtime.newSessions).toBe(0);
		expect(lastFrame()).toContain('❯ /new');
		unmount();
	});
});
