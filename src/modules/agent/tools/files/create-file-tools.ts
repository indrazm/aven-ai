import {createTool} from '@anvia/core';
import {
	editInputSchema,
	editResultSchema,
	readInputSchema,
	readResultSchema,
	writeInputSchema,
	writeResultSchema,
} from './contracts.js';
import type {FileToolService} from './file-tool-service.js';

export const createFileTools = (service: FileToolService, signal: AbortSignal) => [
	createTool({
		name: 'Read',
		description:
			'Read a UTF-8 or UTF-16LE text file by absolute path with compact line-numbered output. Read files before changing them.',
		input: readInputSchema,
		output: readResultSchema,
		execute: (input) => service.read(input, signal),
	}),
	createTool({
		name: 'Edit',
		description:
			'Replace an exact string in a text file. Existing files must be read first, and stale files are rejected.',
		input: editInputSchema,
		output: editResultSchema,
		execute: (input) => service.edit(input, signal),
	}),
	createTool({
		name: 'Write',
		description:
			'Write complete text file contents. Existing files must be read first; new files and parent directories may be created.',
		input: writeInputSchema,
		output: writeResultSchema,
		execute: (input) => service.write(input, signal),
	}),
];
