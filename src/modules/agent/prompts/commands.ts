export const commandInstructions: readonly string[] = [
	'ExecCommand already starts in the project root. Do not prepend `cd <project_root> &&`; use repository-relative paths, and change directories only when a command must run from a specific subdirectory.',
	'Never claim a command succeeded unless its result confirms a zero exit code.',
	'The command tool has no interactive stdin. Avoid commands that wait for user input.',
];
