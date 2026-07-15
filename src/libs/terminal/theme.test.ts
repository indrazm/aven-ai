import {describe, expect, it} from 'vitest';
import {theme} from './theme.js';

describe('theme', () => {
	it('keeps chrome monochrome with dedicated tool, provider, and semantic diff colors', () => {
		expect(theme.tool).toBe('cyan');
		expect(theme.provider).toBe('#e5c07b');
		expect(theme.addition).toBe('#50c850');
		expect(theme.deletion).toBe('#dc5a5a');
		expect(theme.diffAdditionBackground).toBe('#022800');
		expect(theme.diffDeletionBackground).toBe('#3d0100');
		expect(theme.diffAdditionWordBackground).toBe('#044700');
		expect(theme.diffDeletionWordBackground).toBe('#5c0200');
		const semanticColors = new Set([
			'tool',
			'provider',
			'addition',
			'deletion',
			'diffAdditionBackground',
			'diffDeletionBackground',
			'diffAdditionWordBackground',
			'diffDeletionWordBackground',
		]);

		for (const [name, color] of Object.entries(theme)) {
			if (semanticColors.has(name)) continue;
			const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(color);
			expect(match, `${name} should be a six-digit hex color`).not.toBeNull();
			expect(match?.[1]?.toLowerCase(), `${name} should be monochrome`).toBe(match?.[2]?.toLowerCase());
			expect(match?.[2]?.toLowerCase(), `${name} should be monochrome`).toBe(match?.[3]?.toLowerCase());
		}
	});
});
