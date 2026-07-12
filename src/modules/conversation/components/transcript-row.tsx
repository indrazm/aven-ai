import {Box, Text} from 'ink';
import stringWidth from 'string-width';
import {theme, toneColor} from '../../../libs/terminal/index.js';
import {rowText} from '../services/row-model.js';
import {selectionColumnsForRow, splitSegmentsForSelection} from '../services/selection.js';
import type {SelectionState, TranscriptRow as TranscriptRowModel} from '../types.js';

type Props = {
	row: TranscriptRowModel;
	rowIndex: number;
	selection: SelectionState | null;
};

const backgroundFor = (row: TranscriptRowModel): string | undefined =>
	row.background === 'user' ? theme.userBackground : row.background === 'code' ? theme.codeBackground : undefined;

export const TranscriptRow = ({row, rowIndex, selection}: Props) => {
	const columns = selectionColumnsForRow(selection, rowIndex, stringWidth(rowText(row)));
	const segments = splitSegmentsForSelection(row.segments, columns);

	return (
		<Box height={1} paddingX={1} backgroundColor={backgroundFor(row)} overflow="hidden">
			<Text wrap="truncate-end">
				{segments.map((segment, segmentIndex) => (
					<Text
						key={`${row.id}:${segmentIndex}`}
						color={toneColor(segment.tone)}
						{...(segment.selected ? {backgroundColor: theme.selectionBackground} : {})}
						{...(segment.bold ? {bold: true} : {})}
						{...(segment.dim ? {dimColor: true} : {})}
						{...(segment.italic ? {italic: true} : {})}
						{...(segment.underline ? {underline: true} : {})}
					>
						{segment.text}
					</Text>
				))}
			</Text>
		</Box>
	);
};
