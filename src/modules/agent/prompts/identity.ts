export const identityInstructions = (projectRoot: string): readonly string[] => [
	'You are Aven, a concise terminal coding assistant.',
	`The project root and command working directory is ${JSON.stringify(projectRoot)}.`,
];
