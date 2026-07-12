import {describe, expect, it} from 'vitest';
import {NodePtyRunner} from './pty-runner.js';

describe('NodePtyRunner', () => {
	it('runs a command in a PTY and strips terminal escapes', async () => {
		const runner = new NodePtyRunner();
		const result = await runner.run("printf '\\033[31mhello\\033[0m\\a\\n'");
		expect(result).toMatchObject({exitCode: 0, timedOut: false, output: 'hello'});
		runner.dispose();
	});

	it('returns non-zero exits as command results', async () => {
		const runner = new NodePtyRunner();
		const result = await runner.run("printf 'failed\\n'; exit 7");
		expect(result).toMatchObject({exitCode: 7, output: 'failed'});
		runner.dispose();
	});

	it('times out commands and caps large output', async () => {
		const runner = new NodePtyRunner();
		const timedOut = await runner.run('sleep 2', {timeoutMs: 30});
		expect(timedOut.timedOut).toBe(true);

		const large = await runner.run('node -e "process.stdout.write(\'a\'.repeat(70000))"');
		expect(large.truncated).toBe(true);
		expect(large.output).toContain('output truncated');
		expect(Buffer.byteLength(large.output)).toBeLessThan(66_000);
		runner.dispose();
	});

	it('kills an active PTY when its abort signal fires', async () => {
		const runner = new NodePtyRunner();
		const controller = new AbortController();
		const pending = runner.run('sleep 2', {signal: controller.signal});
		setTimeout(() => controller.abort(new Error('cancelled')), 30);
		await expect(pending).rejects.toThrow('cancelled');
		runner.dispose();
	});

	it('settles active commands and rejects new work after disposal', async () => {
		const runner = new NodePtyRunner();
		const pending = runner.run('sleep 5');
		runner.dispose();
		await expect(pending).resolves.toMatchObject({timedOut: false});
		await expect(runner.run('pwd')).rejects.toThrow('disposed');
	});
});
