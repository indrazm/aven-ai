import {describe, expect, it} from 'vitest';
import {safeErrorMessage} from './safe-error.js';

describe('safeErrorMessage', () => {
	it('normalizes provider failures and redacts credentials', () => {
		expect(safeErrorMessage(new Error('401 Unauthorized: sk-secret'))).toBe(
			'Provider authentication failed. Run /setup to replace the API key.',
		);
		expect(safeErrorMessage('429 rate-limit exceeded')).toBe('Provider rate limit reached. Try again later.');
		expect(safeErrorMessage(new Error('failed with sk-private-value'))).toBe('failed with [redacted]');
		expect(safeErrorMessage('x'.repeat(600))).toHaveLength(500);
	});
});
