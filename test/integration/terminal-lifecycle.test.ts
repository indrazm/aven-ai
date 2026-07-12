import {describe, expect, it, vi} from 'vitest';
import {writeOsc52} from '../../src/libs/terminal/index.js';
import {keyboardProtocol} from '../../src/libs/terminal/index.js';
import {DISABLE_MOUSE, ENABLE_MOUSE} from '../../src/libs/terminal/index.js';

describe('terminal lifecycle configuration', () => {
	it('avoids the visible Kitty capability-query response', () => {
		expect(keyboardProtocol).toEqual({mode: 'enabled', flags: ['disambiguateEscapeCodes']});
	});

	it('enables and restores every requested mouse protocol', () => {
		expect(ENABLE_MOUSE).toContain('?1000h');
		expect(ENABLE_MOUSE).toContain('?1002h');
		expect(ENABLE_MOUSE).toContain('?1006h');
		expect(DISABLE_MOUSE).toContain('?1006l');
		expect(DISABLE_MOUSE).toContain('?1002l');
		expect(DISABLE_MOUSE).toContain('?1000l');
	});

	it('encodes selected text for the terminal clipboard', () => {
		const write = vi.fn();
		expect(writeOsc52({write}, 'hello')).toBe(true);
		expect(write).toHaveBeenCalledWith('\u001B]52;c;aGVsbG8=\u0007');
	});
});
