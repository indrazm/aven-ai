import {describe, expect, it} from 'vitest';
import {CLI_RENDER_OPTIONS, formatCliError} from './cli.js';

describe('formatCliError', () => {
	it('formats startup failures without exposing provider secrets', () => {
		expect(formatCliError(new Error('request failed with sk-secret-value'))).toBe(
			'aven: request failed with [redacted]\n',
		);
	});

	it('renders full-screen updates incrementally at a bounded frame rate', () => {
		expect(CLI_RENDER_OPTIONS).toMatchObject({
			alternateScreen: true,
			incrementalRendering: true,
			maxFps: 30,
		});
	});
});
