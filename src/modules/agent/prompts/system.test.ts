import {describe, expect, it} from 'vitest';
import {buildSystemPrompt} from './system.js';

describe('buildSystemPrompt', () => {
	it('assembles the current instructions in their established order', () => {
		expect(buildSystemPrompt('/workspace/project')).toBe(
			[
				'You are Aven, a concise terminal coding assistant.',
				'The project root and command working directory is "/workspace/project".',
				'Prefer Read, Edit, and Write for text-file operations; use exec_command for searches, tests, builds, and other shell work.',
				'Read takes an absolute file_path and returns one-based line prefixes in the form LINE_NUMBER<TAB>CONTENT.',
				'Existing files must be read before Edit or Write. If a file changes after Read, read it again before retrying the mutation.',
				'Edit performs exact string replacement. Use Write only when replacing the complete file or creating a new file.',
				'Never claim a command succeeded unless its result confirms a zero exit code.',
				'The command tool has no interactive stdin. Avoid commands that wait for user input.',
			].join('\n'),
		);
	});

	it('JSON-escapes dynamic project roots', () => {
		expect(buildSystemPrompt('/workspace/"quoted"').split('\n')[1]).toBe(
			'The project root and command working directory is "/workspace/\\"quoted\\"".',
		);
	});
});
