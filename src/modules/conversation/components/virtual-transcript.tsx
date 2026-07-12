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
	const visibleEnd = Math.min(controller.rowCount, controller.scrollTop + controller.visibleRows.length);
	const position =
		controller.rowCount === 0 ? '0/0' : `${controller.scrollTop + 1}–${visibleEnd}/${controller.rowCount}`;
	const navigationHint = active
		? '↑↓/jk scroll · pgup/pgdn page · g/G ends · esc close'
		: 'pgup/pgdn scroll · ctrl+o navigate';

	return (
		<Box ref={boxRef} flexDirection="column" flexBasis={0} flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden">
			<Box height={1} flexShrink={0} paddingX={1} justifyContent="space-between" overflow="hidden">
				<Text color={active ? theme.accent : theme.muted} bold={active}>
					{active ? 'TRANSCRIPT' : 'CONVERSATION'}
				</Text>
				<Text color={controller.hasUnseen ? theme.accent : theme.subtle} wrap="truncate-end">
					{controller.hasUnseen
						? `↓ new output · ${position} · ${active ? 'G/end' : 'ctrl+end'} to follow`
						: controller.pinned
							? navigationHint
							: `${position} · ${navigationHint}`}
				</Text>
			</Box>
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
		</Box>
	);
});

VirtualTranscript.displayName = 'VirtualTranscript';
