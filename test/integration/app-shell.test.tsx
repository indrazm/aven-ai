import {render} from 'ink-testing-library';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import type {RuntimeEvent} from '../../src/modules/agent/index.js';
import type {SubmitRequest} from '../../src/modules/agent/index.js';
import {commandItems} from '../../src/modules/commands/index.js';
import type {AgentRuntime} from '../../src/modules/agent/index.js';

class ToolOutputRuntime implements AgentRuntime {
	async *run(request: SubmitRequest): AsyncIterable<RuntimeEvent> {
		yield {type: 'turn.started', request};
		yield {
			type: 'message.appended',
			message: {
				id: `tool-${request.id}`,
				kind: 'tool',
				name: 'ExecCommand',
				status: 'success',
				summary: 'print output',
				detail: Array.from({length: 12}, (_, index) => `tool output ${index + 1}`).join('\n'),
				group: 'bash',
			},
		};
		yield {type: 'turn.completed', turnId: request.id};
	}

	dispose(): void {}
}

class LongStreamingRuntime implements AgentRuntime {
	async *run(request: SubmitRequest): AsyncIterable<RuntimeEvent> {
		yield {type: 'turn.started', request};
		for (let index = 1; index <= 40; index++) {
			yield {
				type: 'assistant.delta',
				messageId: `assistant-${request.id}`,
				delta: `${index === 1 ? '' : '\n'}streamed line ${String(index).padStart(2, '0')}`,
			};
		}
		yield {type: 'turn.completed', turnId: request.id};
	}

	dispose(): void {}
}

class PausedStreamingRuntime implements AgentRuntime {
	#resume: (() => void) | undefined;

	release(): void {
		this.#resume?.();
	}

	async *run(request: SubmitRequest): AsyncIterable<RuntimeEvent> {
		yield {type: 'turn.started', request};
		yield {
			type: 'assistant.delta',
			messageId: `assistant-${request.id}`,
			delta: Array.from({length: 35}, (_, index) => `streamed line ${String(index + 1).padStart(2, '0')}`).join('\n'),
		};
		await new Promise<void>((resolve) => {
			this.#resume = resolve;
		});
		yield {
			type: 'assistant.delta',
			messageId: `assistant-${request.id}`,
			delta: Array.from({length: 5}, (_, index) => `\nstreamed line ${String(index + 36).padStart(2, '0')}`).join(''),
		};
		yield {type: 'turn.completed', turnId: request.id};
	}

	dispose(): void {}
}

