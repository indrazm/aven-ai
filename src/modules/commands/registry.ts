export type CommandRoute =
	'connect' | 'setupProvider' | 'model' | 'help' | 'commands' | 'sessions' | 'search' | 'theme';

export type CommandDefinition = {
	label: string;
	description: string;
	route?: CommandRoute;
	action?: 'newSession' | 'resumeLastSession';
};

export const commandItems: readonly CommandDefinition[] = [
	{label: '/connect', description: 'Connect a configured provider', route: 'connect'},
	{label: '/setup', description: 'Set up and verify an API key', route: 'setupProvider'},
	{label: '/model', description: 'Show the active provider and model', route: 'model'},
	{label: '/help', description: 'Show keyboard and interaction help', route: 'help'},
	{label: '/commands', description: 'Browse available commands', route: 'commands'},
	{label: '/resume', description: 'Search and resume project sessions', route: 'sessions'},
	{label: '/resume-last', description: 'Resume the most recent project session', action: 'resumeLastSession'},
	{label: '/new', description: 'Start a new project session', action: 'newSession'},
	{label: '/search', description: 'Search the visible transcript', route: 'search'},
	{label: '/theme', description: 'Preview theme tokens', route: 'theme'},
];

export const routeForCommand = (value: string): CommandRoute | undefined =>
	commandItems.find((item) => item.label === value)?.route;

export const actionForCommand = (value: string): CommandDefinition['action'] =>
	commandItems.find((item) => item.label === value)?.action;
