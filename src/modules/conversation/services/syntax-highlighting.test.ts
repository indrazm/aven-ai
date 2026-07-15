import {describe, expect, it} from 'vitest';
import {highlightCode, languageForFile} from './syntax-highlighting.js';

describe('syntax highlighting', () => {
	it('detects languages from extensions, special filenames, and shebangs', () => {
		expect(languageForFile('src/example.ts')).toBe('ts');
		expect(languageForFile('/workspace/Dockerfile')).toBe('dockerfile');
		expect(languageForFile('/workspace/script', '#!/usr/bin/env python3')).toBe('python');
	});

	it('returns colored segments for supported code and plain segments for unknown files', () => {
		expect(highlightCode('const ready = true;', 'ts')[0]?.some((segment) => segment.color)).toBe(true);
		expect(highlightCode('plain text', languageForFile('notes.unknown'))).toEqual([
			[{text: 'plain text', tone: 'code'}],
		]);
	});
});