describe('App shell and composer', () => {
	afterEach(() => vi.useRealTimers());

	it('renders the full-screen coding agent surface', async () => {
		const {lastFrame, unmount} = render(<App workingDirectory="/workspace/aven" />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Welcome to Aven AI. Local mock mode is active.');
		expect(frame).not.toContain('◆ AVEN CODE');
		expect(frame).not.toContain('by anvia');
		expect(frame).not.toContain('Engineering agent for the terminal');
		expect(frame).not.toContain('CONVERSATION');
		expect(frame).not.toContain('pgup/pgdn scroll');
		expect(frame).toContain('/workspace/aven');
		expect(frame).toContain('Mock · local');
		expect(frame).toContain('│ ❯ ');
		expect(frame).toContain('shift+enter newline');
		expect(frame).not.toContain('ctrl+o scroll');
		expect(frame).not.toContain('ctrl+c×2 exit');
		const statusLine = frame.split('\n').find((line) => line.includes('/workspace/aven')) ?? '';
		expect(statusLine).toContain('Mock · local');
		expect(statusLine.indexOf('/workspace/aven')).toBeLessThan(statusLine.indexOf('Mock · local'));
		unmount();
	});

	it('accepts input and returns a local mock response', async () => {
		vi.useFakeTimers();
		const {lastFrame, stdin, unmount} = render(<App mockResponseDelay={50} workingDirectory="/workspace/aven" />);
		stdin.write('hello');
		await vi.advanceTimersByTimeAsync(0);
		stdin.write('\r');
		await vi.advanceTimersByTimeAsync(0);
		const thinkingFrame = lastFrame() ?? '';
		expect(thinkingFrame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u);
		expect(thinkingFrame).not.toContain('Thinking…');
		expect(thinkingFrame).not.toContain('Running tool…');
		const statusLine = thinkingFrame.split('\n').find((line) => line.includes('/workspace/aven')) ?? '';
		expect(statusLine).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u);
		expect(statusLine).toContain('Mock · local');
		expect(statusLine.search(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u)).toBeLessThan(statusLine.indexOf('/workspace/aven'));
		expect(statusLine.indexOf('/workspace/aven')).toBeLessThan(statusLine.indexOf('Mock · local'));
		await vi.advanceTimersByTimeAsync(50);
		expect(lastFrame()).toContain('Mock · local');
		unmount();
	});

	it('does not insert Ink-forwarded mouse wheel bytes into the composer', async () => {
		const {lastFrame, stdin, unmount} = render(<App />);
		stdin.write('\u001B[<65;20;8M');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).not.toContain('[<65;20;8M');
		unmount();
	});

	it('scrolls through the full transcript after a long streamed response completes', async () => {
		const {lastFrame, stdin, unmount} = render(<App runtime={new LongStreamingRuntime()} />);
		stdin.write('stream');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(lastFrame()).toContain('streamed line 40');
		expect(lastFrame()).not.toContain('streamed line 01');
		const bottomFirstLine = Number(/streamed line (\d+)/u.exec(lastFrame() ?? '')?.[1]);

		stdin.write('\u001B[5~');
		await new Promise((resolve) => setTimeout(resolve, 0));
		const pagedFirstLine = Number(/streamed line (\d+)/u.exec(lastFrame() ?? '')?.[1]);
		expect(pagedFirstLine).toBeLessThan(bottomFirstLine);

		stdin.write('\u001B[6~');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('streamed line 40');

		stdin.write('\u000f');
		await new Promise((resolve) => setTimeout(resolve, 0));
		for (let index = 0; index < 5; index++) stdin.write('k');
		await new Promise((resolve) => setTimeout(resolve, 0));
		const scrolledFirstLine = Number(/streamed line (\d+)/u.exec(lastFrame() ?? '')?.[1]);
		expect(scrolledFirstLine).toBe(bottomFirstLine - 5);
		expect(lastFrame()).not.toContain('streamed line 40');

		stdin.write('g');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(lastFrame()).toContain('streamed line 01');
		expect(lastFrame()).not.toContain('streamed line 40');
		unmount();
	});

	it('holds the reading position when new streamed output arrives', async () => {
		const runtime = new PausedStreamingRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		stdin.write('stream');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await vi.waitFor(() => expect(lastFrame()).toContain('streamed line 35'));

		stdin.write('\u001B[5~');
		await new Promise((resolve) => setTimeout(resolve, 0));
		const readingLine = /streamed line (\d+)/u.exec(lastFrame() ?? '')?.[1];

		runtime.release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(/streamed line (\d+)/u.exec(lastFrame() ?? '')?.[1]).toBe(readingLine);
		expect(lastFrame()).not.toContain('streamed line 40');

		stdin.write('\u000f');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('G');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('streamed line 40');
		unmount();
	});

	it('scrolls the slash-command window with keyboard selection', async () => {
		const {lastFrame, stdin, unmount} = render(<App />);
		stdin.write('/');
		await new Promise((resolve) => setTimeout(resolve, 0));
		for (let index = 1; index < commandItems.length; index++) {
			stdin.write('\u001B[B');
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		expect(lastFrame()).toContain('❯ /theme');
		unmount();
	});

	it('opens the selected slash command from a partial command', async () => {
		const {lastFrame, stdin, unmount} = render(<App />);
		stdin.write('/con');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('❯ /connect');
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('Connect provider');
		expect(lastFrame()).not.toContain('❯ /con');
		unmount();
	});

	it('queues a second prompt while a turn is active and runs it next', async () => {
		vi.useFakeTimers();
		const {lastFrame, stdin, unmount} = render(<App mockResponseDelay={40} />);
		stdin.write('first');
		await vi.advanceTimersByTimeAsync(0);
		stdin.write('\r');
		await vi.advanceTimersByTimeAsync(0);
		stdin.write('second');
		await vi.advanceTimersByTimeAsync(0);
		stdin.write('\r');
		await vi.advanceTimersByTimeAsync(0);
		expect(lastFrame()).toContain('queued · second');

		await vi.advanceTimersByTimeAsync(40);
		await vi.advanceTimersByTimeAsync(0);
		expect(lastFrame()).toContain('second');
		await vi.advanceTimersByTimeAsync(40);
		expect(lastFrame()).toContain('Mock · local');
		unmount();
	});

	it('expands collapsed tool output while transcript mode is active', async () => {
		const {lastFrame, stdin, unmount} = render(<App runtime={new ToolOutputRuntime()} />);
		stdin.write('run');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('… +9 lines (ctrl+o to expand)');
		expect(lastFrame()).not.toContain('tool output 12');

		stdin.write('\u000f');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('tool output 12');
		expect(lastFrame()).not.toContain('ctrl+o to expand');

		stdin.write('\u000f');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('… +9 lines (ctrl+o to expand)');
		expect(lastFrame()).not.toContain('tool output 12');
		unmount();
	});
});
