import {describe, expect, it} from 'vitest';
import {theme} from './theme.js';

describe('theme', () => {
	it('keeps the interface monochrome with a yellow provider indicator', () => {
		expect(theme.provider).toBe('#e5c07b');

		for (const [name, color] of Object.entries(theme)) {
			if (name === 'provider') continue;
			const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(color);
			expect(match, `${name} should be a six-digit hex color`).not.toBeNull();
			expect(match?.[1]?.toLowerCase(), `${name} should be monochrome`).toBe(match?.[2]?.toLowerCase());
			expect(match?.[2]?.toLowerCase(), `${name} should be monochrome`).toBe(match?.[3]?.toLowerCase());
		}
	});
});
