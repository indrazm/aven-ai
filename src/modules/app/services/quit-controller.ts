import {useCallback, useEffect, useRef} from 'react';
import {useApp} from 'ink';
import {useAppStoreApi} from '../components/app-provider.js';

const EXIT_WINDOW = 900;

export const useQuitController = (): ((key: 'c' | 'd') => void) => {
	const {exit} = useApp();
	const store = useAppStoreApi();
	const lastPress = useRef({key: '', time: 0});
	const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (hintTimer.current) clearTimeout(hintTimer.current);
		},
		[],
	);

	return useCallback(
		(key: 'c' | 'd') => {
			const now = Date.now();
			if (lastPress.current.key === key && now - lastPress.current.time < EXIT_WINDOW) {
				exit();
				return;
			}
			lastPress.current = {key, time: now};
			store.getState().setExitHint(true);
			if (hintTimer.current) clearTimeout(hintTimer.current);
			hintTimer.current = setTimeout(() => store.getState().setExitHint(false), EXIT_WINDOW + 50);
		},
		[exit, store],
	);
};
