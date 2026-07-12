import {describe, expect, it} from 'vitest';
import {isMouseInputSequence, parseMouseEvents, SgrMouseDecoder} from './mouse-protocol.js';

describe('SGR mouse parser', () => {
	it('parses zero-based click, drag, release, and wheel events', () => {
		const events = parseMouseEvents('\u001B[<0;5;7M\u001B[<32;6;7M\u001B[<0;6;7m\u001B[<65;6;7M', 10);
		expect(events.map((event) => event.type)).toEqual(['down', 'move', 'up', 'wheel']);
		expect(events[0]).toMatchObject({button: 'left', x: 4, y: 6, timestamp: 10});
		expect(events[3]?.deltaY).toBe(1);
	});

	it('recognizes raw and Ink-forwarded mouse sequences', () => {
		expect(isMouseInputSequence('\u001B[<64;20;8M')).toBe(true);
		expect(isMouseInputSequence('[<65;20;8M')).toBe(true);
		expect(isMouseInputSequence('[<0;20;8m')).toBe(true);
		expect(isMouseInputSequence('normal message')).toBe(false);
	});

	it('decodes mouse events across arbitrary stdin chunk boundaries', () => {
		const sequence = '\u001B[<0;5;7M\u001B[<0;6;7m';
		for (let split = 1; split < sequence.length; split++) {
			const decoder = new SgrMouseDecoder();
			const events = [...decoder.feed(sequence.slice(0, split), 10), ...decoder.feed(sequence.slice(split), 10)];
			expect(events.map((event) => event.type)).toEqual(['down', 'up']);
		}
	});

	it('ignores ordinary stdin while retaining an incomplete mouse suffix', () => {
		const decoder = new SgrMouseDecoder();
		expect(decoder.feed('a\u001B[<65;')).toEqual([]);
		expect(decoder.feed('6;7M', 20)).toEqual([expect.objectContaining({type: 'wheel', x: 5, y: 6, timestamp: 20})]);
	});
});
