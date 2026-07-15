import {describe, expect, it} from 'vitest';
import {safeHyperlinkTarget, supportsTerminalHyperlinks, terminalHyperlink} from './hyperlink.js';

describe('terminal hyperlinks', () => {
	it('detects known OSC 8 terminals without relying on process state', () => {
		expect(supportsTerminalHyperlinks({env: {TERM_PROGRAM: 'ghostty'}, stdoutSupported: false})).toBe(true);
		expect(supportsTerminalHyperlinks({env: {TERM: 'xterm-kitty'}, stdoutSupported: false})).toBe(true);
		expect(supportsTerminalHyperlinks({env: {TERM: 'dumb'}, stdoutSupported: false})).toBe(false);
		expect(supportsTerminalHyperlinks({env: {}, stdoutSupported: true})).toBe(true);
	});

	it('allows explicit navigation schemes and rejects unsafe targets', () => {
		expect(safeHyperlinkTarget('https://example.com/path')).toBe('https://example.com/path');
		expect(safeHyperlinkTarget('mailto:person@example.com')).toBe('mailto:person@example.com');
		expect(safeHyperlinkTarget('file:///tmp/example.ts')).toBe('file:///tmp/example.ts');
		expect(safeHyperlinkTarget('javascript:alert(1)')).toBeUndefined();
		expect(safeHyperlinkTarget('/relative/path')).toBeUndefined();
		expect(safeHyperlinkTarget('https://example.com\u0007injected')).toBeUndefined();
	});

	it('emits OSC 8 only when both the target and terminal are safe', () => {
		expect(terminalHyperlink('Example', 'https://example.com', true)).toBe(
			'\u001B]8;;https://example.com\u0007Example\u001B]8;;\u0007',
		);
		expect(terminalHyperlink('Example', 'https://example.com', false)).toBe('Example');
		expect(terminalHyperlink('Example', 'javascript:alert(1)', true)).toBe('Example');
	});
});
