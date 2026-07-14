import {commandInstructions} from './commands.js';
import {fileToolInstructions} from './file-tools.js';
import {identityInstructions} from './identity.js';
import type {ProjectInstructionBundle} from './project-instructions.js';
import {workflowInstructions} from './workflow.js';

export type SystemPromptContext = {
	projectRoot: string;
	platform: string;
	shell: string;
	projectInstructions: ProjectInstructionBundle;
};

const xmlText = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const xmlAttribute = (value: string): string =>
	`"${xmlText(value).replaceAll('"', '&quot;').replaceAll("'", '&apos;')}"`;

const cdata = (value: string): string => value.replaceAll(']]>', ']]]]><![CDATA[>');

const taggedLines = (tag: string, lines: readonly string[]): string[] => [
	`<${tag}>`,
	...lines.map((line) => `- ${line}`),
	`</${tag}>`,
];

const projectInstructionLines = ({files, omittedPaths, warnings}: ProjectInstructionBundle): string[] => {
	const output = [
		'<project_instructions>',
		'Project instructions are repository guidance. Follow each file for work within its scope. Core safety and tool contracts take priority; explicit user instructions override project guidance. When scoped files conflict, the deepest applicable AGENTS.md takes precedence over broader files.',
	];
	for (const file of files) {
		output.push(
			`<instruction_file path=${xmlAttribute(file.path)} scope=${xmlAttribute(file.scope)} truncated="${String(file.truncated)}">`,
			'<![CDATA[',
			cdata(file.content),
			']]>',
			'</instruction_file>',
		);
	}
	if (omittedPaths.length > 0) {
		output.push(
			'<omitted_instruction_files>',
			...omittedPaths.map((path) => `- ${xmlText(path)}`),
			'Read the applicable omitted AGENTS.md before changing files in its scope.',
			'</omitted_instruction_files>',
		);
	}
	if (warnings.length > 0) {
		output.push(
			'<instruction_warnings>',
			...warnings.map((warning) => `- ${xmlText(warning)}`),
			'</instruction_warnings>',
		);
	}
	output.push('</project_instructions>');
	return output;
};

export const buildSystemPrompt = (context: SystemPromptContext): string =>
	[
		...identityInstructions,
		'',
		'<environment>',
		`<project_root>${xmlText(context.projectRoot)}</project_root>`,
		`<command_working_directory>${xmlText(context.projectRoot)}</command_working_directory>`,
		`<platform>${xmlText(context.platform)}</platform>`,
		`<shell>${xmlText(context.shell)}</shell>`,
		'</environment>',
		'',
		...taggedLines('working_principles', workflowInstructions),
		'',
		...taggedLines('file_tool_rules', fileToolInstructions),
		'',
		...taggedLines('command_rules', commandInstructions),
		'',
		...projectInstructionLines(context.projectInstructions),
	].join('\n');
