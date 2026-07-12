import {isAbsolute, normalize} from 'node:path';
import {FileToolValidationError} from './file-tool-error.js';

export const validatedPath = (value: string): string => {
	if (/^(?:\\\\|\/\/)/u.test(value)) throw new FileToolValidationError('UNC paths are not supported.');
	if (!isAbsolute(value)) throw new FileToolValidationError('file_path must be absolute.');
	return normalize(value);
};
