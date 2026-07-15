import {render, type RenderOptions} from 'ink';
import {realpathSync} from 'node:fs';
import {AnviaAgentRuntime} from '../agent/index.js';
import {keyboardProtocol, TerminalProvider} from '../../libs/terminal/index.js';
import {App} from './components/app.js';
import {loadLexaRuntime} from '../../libs/lexa/index.js';
import {safeErrorMessage} from '../../utils/safe-error.js';

export const formatCliError = (error: unknown): string => `aven: ${safeErrorMessage(error)}\n`;

export const TERMINAL_FRAME_INTERVAL_MS = 16;

export const CLI_RENDER_OPTIONS = {
	alternateScreen: true,
	exitOnCtrlC: false,
	incrementalRendering: true,
	maxFps: 1000 / TERMINAL_FRAME_INTERVAL_MS,
	kittyKeyboard: keyboardProtocol,
} satisfies RenderOptions;

export const runCli = async (): Promise<void> => {
	const projectRoot = realpathSync(process.cwd());
	const lexa = await loadLexaRuntime();
	const instance = render(
		<TerminalProvider>
			<App runtime={new AnviaAgentRuntime({projectRoot, lexa})} />
		</TerminalProvider>,
		CLI_RENDER_OPTIONS,
	);

	const shutdown = () => instance.unmount();
	process.once('SIGTERM', shutdown);

	try {
		await instance.waitUntilExit();
	} finally {
		process.off('SIGTERM', shutdown);
	}
};
