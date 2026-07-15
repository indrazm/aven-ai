import {commandInstructions} from './commands.js';
import {fileToolInstructions} from './file-tools.js';
import {identityInstructions} from './identity.js';
import type {ProjectInstructionBundle} from './project-instructions.js';
import {workflowInstructions} from './workflow.js';

export type SystemPromptContext = {
	lexa: {
		skill: string;
		version: string;
	};
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
		'Automatic project-instruction discovery has already finished for the project root and its descendants. Do not use ExecCommand or file tools to search for AGENTS.md, and do not inspect parent directories for repository guidance.',
		'Follow each loaded instruction file for work within its scope. Core safety and tool contracts take priority; explicit user instructions override project guidance. When scoped files conflict, the deepest applicable AGENTS.md takes precedence over broader files.',
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
	if (files.some((file) => file.truncated)) {
		output.push(
			'Before changing files in the scope of a truncated instruction file, read only that exact path to retrieve the remaining guidance. Do not search for other instruction files.',
		);
	}
	if (omittedPaths.length > 0) {
		output.push(
			'<omitted_instruction_files>',
			...omittedPaths.map((path) => `- ${xmlText(path)}`),
			"Before changing files in an omitted instruction file's scope, read only the exact listed path. Do not search for additional instruction files.",
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

const lexaInstructionLines = ({skill, version}: SystemPromptContext['lexa']): string[] => [
	`<lexa version=${xmlAttribute(version)}>`,
	'Aven manages this required Lexa installation and exposes `lexa` on the command PATH. Do not install or upgrade Lexa during an agent run. Core safety and tool contracts take priority; explicit user instructions override the packaged Lexa guidance.',
	'Lexa reverse-dependency syntax is `lexa trace-deps <path> --reverse` (or `-r`). Add `--transitive` (or `-t`) only for recursive impact. `trace-deps` does not accept `--direction depended_by`. After any CLI usage error, inspect `lexa <command> --help` before retrying.',
	'<skill><![CDATA[',
	cdata(skill),
	']]></skill>',
	'</lexa>',
];

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
		...lexaInstructionLines(context.lexa),
		'',
		...projectInstructionLines(context.projectInstructions),
	].join('\n');
