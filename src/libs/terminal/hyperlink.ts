import supportsHyperlinks from 'supports-hyperlinks';

const ADDITIONAL_TERMINALS = new Set(['Hyper', 'alacritty', 'ghostty', 'iTerm.app', 'iTerm2', 'kitty']);
const ALLOWED_LINK_SCHEMES = new Set(['file', 'http', 'https', 'mailto']);
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

type HyperlinkSupportOptions = {
	env?: Readonly<Record<string, string | undefined>>;
	stdoutSupported?: boolean;
};

export const supportsTerminalHyperlinks = (options: HyperlinkSupportOptions = {}): boolean => {
	if (options.stdoutSupported ?? supportsHyperlinks.stdout) return true;
	const env = options.env ?? process.env;
	if (env.TERM_PROGRAM && ADDITIONAL_TERMINALS.has(env.TERM_PROGRAM)) return true;
	if (env.LC_TERMINAL && ADDITIONAL_TERMINALS.has(env.LC_TERMINAL)) return true;
	return Boolean(env.TERM?.includes('kitty'));
};

export const safeHyperlinkTarget = (href: string): string | undefined => {
	if (!href || CONTROL_CHARACTERS.test(href)) return undefined;
	const scheme = /^([A-Za-z][A-Za-z\d+.-]*):/u.exec(href)?.[1]?.toLowerCase();
	return scheme && ALLOWED_LINK_SCHEMES.has(scheme) ? href : undefined;
};

export const terminalHyperlink = (text: string, href: string, supported = supportsTerminalHyperlinks()): string => {
	const target = safeHyperlinkTarget(href);
	return target && supported ? `\u001B]8;;${target}\u0007${text}\u001B]8;;\u0007` : text;
};
