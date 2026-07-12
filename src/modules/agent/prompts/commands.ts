export const commandInstructions: readonly string[] = [
	'Never claim a command succeeded unless its result confirms a zero exit code.',
	'The command tool has no interactive stdin. Avoid commands that wait for user input.',
];
