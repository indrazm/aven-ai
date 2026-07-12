import {commandInstructions} from './commands.js';
import {fileToolInstructions} from './file-tools.js';
import {identityInstructions} from './identity.js';

export const buildSystemPrompt = (projectRoot: string): string =>
	[...identityInstructions(projectRoot), ...fileToolInstructions, ...commandInstructions].join('\n');
