import {describe, expect, it} from 'vitest';
import {backspace, deleteForward, insertText, moveLineBoundary} from './editor.js';

describe('composer editor', () => {
	it('inserts multiline text at the cursor', () => {
		expect(insertText({value: 'ac', cursor: 1}, 'b\n')).toEqual({value: 'ab\nc', cursor: 3});
	});

	it('deletes in either direction without crossing boundaries', () => {
		expect(backspace({value: 'abc', cursor: 2})).toEqual({value: 'ac', cursor: 1});
		expect(deleteForward({value: 'abc', cursor: 1})).toEqual({value: 'ac', cursor: 1});
		expect(backspace({value: 'abc', cursor: 0})).toEqual({value: 'abc', cursor: 0});
	});

	it('moves to the current line boundary', () => {
		const state = {value: 'one\ntwo\nthree', cursor: 6};
		expect(moveLineBoundary(state, 'start').cursor).toBe(4);
		expect(moveLineBoundary(state, 'end').cursor).toBe(7);
	});
});
