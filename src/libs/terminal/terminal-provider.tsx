import {createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode} from 'react';
import {useStdin, useStdout} from 'ink';
import {writeOsc52} from './clipboard.js';
import {DISABLE_MOUSE, ENABLE_MOUSE, SgrMouseDecoder, type MouseEvent} from './mouse-protocol.js';

type MouseListener = (event: MouseEvent) => void;

type TerminalApi = {
	mouseEnabled: boolean;
	subscribeMouse: (listener: MouseListener) => () => void;
	copyText: (text: string) => void;
};

const TerminalContext = createContext<TerminalApi>({
	mouseEnabled: false,
	subscribeMouse: () => () => undefined,
	copyText: () => undefined,
});

export const TerminalProvider = ({children, enableMouse = true}: {children: ReactNode; enableMouse?: boolean}) => {
	const {stdin, isRawModeSupported} = useStdin();
	const {stdout} = useStdout();
	const listeners = useRef(new Set<MouseListener>());
	const mouseEnabled = Boolean(enableMouse && isRawModeSupported && stdout.isTTY);

	const subscribeMouse = useCallback((listener: MouseListener) => {
		listeners.current.add(listener);
		return () => {
			listeners.current.delete(listener);
		};
	}, []);

	const copyText = useCallback(
		(value: string) => {
			writeOsc52(stdout, value);
		},
		[stdout],
	);

	useEffect(() => {
		if (!mouseEnabled) return;
		stdout.write(ENABLE_MOUSE);
		const decoder = new SgrMouseDecoder();
		const handleData = (chunk: Buffer | string) => {
			for (const event of decoder.feed(chunk.toString())) {
				for (const listener of listeners.current) listener(event);
			}
		};
		stdin.on('data', handleData);
		return () => {
			stdin.off('data', handleData);
			decoder.reset();
			stdout.write(DISABLE_MOUSE);
		};
	}, [mouseEnabled, stdin, stdout]);

	const value = useMemo<TerminalApi>(
		() => ({mouseEnabled, subscribeMouse, copyText}),
		[copyText, mouseEnabled, subscribeMouse],
	);

	return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
};

export const useTerminalController = (): TerminalApi => useContext(TerminalContext);
