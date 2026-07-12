export const fileToolInstructions: readonly string[] = [
	'Prefer Read, Edit, and Write for text-file operations; use ExecCommand for searches, tests, builds, and other shell work.',
	'Read takes an absolute file_path and returns one-based line prefixes in the form LINE_NUMBER<TAB>CONTENT.',
	'Existing files must be read before Edit or Write. If a file changes after Read, read it again before retrying the mutation.',
	'Edit performs exact string replacement. Use Write only when replacing the complete file or creating a new file.',
];
