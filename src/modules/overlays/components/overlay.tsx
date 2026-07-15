import {Box, Text} from 'ink';
import {theme} from '../../../libs/terminal/index.js';
import {overlayTitle} from '../services/overlay-registry.js';
import type {OverlayItem, OverlayRoute} from '../types.js';

type Props = {
	route: OverlayRoute;
	query: string;
	items: readonly OverlayItem[];
	selectedIndex: number;
};

export const Overlay = ({route, query, items, selectedIndex}: Props) => {
	const start = Math.max(0, Math.min(selectedIndex - 8, items.length - 9));
	const visibleItems = items.slice(start, start + 9);
	return (
		<Box
			marginX={1}
			paddingX={1}
			flexDirection="column"
			borderStyle="round"
			borderColor={theme.accent}
			maxHeight={13}
			overflow="hidden"
			flexShrink={0}
		>
			<Box justifyContent="space-between">
				<Text color={theme.accent} bold>
					{overlayTitle[route]}
				</Text>
				<Text color={theme.muted}>esc close</Text>
			</Box>
			{route === 'setupKey' ? (
				<Text color={theme.text}>
					API key <Text color={theme.muted}>{'•'.repeat(query.length)}</Text>
					<Text inverse> </Text>
				</Text>
			) : null}
			{route === 'setupBaseUrl' ? (
				<Text color={theme.text}>
					Workspace URL {query}
					<Text inverse> </Text>
				</Text>
			) : null}
			{route === 'sessions' || route === 'search' || route === 'model' ? (
				<Text color={theme.text}>
					⌕ {query}
					<Text inverse> </Text>
				</Text>
			) : null}
			{items.length === 0 && route !== 'setupKey' && route !== 'setupBaseUrl' ? (
				<Text color={theme.muted}> No matches</Text>
			) : (
				visibleItems.map((item, offset) => {
					const index = start + offset;
					return (
						<Box key={`${item.label}:${index}`}>
							<Text color={index === selectedIndex ? theme.accent : theme.text} bold={index === selectedIndex}>
								{index === selectedIndex ? '❯ ' : '  '}
								{item.label}
							</Text>
							<Text color={theme.muted}> {item.description}</Text>
						</Box>
					);
				})
			)}
		</Box>
	);
};

export type {OverlayItem} from '../types.js';
