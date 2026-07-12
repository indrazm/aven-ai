import type {UiMessage} from '../types.js';
import type {RowSegment, TranscriptRow} from '../types.js';

export const makeRow = (
	message: UiMessage,
	index: number,
	segments: RowSegment[],
	background?: TranscriptRow['background'],
): TranscriptRow => ({
	id: `${message.id}:${index}`,
	messageId: message.id,
	messageKind: message.kind,
	segments,
	...(background ? {background} : {}),
});

export const rowText = (row: TranscriptRow, selectableOnly = false): string =>
	(selectableOnly ? row.segments.filter((segment) => segment.selectable !== false) : row.segments)
		.map((segment) => segment.text)
		.join('');
