import {forwardRef, useRef} from 'react';
import {Box, Text, useBoxMetrics, type DOMElement} from 'ink';
import type {UiMessage} from '../types.js';
import {theme} from '../../../libs/terminal/index.js';
import {rowText} from '../services/row-model.js';
import {TranscriptRow} from './transcript-row.js';
import type {TranscriptHandle} from '../types.js';
import {useTranscriptController} from '../services/use-transcript-controller.js';

export type {TranscriptHandle} from '../types.js';

type Props = {
	messages: readonly UiMessage[];
	active: boolean;
};

export const VirtualTranscript = forwardRef<TranscriptHandle, Props>(({messages, active}, handleRef) => {
	const boxRef = useRef<DOMElement>(null);
	const metrics = useBoxMetrics(boxRef);
	const controller = useTranscriptController(messages, metrics, handleRef, active);

	return (
		<Box ref={boxRef} flexDirection="column" flexGrow={1} overflow="hidden">
			{controller.stickyRow ? (
				<Box height={1} paddingX={1} backgroundColor={theme.codeBackground} overflow="hidden">
					<Text color={theme.muted}>↑ </Text>
					<Text color={theme.text} wrap="truncate-end">
						{rowText(controller.stickyRow).trim()}
					</Text>
				</Box>
			) : null}
			{controller.topPadding > 0 ? <Box height={controller.topPadding} /> : null}
			{controller.visibleRows.map((row, visibleIndex) => (
				<TranscriptRow
					key={row.id}
					row={row}
					rowIndex={controller.scrollTop + visibleIndex}
					selection={controller.selection}
				/>
			))}
			{controller.unseen > 0 ? (
				<Box position="absolute" bottom={0} width="100%" justifyContent="center">
					<Text color={theme.accent} backgroundColor={theme.codeBackground} bold>
						↓ {controller.unseen} new message{controller.unseen === 1 ? '' : 's'}
					</Text>
				</Box>
			) : null}
			{active ? (
				<Box position="absolute" right={0} top={0}>
					<Text color={theme.subtle}>TRANSCRIPT </Text>
				</Box>
			) : null}
		</Box>
	);
});

VirtualTranscript.displayName = 'VirtualTranscript';
