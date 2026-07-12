export const providerIds = ['openai', 'anthropic'] as const;

export type ProviderId = (typeof providerIds)[number];

export type ProviderDescriptor = {
	id: ProviderId;
	label: string;
	model: string;
};

export const providerCatalog: Record<ProviderId, ProviderDescriptor> = {
	openai: {
		id: 'openai',
		label: 'OpenAI',
		model: 'gpt-5',
	},
	anthropic: {
		id: 'anthropic',
		label: 'Anthropic',
		model: 'claude-sonnet-4-20250514',
	},
};

export const isProviderId = (value: string): value is ProviderId => providerIds.some((provider) => provider === value);
