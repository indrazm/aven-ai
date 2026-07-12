import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
		clearMocks: true,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,tsx}'],
			exclude: ['src/**/*.test.{ts,tsx}'],
			reporter: ['text', 'html', 'lcov'],
			thresholds: {
				lines: 80,
				statements: 80,
				functions: 80,
				branches: 70,
			},
		},
	},
});
