import {describe, expect, it} from 'vitest';
import {formatCliError} from './cli.js';

describe('formatCliError', () => {
	it('formats startup failures without exposing provider secrets', () => {
		expect(formatCliError(new Error('request failed with sk-secret-value'))).toBe(
			'aven: request failed with [redacted]\n',
		);
	});
});
