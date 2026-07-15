import {diffLines} from 'diff';
import {isAbsolute, relative} from 'node:path';
import stringWidth from 'string-width';
import type {ToolMessage, UiMessage} from '../types.js';
import {markdownRows} from './markdown-rows.js';
import {makeRow} from './row-model.js';
import type {RowSegment, TranscriptRow} from '../types.js';
import {wrapSegments} from './wrapping.js';

const TOOL_DETAIL_PREFIX = '  ⎿  ';
const SUCCESS_DETAIL_LINES = 3;
const ERROR_DETAIL_LINES = 10;

const TOOL_STATUS_MARKER: Record<ToolMessage['status'], string> = {
	queued: '◌',
	running: '✻',
	waitingPermission: '?',
	success: '✓',
	error: '×',
	rejected: '×',
	cancelled: '–',
};

const displayToolSummary = (message: Extract<UiMessage, {kind: 'tool'}>): string => {
	if ((message.group !== 'read' && message.group !== 'edit') || !isAbsolute(message.summary)) return message.summary;
	const projectRelative = relative(process.cwd(), message.summary);
	return projectRelative && !projectRelative.startsWith('..') && !isAbsolute(projectRelative)
		? projectRelative
		: message.summary;
};

const toolSummaryRow = (message: Extract<UiMessage, {kind: 'tool'}>, contentWidth: number): TranscriptRow => {
	const statusTone =
		message.status === 'error' || message.status === 'rejected'
			? 'error'
			: message.status === 'success'
				? 'success'
				: message.status === 'waitingPermission'
					? 'permission'
					: 'tool';
	const segments: RowSegment[] = [
		{
			text: `${TOOL_STATUS_MARKER[message.status]} ${message.name}`,
			tone: statusTone,
			bold: true,
			selectable: false,
		},
		{text: '  ', selectable: false},
		{text: displayToolSummary(message), tone: 'muted'},
	];
	const wrapped = wrapSegments(segments, contentWidth);
	if (wrapped.length === 1) return makeRow(message, 0, wrapped[0] ?? []);

	const truncated = wrapSegments(segments, Math.max(1, contentWidth - 1))[0] ?? [];
	return makeRow(message, 0, [...truncated, {text: '…', tone: 'muted', selectable: false}]);
};

const toolDetailRows = (
	message: Extract<UiMessage, {kind: 'tool'}>,
	contentWidth: number,
	expanded: boolean,
): TranscriptRow[] => {
	if (!message.detail) return [];
	if (message.name === 'ExecCommand' && !expanded) return [];
	if (message.group === 'read' && message.status === 'success') return [];
	const detailTone = message.status === 'error' ? 'error' : 'muted';
	const detailWidth = Math.max(1, contentWidth - stringWidth(TOOL_DETAIL_PREFIX));
	const wrapped = wrapSegments([{text: message.detail, tone: detailTone}], detailWidth);
	const diagnostic = message.status === 'error' || message.status === 'rejected' || message.status === 'cancelled';
	const limit = diagnostic ? ERROR_DETAIL_LINES : SUCCESS_DETAIL_LINES;
	const visibleCount =
		expanded || wrapped.length <= limit || (!diagnostic && wrapped.length === limit + 1) ? wrapped.length : limit;
	const rows = wrapped
		.slice(0, visibleCount)
		.map((segments, index) =>
			makeRow(message, index, [{text: TOOL_DETAIL_PREFIX, tone: 'subtle', selectable: false}, ...segments]),
		);
	const hiddenCount = wrapped.length - visibleCount;
	if (hiddenCount > 0) {
		rows.push(
			makeRow(message, rows.length, [
				{text: TOOL_DETAIL_PREFIX, tone: 'subtle', selectable: false},
				{
					text: `… +${hiddenCount} ${hiddenCount === 1 ? 'line' : 'lines'} (ctrl+o to expand)`,
					tone: 'muted',
					selectable: false,
				},
			]),
		);
	}
	return rows;
};

