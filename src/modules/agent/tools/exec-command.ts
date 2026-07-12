import {createTool} from '@anvia/core';
import {z} from 'zod';
import type {PtyRunner} from '../../../libs/pty/index.js';
import {execResultSchema} from '../events/tool-message-adapter.js';

export const createExecCommandTool = (pty: PtyRunner, signal: AbortSignal) =>
	createTool({
		name: 'exec_command',
		description: 'Run a shell command in the current workspace using a PTY and return its exit status and output.',
		input: z.object({command: z.string().min(1).describe('The shell command to execute.')}),
		output: execResultSchema,
		execute: ({command}) => pty.run(command, {signal}),
	});
