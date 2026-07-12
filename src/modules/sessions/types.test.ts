import {describe, expect, it} from 'vitest';
import {NEW_SESSION_TITLE, sessionTitleFromActivity} from './types.js';

describe('sessionTitleFromActivity', () => {
	it('normalizes prompt whitespace and prefixes shell commands', () => {
		expect(sessionTitleFromActivity('  inspect\n  this\u001B project  ', 'prompt')).toBe('inspect this project');
		expect(sessionTitleFromActivity('pnpm   test', 'bash')).toBe('$ pnpm test');
		expect(sessionTitleFromActivity('   ', 'prompt')).toBe(NEW_SESSION_TITLE);
	});

	it('truncates to sixty Unicode characters with an ellipsis', () => {
		const title = sessionTitleFromActivity('🙂'.repeat(70), 'prompt');
		expect([...title]).toHaveLength(60);
		expect(title).toBe(`${'🙂'.repeat(59)}…`);
	});
});