export const messageToRows = (message: UiMessage, width: number, expanded = false): TranscriptRow[] => {
	const contentWidth = Math.max(8, width - 2);
	if (message.kind === 'assistant') {
		if (!message.content.trim()) return [];
		const prefix: RowSegment[] =
			message.variant === 'thinking'
				? [{text: '✻ ', tone: 'muted', selectable: false}]
				: message.variant === 'advisor'
					? [{text: '◇ ', tone: 'permission', selectable: false}]
					: [{text: '● ', tone: 'accent', selectable: false}];
		const gutterWidth = stringWidth(prefix[0]?.text ?? '');
		const rows = markdownRows(message, message.content, Math.max(1, contentWidth - gutterWidth));
		for (const [index, row] of rows.entries()) {
			row.segments = [index === 0 ? prefix[0]! : {text: ' '.repeat(gutterWidth), selectable: false}, ...row.segments];
		}
		return rows;
	}

	if (message.kind === 'user') {
		const marker = message.variant === 'bash' ? '! ' : '❯ ';
		return wrapSegments(
			[
				{text: marker, tone: message.variant === 'bash' ? 'warning' : 'user', bold: true, selectable: false},
				{text: message.content, tone: 'user'},
			],
			contentWidth,
		).map((segments, index) => makeRow(message, index, segments, 'user'));
	}

	if (message.kind === 'tool') {
		const lines = [toolSummaryRow(message, contentWidth)];
		for (const row of toolDetailRows(message, contentWidth, expanded)) {
			lines.push({...row, id: `${message.id}:${lines.length}`});
		}
		return lines;
	}

	if (message.kind === 'diff') {
		const rows = [makeRow(message, 0, [{text: ` ${message.file} `, tone: 'muted', bold: true}], 'code')];
		let index = 1;
		for (const part of diffLines(message.before, message.after)) {
			const prefix = part.added ? '+' : part.removed ? '-' : ' ';
			const tone = part.added ? 'addition' : part.removed ? 'deletion' : 'muted';
			for (const line of part.value.replace(/\n$/u, '').split('\n'))
				rows.push(
					makeRow(
						message,
						index++,
						[
							{text: `${prefix} `, tone, selectable: false},
							{text: line, tone},
						],
						'code',
					),
				);
		}
		return rows;
	}

	const marker =
		message.level === 'error' ? '✖' : message.level === 'warning' ? '⚠' : message.level === 'success' ? '✔' : '·';
	const tone = message.level === 'info' ? 'muted' : message.level;
	return wrapSegments(
		[
			{text: `${marker} `, tone, selectable: false},
			{text: message.content, tone},
		],
		contentWidth,
	).map((segments, index) => makeRow(message, index, segments));
};

export const shouldSeparateMessages = (previous: UiMessage, current: UiMessage): boolean => {
	const previousIsCommand = previous.kind === 'tool' && previous.name === 'ExecCommand';
	const currentIsCommand = current.kind === 'tool' && current.name === 'ExecCommand';
	if (previousIsCommand || currentIsCommand) return false;
	const previousIsActivity = previous.kind === 'tool' || previous.kind === 'diff';
	const currentIsActivity = current.kind === 'tool' || current.kind === 'diff';
	return !(previousIsActivity && currentIsActivity);
};

export const messagesToRows = (messages: readonly UiMessage[], width: number, expanded = false): TranscriptRow[] => {
	const rows: TranscriptRow[] = [];
	let previous: UiMessage | undefined;
	for (const message of messages) {
		const rendered = messageToRows(message, width, expanded);
		if (rendered.length === 0) continue;
		if (previous && shouldSeparateMessages(previous, message))
			rows.push({id: `${message.id}:gap`, messageId: message.id, messageKind: message.kind, segments: [{text: ''}]});
		rows.push(...rendered);
		previous = message;
	}
	return rows;
};

export {rowText} from './row-model.js';
export {wrapSegments} from './wrapping.js';
