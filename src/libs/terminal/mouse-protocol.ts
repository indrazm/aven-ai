/** Decoded SGR terminal mouse event. */
export type MouseEvent = {
	type: 'down' | 'up' | 'move' | 'wheel';
	button: 'left' | 'middle' | 'right' | 'none';
	x: number;
	y: number;
	deltaY: number;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
	timestamp: number;
};

const mousePattern = /\u001B\[<(\d+);(\d+);(\d+)([Mm])/gu;
const mouseInputPattern = /^(?:\u001B)?\[<\d+;\d+;\d+[Mm]$/u;

const isIncompleteMouseSequence = (value: string): boolean => {
	if (value === '\u001B' || value === '\u001B[' || value === '\u001B[<') return true;
	return /^\u001B\[<\d*(?:;\d*){0,2}$/u.test(value);
};

// Ink forwards unsupported CSI sequences through useInput after removing the
// leading Escape byte. Accept both the raw terminal form and Ink's forwarded
// form so mouse input can never leak into the composer.
export const isMouseInputSequence = (input: string): boolean => mouseInputPattern.test(input);

const decodeMouseEvents = (input: string, timestamp: number): MouseEvent[] => {
	const events: MouseEvent[] = [];

	for (const match of input.matchAll(mousePattern)) {
		const code = Number(match[1]);
		const wheel = (code & 64) !== 0;
		const moving = (code & 32) !== 0;
		const buttonCode = code & 3;
		const button = buttonCode === 0 ? 'left' : buttonCode === 1 ? 'middle' : buttonCode === 2 ? 'right' : 'none';

		events.push({
			type: wheel ? 'wheel' : match[4] === 'm' ? 'up' : moving ? 'move' : 'down',
			button: wheel ? 'none' : button,
			x: Math.max(0, Number(match[2]) - 1),
			y: Math.max(0, Number(match[3]) - 1),
			deltaY: wheel ? ((code & 1) === 0 ? -1 : 1) : 0,
			shift: (code & 4) !== 0,
			meta: (code & 8) !== 0,
			ctrl: (code & 16) !== 0,
			timestamp,
		});
	}

	return events;
};

export class SgrMouseDecoder {
	#buffer = '';

	feed(input: string, timestamp = Date.now()): MouseEvent[] {
		const source = this.#buffer + input;
		const events = decodeMouseEvents(source, timestamp);
		const possibleStart = source.lastIndexOf('\u001B');
		const suffix = possibleStart === -1 ? '' : source.slice(possibleStart);
		this.#buffer = suffix && isIncompleteMouseSequence(suffix) ? suffix : '';
		return events;
	}

	reset(): void {
		this.#buffer = '';
	}
}

export const parseMouseEvents = (input: string, timestamp = Date.now()): MouseEvent[] =>
	decodeMouseEvents(input, timestamp);

export const ENABLE_MOUSE = '\u001B[?1000h\u001B[?1002h\u001B[?1006h';
export const DISABLE_MOUSE = '\u001B[?1006l\u001B[?1002l\u001B[?1000l';
