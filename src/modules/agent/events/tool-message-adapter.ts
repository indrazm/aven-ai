import {z} from 'zod';
import type {ToolMessage} from '../../conversation/index.js';
import {fileToolResultSchema, type FileToolResult} from '../tools/files/contracts.js';
import {commandResultDetail, type ExecCommandResult} from '../../../libs/pty/index.js';

export const execResultSchema = z.object({
	command: z.string(),
	cwd: z.string(),
	exitCode: z.number().int().nullable(),
	signal: z.number().int().nullable(),
	timedOut: z.boolean(),
	truncated: z.boolean(),
	output: z.string(),
});

export const safeJson = (value: unknown): string => {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
};

export const summaryFromArguments = (name: string, value: unknown): string => {
	if (typeof value === 'object' && value !== null) {
		if (name === 'ExecCommand' && 'command' in value && typeof value.command === 'string') return value.command;
		if ('file_path' in value && typeof value.file_path === 'string') return value.file_path;
	}
	return safeJson(value);
};

export const summaryFromSerializedArguments = (name: string, value: string): string => {
	try {
		return summaryFromArguments(name, JSON.parse(value));
	} catch {
		return value;
	}
};

export const groupForTool = (name: string): NonNullable<ToolMessage['group']> => {
	if (name === 'Read') return 'read';
	if (name === 'Edit' || name === 'Write') return 'edit';
	return 'bash';
};

const parseExecResult = (value: string): ExecCommandResult | undefined => {
	try {
		return execResultSchema.parse(JSON.parse(value));
	} catch {
		return undefined;
	}
};

export const parseFileResult = (value: string): FileToolResult | undefined => {
	try {
		return fileToolResultSchema.parse(JSON.parse(value));
	} catch {
		return undefined;
	}
};

export const toolMessageFromResult = (id: string, result: ExecCommandResult): ToolMessage => ({
	id,
	kind: 'tool',
	name: 'ExecCommand',
	status:
		result.timedOut || result.exitCode !== 0 || (result.signal !== null && result.signal !== 0) ? 'error' : 'success',
	summary: result.command,
	detail: commandResultDetail(result),
	group: 'bash',
});

const fileToolMessageFromResult = (id: string, result: FileToolResult): ToolMessage => {
	if (result.status === 'error') {
		return {
			id,
			kind: 'tool',
			name: result.tool,
			status: 'error',
			summary: result.file_path,
			detail: result.error,
			group: groupForTool(result.tool),
		};
	}
	if (result.tool === 'Read') {
		const detail =
			result.status === 'unchanged'
				? result.message
				: `Read ${result.num_lines} of ${result.total_lines} lines from line ${result.start_line}${result.truncated ? ' (output capped)' : ''}.`;
		return {
			id,
			kind: 'tool',
			name: result.tool,
			status: 'success',
			summary: result.file_path,
			detail,
			group: 'read',
		};
	}
	return {
		id,
		kind: 'tool',
		name: result.tool,
		status: 'success',
		summary: result.file_path,
		detail: result.message,
		group: 'edit',
	};
};

export const toolMessageFromSerializedResult = (
	id: string,
	name: string,
	serializedResult: string,
	summary: string,
): ToolMessage => {
	const execResult = parseExecResult(serializedResult);
	if (execResult) return toolMessageFromResult(id, execResult);
	const fileResult = parseFileResult(serializedResult);
	if (fileResult) return fileToolMessageFromResult(id, fileResult);
	return {
		id,
		kind: 'tool',
		name,
		status: 'error',
		summary,
		detail: serializedResult,
		group: groupForTool(name),
	};
};
