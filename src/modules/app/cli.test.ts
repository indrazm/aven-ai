import {describe, expect, it} from 'vitest';
import {CLI_RENDER_OPTIONS, formatCliError, TERMINAL_FRAME_INTERVAL_MS} from './cli.js';

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
		});
		expect(Math.ceil(1000 / CLI_RENDER_OPTIONS.maxFps)).toBe(TERMINAL_FRAME_INTERVAL_MS);
	});
});
