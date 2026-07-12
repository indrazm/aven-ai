import {Spinner, ThemeProvider, defaultTheme, extendTheme} from '@inkjs/ui';
import {Box, Text} from 'ink';
import type {AgentStatus, InputMode} from '../../agent/index.js';
import {theme} from '../../../libs/terminal/index.js';
import {suggestionWindow} from '../services/suggestions.js';
import type {Suggestion} from '../types.js';

type Props = {
	value: string;
	cursor: number;
	mode: InputMode;
	status: AgentStatus;
	queuedPrompts: readonly string[];
	suggestions: readonly Suggestion[];
	selectedSuggestion: number;
	exitHint: boolean;
	providerModel: string;
};

const statusLabel: Record<Exclude<AgentStatus, 'idle'>, string> = {
	thinking: 'Thinking…',
	runningTool: 'Running tool…',
	waitingPermission: 'Waiting for permission',
	error: 'Stopped',
};

const spinnerTheme = extendTheme(defaultTheme, {
	components: {
		Spinner: {
			styles: {
				frame: () => ({color: theme.accent}),
				label: () => ({color: theme.muted}),
			},
		},
	},
});

export const Composer = ({
	value,
	cursor,
	mode,
	status,
	queuedPrompts,
	suggestions,
	selectedSuggestion,
	exitHint,
	providerModel,
}: Props) => {
	const safeCursor = Math.max(0, Math.min(cursor, value.length));
	const current = value.slice(safeCursor, safeCursor + 1);
	const before = value.slice(0, safeCursor);
	const after = value.slice(safeCursor + (current ? 1 : 0));
	const cursorGlyph = current === '\n' || current === '' ? ' ' : current;
	const suffix = current === '\n' ? `\n${after}` : after;
	const visibleSuggestions = suggestionWindow(suggestions, selectedSuggestion);

	return (
		<Box flexDirection="column" flexShrink={0}>
			{queuedPrompts.length > 0 ? (
				<Box paddingX={1} flexDirection="column">
					{queuedPrompts.slice(0, 3).map((prompt, index) => (
						<Text key={`${prompt}:${index}`} color={theme.muted} wrap="truncate-end">
							◌ queued · {prompt}
						</Text>
					))}
				</Box>
			) : null}
			{suggestions.length > 0 ? (
				<Box marginX={1} paddingX={1} flexDirection="column" borderStyle="round" borderColor={theme.subtle}>
					{visibleSuggestions.map(({suggestion, index}) => (
						<Box key={suggestion.label}>
							<Text
								color={index === selectedSuggestion ? theme.accent : theme.text}
								bold={index === selectedSuggestion}
							>
								{index === selectedSuggestion ? '❯ ' : '  '}
								{suggestion.label}
							</Text>
							<Text color={theme.muted}> {suggestion.description}</Text>
						</Box>
					))}
				</Box>
			) : null}
			<Box
				marginX={1}
				paddingX={1}
				borderStyle="round"
				borderColor={mode === 'bash' ? theme.warning : theme.promptBorder}
				minHeight={3}
				maxHeight={9}
				overflow="hidden"
			>
				<Text color={mode === 'bash' ? theme.warning : theme.accent} bold>
					{mode === 'bash' ? '! ' : '❯ '}
				</Text>
				<Text color={theme.text} wrap="wrap">
					{before}
					<Text inverse>{cursorGlyph}</Text>
					{suffix}
				</Text>
			</Box>
			<Box paddingX={2} justifyContent="space-between">
				{exitHint ? (
					<Text color={theme.warning}>Press again to exit</Text>
				) : status === 'thinking' ? (
					<ThemeProvider theme={spinnerTheme}>
						<Spinner label={statusLabel[status]} />
					</ThemeProvider>
				) : status === 'idle' ? (
					<Text color={theme.provider}>{providerModel}</Text>
				) : (
					<Text color={theme.muted}>{statusLabel[status]}</Text>
				)}
				<Text color={theme.subtle}>shift+enter newline · ctrl+o transcript / expand · ctrl+c twice exits</Text>
			</Box>
		</Box>
	);
};
