export const providerIds = [
	'openai',
	'openrouter',
	'deepseek',
	'fireworks-ai',
	'github-models',
	'huggingface',
	'devscale-ai',
	'databricks',
	'anthropic',
	'opencode-go',
	'xiaomi-mimo',
	'minimax',
] as const;

export type ProviderId = (typeof providerIds)[number];

export type ProviderDescriptor = {
	id: ProviderId;
	label: string;
	baseUrl?: {
		label: string;
		placeholder: string;
		required: true;
	};
};

export const providerCatalog: Record<ProviderId, ProviderDescriptor> = {
	openai: {id: 'openai', label: 'OpenAI'},
	openrouter: {id: 'openrouter', label: 'OpenRouter'},
	deepseek: {id: 'deepseek', label: 'DeepSeek'},
	'fireworks-ai': {id: 'fireworks-ai', label: 'Fireworks AI'},
	'github-models': {id: 'github-models', label: 'GitHub Models'},
	huggingface: {id: 'huggingface', label: 'Hugging Face'},
	'devscale-ai': {id: 'devscale-ai', label: 'Devscale AI'},
	databricks: {
		id: 'databricks',
		label: 'Databricks',
		baseUrl: {
			label: 'Workspace URL',
			placeholder: 'https://dbc-12345678.cloud.databricks.com',
			required: true,
		},
	},
	anthropic: {id: 'anthropic', label: 'Anthropic'},
	'opencode-go': {id: 'opencode-go', label: 'OpenCode Go'},
	'xiaomi-mimo': {id: 'xiaomi-mimo', label: 'Xiaomi Mimo Singapore'},
	minimax: {id: 'minimax', label: 'MiniMax'},
};

export const isProviderId = (value: string): value is ProviderId => providerIds.some((provider) => provider === value);

const databricksDefaultPath = '/ai-gateway/mlflow/v1';

export const normalizeDatabricksBaseUrl = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) throw new Error('Databricks workspace URL is required.');
	const url = new URL(/^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`);
	if (!url.hostname) throw new Error('Databricks workspace URL is invalid.');
	if (!url.pathname || url.pathname === '/') url.pathname = databricksDefaultPath;
	url.hash = '';
	url.search = '';
	return url.toString().replace(/\/$/u, '');
};

export const normalizeProviderBaseUrl = (provider: ProviderId, value: string): string => {
	if (provider === 'databricks') return normalizeDatabricksBaseUrl(value);
	return value.trim();
};
