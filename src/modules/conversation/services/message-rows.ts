import {diffLines} from 'diff';
import stringWidth from 'string-width';
import type {UiMessage} from '../types.js';
import {markdownRows} from './markdown-rows.js';
import {makeRow} from './row-model.js';
import type {RowSegment, TranscriptRow} from '../types.js';
import {wrapSegments} from './wrapping.js';

const TOOL_DETAIL_PREFIX = '  ⎿  ';
const SUCCESS_DETAIL_LINES = 3;
const ERROR_DETAIL_LINES = 10;

const toolDetailRows = (
	message: Extract<UiMessage, {kind: 'tool'}>,
	contentWidth: number,
	expanded: boolean,
): TranscriptRow[] => {
	if (!message.detail) return [];
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
		const prefix: RowSegment[] =
			message.variant === 'thinking'
				? [{text: '✻ ', tone: 'muted', selectable: false}]
				: message.variant === 'advisor'
					? [{text: '◇ ', tone: 'permission', selectable: false}]
					: [{text: '● ', tone: 'accent', selectable: false}];
		const rows = markdownRows(message, message.content, contentWidth);
		if (rows[0]) rows[0].segments = [...prefix, ...rows[0].segments];
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
		const statusTone =
			message.status === 'error' || message.status === 'rejected'
				? 'error'
				: message.status === 'success'
					? 'success'
					: message.status === 'waitingPermission'
						? 'permission'
						: 'tool';
		const statusMark =
			message.status === 'success' ? '⎿' : message.status === 'running' ? '✻' : message.status === 'queued' ? '◌' : '⎿';
		const lines = wrapSegments(
			[
				{text: `${statusMark} ${message.name}`, tone: statusTone, bold: true, selectable: false},
				{text: `(${message.summary})`, tone: 'muted'},
			],
			contentWidth,
		).map((segments, index) => makeRow(message, index, segments));
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

export const messagesToRows = (messages: readonly UiMessage[], width: number, expanded = false): TranscriptRow[] => {
	const rows: TranscriptRow[] = [];
	for (const message of messages) {
		if (rows.length > 0)
			rows.push({id: `${message.id}:gap`, messageId: message.id, messageKind: message.kind, segments: [{text: ''}]});
		rows.push(...messageToRows(message, width, expanded));
	}
	return rows;
};

export {rowText} from './row-model.js';
export {wrapSegments} from './wrapping.js';
