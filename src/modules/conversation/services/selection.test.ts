import {describe, expect, it} from 'vitest';
import {selectedText, splitSegmentsForSelection, wordSelection} from './selection.js';
import type {TranscriptRow} from '../types.js';

const row: TranscriptRow = {
	id: 'row',
	messageId: 'message',
	messageKind: 'assistant',
	segments: [{text: '● ', selectable: false}, {text: 'hello world'}],
};

describe('terminal selection', () => {
	it('selects a word and excludes decorative markers when copying', () => {
		const selection = wordSelection(row, 0, 4);
		expect(selectedText([row], selection)).toBe('hello');
	});

	it('splits visual segments at selection boundaries', () => {
		const result = splitSegmentsForSelection([{text: 'hello'}], [1, 4]);
		expect(result.map((segment) => [segment.text, Boolean(segment.selected)])).toEqual([
			['h', false],
			['ell', true],
			['o', false],
		]);
	});

	it('preserves word-diff backgrounds while marking the selected slice', () => {
		const result = splitSegmentsForSelection([{text: 'rename', background: 'addition'}], [2, 5]);
		expect(result).toEqual([
			{text: 're', background: 'addition'},
			{text: 'nam', background: 'addition', selected: true},
			{text: 'e', background: 'addition'},
		]);
	});

	it('uses terminal columns for emoji, CJK, and combining graphemes', () => {
		const unicodeRow: TranscriptRow = {
			...row,
			segments: [{text: '🙂界e\u0301x'}],
		};
		const selection = {
			anchor: {row: 0, column: 2},
			focus: {row: 0, column: 4},
			mode: 'character' as const,
			dragging: false,
		};
		expect(selectedText([unicodeRow], selection)).toBe('界é');
		expect(splitSegmentsForSelection(unicodeRow.segments, [2, 5])).toEqual([
			{text: '🙂'},
			{text: '界é', selected: true},
			{text: 'x'},
		]);
	});

	it('selects a word after a wide glyph', () => {
		const unicodeRow: TranscriptRow = {...row, segments: [{text: '🙂hello'}]};
		expect(selectedText([unicodeRow], wordSelection(unicodeRow, 0, 3))).toBe('hello');
	});

	it('does not merge styles or adjacent words across selection boundaries', () => {
		expect(splitSegmentsForSelection([{text: 'a', tone: 'accent'}, {text: 'b'}], [0, 2])).toEqual([
			{text: 'a', tone: 'accent', selected: true},
			{text: 'b', selected: true},
		]);
		const spacedRow: TranscriptRow = {...row, segments: [{text: 'hello world'}]};
		expect(selectedText([spacedRow], wordSelection(spacedRow, 0, 5))).toBe('');
	});
});
