export const singleLineLabel = (value: string): string =>
	value
		.replace(/[\u0000-\u001F\u007F]/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
