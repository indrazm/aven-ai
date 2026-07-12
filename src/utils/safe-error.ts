export const safeErrorMessage = (error: unknown): string => {
	const message = error instanceof Error ? error.message : String(error);
	if (/401|unauthori[sz]ed|api key|authentication/iu.test(message)) {
		return 'Provider authentication failed. Run /setup to replace the API key.';
	}
	if (/429|rate.?limit/iu.test(message)) return 'Provider rate limit reached. Try again later.';
	return message.replace(/sk-[A-Za-z0-9_-]+/gu, '[redacted]').slice(0, 500);
};
