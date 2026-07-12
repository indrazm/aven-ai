import {z} from 'zod';

export const readInputSchema = z
	.object({
		file_path: z.string().min(1).describe('Absolute path to the text file to read.'),
		offset: z.number().int().positive().optional().describe('One-based line number to start reading from.'),
		limit: z.number().int().positive().optional().describe('Maximum number of lines to return (defaults to 2000).'),
	})
	.strict();

export const editInputSchema = z
	.object({
		file_path: z.string().min(1).describe('Absolute path to the text file to edit.'),
		old_string: z.string().describe('Exact text to replace. Use an empty string only when creating a new file.'),
		new_string: z.string().describe('Replacement text.'),
		replace_all: z.boolean().optional().describe('Replace every exact match instead of requiring a unique match.'),
	})
	.strict();

export const writeInputSchema = z
	.object({
		file_path: z.string().min(1).describe('Absolute path to the text file to write.'),
		content: z.string().describe('Complete file content.'),
	})
	.strict();

const fileErrorSchema = z
	.object({
		status: z.literal('error'),
		tool: z.enum(['Read', 'Edit', 'Write']),
		file_path: z.string(),
		error: z.string(),
	})
	.strict();

const readSuccessSchema = z
	.object({
		status: z.literal('success'),
		tool: z.literal('Read'),
		file_path: z.string(),
		content: z.string(),
		start_line: z.number().int().positive(),
		num_lines: z.number().int().nonnegative(),
		total_lines: z.number().int().nonnegative(),
		truncated: z.boolean(),
	})
	.strict();

const readUnchangedSchema = z
	.object({
		status: z.literal('unchanged'),
		tool: z.literal('Read'),
		file_path: z.string(),
		start_line: z.number().int().positive(),
		num_lines: z.number().int().nonnegative(),
		total_lines: z.number().int().nonnegative(),
		message: z.string(),
	})
	.strict();

const editSuccessSchema = z
	.object({
		status: z.literal('success'),
		tool: z.literal('Edit'),
		file_path: z.string(),
		replacements: z.number().int().positive(),
		operation_id: z.string(),
		message: z.string(),
	})
	.strict();

const writeSuccessSchema = z
	.object({
		status: z.literal('success'),
		tool: z.literal('Write'),
		file_path: z.string(),
		operation: z.enum(['create', 'update']),
		operation_id: z.string(),
		message: z.string(),
	})
	.strict();

export const readResultSchema = z.union([readSuccessSchema, readUnchangedSchema, fileErrorSchema]);
export const editResultSchema = z.union([editSuccessSchema, fileErrorSchema]);
export const writeResultSchema = z.union([writeSuccessSchema, fileErrorSchema]);
export const fileToolResultSchema = z.union([
	readSuccessSchema,
	readUnchangedSchema,
	editSuccessSchema,
	writeSuccessSchema,
	fileErrorSchema,
]);

export type ReadInput = z.infer<typeof readInputSchema>;
export type EditInput = z.infer<typeof editInputSchema>;
export type WriteInput = z.infer<typeof writeInputSchema>;
export type ReadResult = z.infer<typeof readResultSchema>;
export type EditResult = z.infer<typeof editResultSchema>;
export type WriteResult = z.infer<typeof writeResultSchema>;
export type FileToolResult = z.infer<typeof fileToolResultSchema>;
