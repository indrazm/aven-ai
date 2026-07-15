export const fileToolInstructions: readonly string[] = [
	'Prefer Read, Edit, and Write for text-file operations; use ExecCommand for searches, tests, builds, and other shell work.',
	'Read, Edit, and Write resolve relative file_path values from the project root. Prefer repository-relative paths; absolute paths remain available when explicitly needed.',
	'Read returns one-based line prefixes in the form LINE_NUMBER<TAB>CONTENT.',
	'Existing files must be read before Edit or Write. If a file changes after Read, read it again before retrying the mutation.',
	'Edit performs exact string replacement. Use Write only when replacing the complete file or creating a new file.',
];
