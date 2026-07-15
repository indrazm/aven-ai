import {createTool} from '@anvia/core';
import {z} from 'zod';
import type {PtyRunner} from '../../../libs/pty/index.js';
import {execResultSchema} from '../events/tool-message-adapter.js';

export const createExecCommandTool = (pty: PtyRunner, signal: AbortSignal) =>
	createTool({
		name: 'ExecCommand',
		description:
			'Run a shell command in a PTY whose working directory is already the project root. Use repository-relative paths and do not prefix commands with cd to the project root.',
		input: z.object({command: z.string().min(1).describe('The shell command to execute.')}),
		output: execResultSchema,
		execute: ({command}) => pty.run(command, {signal}),
	});
