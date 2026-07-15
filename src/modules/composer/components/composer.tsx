import {Spinner, ThemeProvider, defaultTheme, extendTheme} from '@inkjs/ui';
import {Box, Text} from 'ink';
import type {AgentStatus, InputMode} from '../../agent/index.js';
import {theme} from '../../../libs/terminal/index.js';
import {suggestionWindow} from '../services/suggestions.js';
import type {Suggestion, SuggestionStatus} from '../types.js';

type Props = {
	value: string;
	cursor: number;
	mode: InputMode;
	status: AgentStatus;
	queuedPrompts: readonly string[];
	suggestions: readonly Suggestion[];
	selectedSuggestion: number;
	suggestionMode?: 'command' | 'mention';
	suggestionStatus?: SuggestionStatus;
	exitHint: boolean;
	providerModel: string;
	workingDirectory: string;
	transcriptActive: boolean;
};

const spinnerTheme = extendTheme(defaultTheme, {
	components: {
		Spinner: {
			styles: {
				frame: () => ({color: theme.accent}),
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
	suggestionMode,
	suggestionStatus,
	exitHint,
	providerModel,
	workingDirectory,
	transcriptActive,
}: Props) => {
	const safeCursor = Math.max(0, Math.min(cursor, value.length));
	const current = value.slice(safeCursor, safeCursor + 1);
	const before = value.slice(0, safeCursor);
	const after = value.slice(safeCursor + (current ? 1 : 0));
	const cursorGlyph = current === '\n' || current === '' ? ' ' : current;
	const suffix = current === '\n' ? `\n${after}` : after;
	const activeSuggestion = Math.max(0, Math.min(suggestions.length - 1, selectedSuggestion));
	const visibleSuggestions = suggestionWindow(suggestions, activeSuggestion);
	const showSpinner = status === 'thinking' || status === 'runningTool' || status === 'waitingPermission';
	const controls = transcriptActive
		? '↑↓/jk scroll · pgup/pgdn page · g/G ends · esc close'
		: showSpinner
			? 'enter steer · tab queue · shift+enter newline'
			: suggestionMode === 'mention'
				? '↑↓ choose · tab/enter insert · esc close'
				: suggestionMode === 'command'
					? '↑↓ choose · tab complete · enter run'
					: '@ files · shift+enter newline';

	return (
		<Box flexDirection="column" flexShrink={0}>
			{queuedPrompts.length > 0 ? (
				<Box paddingX={1} flexDirection="column">
					{queuedPrompts.slice(0, 3).map((prompt, index) => (
						<Text key={`${prompt}:${index}`} color={theme.muted} wrap="truncate-end">
							◌ queued · {prompt}
						</Text>
					))}
					{queuedPrompts.length > 3 ? (
						<Text color={theme.muted}>◌ queued · +{queuedPrompts.length - 3} more</Text>
					) : null}
				</Box>
			) : null}
			{suggestions.length > 0 || suggestionStatus ? (
				<Box marginX={1} paddingX={1} flexDirection="column" borderStyle="round" borderColor={theme.subtle}>
					{suggestionStatus ? (
						<Box>
							{suggestionStatus.kind === 'loading' ? (
								<ThemeProvider theme={spinnerTheme}>
									<Spinner />
									<Text> </Text>
								</ThemeProvider>
							) : null}
							<Text color={suggestionStatus.kind === 'error' ? theme.warning : theme.muted}>
								{suggestionStatus.message}
							</Text>
						</Box>
					) : null}
					{visibleSuggestions.map(({suggestion, index}) => (
						<Box key={`${suggestion.kind}:${suggestion.label}`}>
							<Text color={index === activeSuggestion ? theme.accent : theme.text} bold={index === activeSuggestion}>
								{index === activeSuggestion ? '❯ ' : '  '}
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
			<Box height={1} flexShrink={0} paddingX={2} justifyContent="space-between" overflow="hidden">
				<Box minWidth={0} flexShrink={1} overflow="hidden">
					{exitHint ? (
						<Text color={theme.warning}>Press again to exit · </Text>
					) : showSpinner ? (
						<ThemeProvider theme={spinnerTheme}>
							<Spinner />
							<Text> </Text>
						</ThemeProvider>
					) : null}
					<Box minWidth={0} flexShrink={1} overflow="hidden">
						<Text color={theme.muted} wrap="truncate-middle">
							{workingDirectory}
						</Text>
					</Box>
					<Text color={theme.subtle}> · </Text>
					<Text color={theme.provider}>{providerModel}</Text>
				</Box>
				<Text color={transcriptActive ? theme.accent : theme.muted} wrap="truncate-end">
					{controls}
				</Text>
			</Box>
		</Box>
	);
};
