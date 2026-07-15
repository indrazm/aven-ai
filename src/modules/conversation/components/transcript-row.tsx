import {Box, Text} from 'ink';
import stringWidth from 'string-width';
import {terminalHyperlink, theme, toneColor} from '../../../libs/terminal/index.js';
import {rowText} from '../services/row-model.js';
import {selectionColumnsForRow, splitSegmentsForSelection} from '../services/selection.js';
import type {SelectionState, TranscriptRow as TranscriptRowModel} from '../types.js';

type Props = {
	row: TranscriptRowModel;
	rowIndex: number;
	selection: SelectionState | null;
};

const ROW_BACKGROUNDS: Readonly<Record<NonNullable<TranscriptRowModel['background']>, string>> = {
	user: theme.userBackground,
	code: theme.codeBackground,
	selected: theme.selectionBackground,
	addition: theme.diffAdditionBackground,
	deletion: theme.diffDeletionBackground,
};

const SEGMENT_BACKGROUNDS: Readonly<Record<NonNullable<TranscriptRowModel['segments'][number]['background']>, string>> =
	{
		addition: theme.diffAdditionWordBackground,
		deletion: theme.diffDeletionWordBackground,
	};

const backgroundFor = (row: TranscriptRowModel): string | undefined =>
	row.background ? ROW_BACKGROUNDS[row.background] : undefined;

export const TranscriptRow = ({row, rowIndex, selection}: Props) => {
	const columns = selectionColumnsForRow(selection, rowIndex, stringWidth(rowText(row)));
	const segments = splitSegmentsForSelection(row.segments, columns);

	return (
		<Box height={1} paddingX={1} backgroundColor={backgroundFor(row)} overflow="hidden">
			<Text wrap="truncate-end">
				{segments.map((segment, segmentIndex) => (
					<Text
						key={`${row.id}:${segmentIndex}`}
						color={segment.color ?? toneColor(segment.tone)}
						{...(segment.selected
							? {backgroundColor: theme.selectionBackground}
							: segment.background
								? {backgroundColor: SEGMENT_BACKGROUNDS[segment.background]}
								: {})}
						{...(segment.bold ? {bold: true} : {})}
						{...(segment.dim ? {dimColor: true} : {})}
						{...(segment.italic ? {italic: true} : {})}
						{...(segment.underline ? {underline: true} : {})}
						{...(segment.strikethrough ? {strikethrough: true} : {})}
					>
						{segment.link ? terminalHyperlink(segment.text, segment.link) : segment.text}
					</Text>
				))}
			</Text>
		</Box>
	);
};
