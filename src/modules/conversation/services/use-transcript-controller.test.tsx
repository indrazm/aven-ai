import {act, createRef} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {MouseEvent} from '../../../libs/terminal/index.js';
import type {TranscriptHandle, UserMessage} from '../types.js';
import {useTranscriptController} from './use-transcript-controller.js';

const terminal = vi.hoisted(() => ({
	copyText: vi.fn<(value: string) => void>(),
	listeners: new Set<(event: MouseEvent) => void>(),
}));

vi.mock('../../../libs/terminal/index.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../libs/terminal/index.js')>()),
	useTerminalController: () => ({
		mouseEnabled: true,
		copyText: terminal.copyText,
		subscribeMouse: (listener: (event: MouseEvent) => void) => {
			terminal.listeners.add(listener);
			return () => terminal.listeners.delete(listener);
		},
	}),
}));

const message: UserMessage = {
	id: 'user-1',
	kind: 'user',
	variant: 'prompt',
	content: 'hello world',
};

const metrics = {width: 40, height: 2, left: 3, top: 4, hasMeasured: true};

const Harness = ({handle}: {handle: React.RefObject<TranscriptHandle | null>}) => {
	const {selection} = useTranscriptController([message], metrics, handle);
	return <Text>{selection ? 'selected' : 'clear'}</Text>;
};

const mouseEvent = (type: MouseEvent['type'], x: number, timestamp: number): MouseEvent => ({
	type,
	button: 'left',
	x: metrics.left + x,
	y: metrics.top + 1,
	deltaY: 0,
	ctrl: false,
	meta: false,
	shift: false,
	timestamp,
});

const emitMouse = (event: MouseEvent) => {
	for (const listener of terminal.listeners) listener(event);
};

describe('transcript mouse selection', () => {
	afterEach(() => {
		terminal.listeners.clear();
	});

	it('copies a drag selection when the mouse is released', async () => {
		const handle = createRef<TranscriptHandle>();
		const {lastFrame, unmount} = render(<Harness handle={handle} />);
		await vi.waitFor(() => expect(terminal.listeners.size).toBe(1));

		await act(async () => {
			emitMouse(mouseEvent('down', 2, 100));
			emitMouse(mouseEvent('move', 6, 110));
		});
		expect(terminal.copyText).not.toHaveBeenCalled();
		expect(handle.current?.hasSelection()).toBe(true);
		expect(lastFrame()).toContain('selected');

		await act(async () => {
			emitMouse(mouseEvent('up', 6, 120));
		});

		expect(terminal.copyText).toHaveBeenCalledOnce();
		expect(terminal.copyText).toHaveBeenCalledWith('hello');
		expect(handle.current?.hasSelection()).toBe(false);
		expect(lastFrame()).toContain('clear');
		unmount();
	});

	it('copies the completed word selection on double click', async () => {
		const handle = createRef<TranscriptHandle>();
		const {unmount} = render(<Harness handle={handle} />);
		await vi.waitFor(() => expect(terminal.listeners.size).toBe(1));

		await act(async () => {
			emitMouse(mouseEvent('down', 4, 100));
			emitMouse(mouseEvent('up', 4, 110));
			emitMouse(mouseEvent('down', 4, 200));
		});

		expect(terminal.copyText).toHaveBeenLastCalledWith('hello');
		expect(handle.current?.hasSelection()).toBe(false);
		unmount();
	});
});
