import {isAbsolute, normalize, relative, resolve, sep} from 'node:path';
import {FileToolValidationError} from './file-tool-error.js';

export const validatedPath = (value: string, projectRoot: string): string => {
	if (/^(?:\\\\|\/\/)/u.test(value)) throw new FileToolValidationError('UNC paths are not supported.');
	if (isAbsolute(value)) return normalize(value);

	const path = resolve(projectRoot, value);
	const projectRelative = relative(projectRoot, path);
	if (projectRelative === '..' || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative)) {
		throw new FileToolValidationError('Relative file_path must stay within the project root.');
	}
	return normalize(path);
};
