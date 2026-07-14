import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ForwardedRef,
} from 'react';
import type {UseBoxMetricsResult} from 'ink';
import stringWidth from 'string-width';
import type {UiMessage} from '../types.js';
import {useTerminalController} from '../../../libs/terminal/index.js';
import {rowText} from './row-model.js';
import {lineSelection, selectedText, wordSelection} from './selection.js';
import type {SelectionState, TranscriptHandle, TranscriptRow} from '../types.js';
import {TranscriptRowCache} from './transcript-row-cache.js';

type Result = {
	visibleRows: TranscriptRow[];
	selection: SelectionState | null;
	scrollTop: number;
	stickyRow: TranscriptRow | undefined;
	topPadding: number;
};

export const useTranscriptController = (
	messages: readonly UiMessage[],
	metrics: UseBoxMetricsResult,
	handleRef: ForwardedRef<TranscriptHandle>,
	expanded = false,
): Result => {
	const {subscribeMouse, copyText} = useTerminalController();
	const width = Math.max(12, metrics.width || 80);
	const rowCache = useRef(new TranscriptRowCache());
	const rows = useMemo(() => rowCache.current.rowsFor(messages, width, expanded), [expanded, messages, width]);
	const [scrollTop, setScrollTop] = useState(0);
	// A terminal input chunk can contain several wheel events before React renders again.
	const scrollTopRef = useRef(0);
	const [pinned, setPinned] = useState(true);
	const pinnedRef = useRef(true);
	const [selection, setSelection] = useState<SelectionState | null>(null);
	const selectionRef = useRef<SelectionState | null>(null);
	const lastClick = useRef({time: 0, row: -1, column: -1, count: 0});

	const stickyRow = useMemo(() => {
		if (pinned || scrollTop <= 0) return undefined;
		for (let index = Math.min(scrollTop, rows.length - 1); index >= 0; index--) {
			const row = rows[index];
			if (row?.messageKind === 'user' && rowText(row).trim()) return row;
		}
		return undefined;
	}, [pinned, rows, scrollTop]);
	const stickyHeight = stickyRow ? 1 : 0;
	const viewportHeight = Math.max(1, (metrics.height || 1) - stickyHeight);
	const maxScroll = Math.max(0, rows.length - viewportHeight);
	// Follow a growing response in the same render that adds its rows. Waiting
	// for an effect produces a stale frame followed by a visible jump.
	const visibleScrollTop = pinned ? maxScroll : Math.max(0, Math.min(maxScroll, scrollTop));
	const topPadding = Math.max(0, viewportHeight - rows.length);

	const updateScroll = useCallback(
		(next: number) => {
			const maximum = Math.max(0, rows.length - viewportHeight);
			const clamped = Math.max(0, Math.min(maximum, next));
			scrollTopRef.current = clamped;
			setScrollTop(clamped);
			const atBottom = clamped >= maximum;
			setPinned(atBottom);
			pinnedRef.current = atBottom;
		},
		[rows.length, viewportHeight],
	);

	useLayoutEffect(() => {
		if (!metrics.hasMeasured) return;
		scrollTopRef.current = visibleScrollTop;
	}, [metrics.hasMeasured, visibleScrollTop]);

	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);

	const copySelection = useCallback(() => {
		const value = selectedText(rows, selectionRef.current);
		if (!value) return false;
		copyText(value);
		return true;
	}, [copyText, rows]);

	useImperativeHandle(
		handleRef,
		() => ({
			scrollBy: (amount) => updateScroll(scrollTopRef.current + amount),
			pageBy: (direction) => {
				const pageSize = Math.max(1, viewportHeight - 2);
				const remaining = maxScroll - scrollTopRef.current;
				updateScroll(
					direction > 0 && remaining <= viewportHeight ? maxScroll : scrollTopRef.current + direction * pageSize,
				);
			},
			scrollToTop: () => updateScroll(0),
			scrollToBottom: () => updateScroll(maxScroll),
			copySelection,
			clearSelection: () => {
				if (!selectionRef.current) return false;
				setSelection(null);
				return true;
			},
			hasSelection: () => Boolean(selectionRef.current),
			isPinned: () => pinnedRef.current,
		}),
		[copySelection, maxScroll, updateScroll, viewportHeight],
	);

	useEffect(
		() =>
			subscribeMouse((event) => {
				if (!metrics.hasMeasured) return;
				const localX = event.x - metrics.left;
				const localY = event.y - metrics.top;
				if (localX < 0 || localX >= metrics.width || localY < 0 || localY >= metrics.height) return;
				if (event.type === 'wheel') {
					updateScroll(scrollTopRef.current + event.deltaY * 3);
					return;
				}
				const bodyTop = stickyHeight + topPadding;
				const bodyY = localY - bodyTop;
				const rawRowIndex = visibleScrollTop + bodyY;
				const dragging = Boolean(selectionRef.current?.dragging && (event.type === 'move' || event.type === 'up'));
				const rowIndex = dragging ? Math.max(0, Math.min(rows.length - 1, rawRowIndex)) : rawRowIndex;
				const row = rows[rowIndex];
				if (!row || (!dragging && bodyY < 0)) return;
				const column = Math.max(0, Math.min(localX, Math.max(0, stringWidth(rowText(row)) - 1)));

				if (event.type === 'down' && event.button === 'left') {
					const recent =
						event.timestamp - lastClick.current.time < 450 &&
						lastClick.current.row === rowIndex &&
						Math.abs(lastClick.current.column - column) <= 1;
					const count = recent ? Math.min(3, lastClick.current.count + 1) : 1;
					lastClick.current = {time: event.timestamp, row: rowIndex, column, count};
					if (count === 3) setSelection(lineSelection(row, rowIndex));
					else if (count === 2) setSelection(wordSelection(row, rowIndex, column));
					else
						setSelection({
							anchor: {row: rowIndex, column},
							focus: {row: rowIndex, column},
							mode: 'character',
							dragging: true,
						});
					return;
				}
				if (event.type === 'move' && selectionRef.current?.dragging) {
					setSelection((current) => (current ? {...current, focus: {row: rowIndex, column}} : current));
					if (localY < bodyTop) updateScroll(scrollTopRef.current - 1);
					if (localY >= metrics.height - 1) updateScroll(scrollTopRef.current + 1);
					return;
				}
				if (event.type === 'up' && selectionRef.current?.dragging) {
					setSelection((current) =>
						current ? {...current, focus: {row: rowIndex, column}, dragging: false} : current,
					);
				}
			}),
		[maxScroll, metrics, rows, stickyHeight, subscribeMouse, topPadding, updateScroll, visibleScrollTop],
	);

	return {
		visibleRows: rows.slice(visibleScrollTop, visibleScrollTop + viewportHeight),
		selection,
		scrollTop: visibleScrollTop,
		stickyRow,
		topPadding,
	};
};
