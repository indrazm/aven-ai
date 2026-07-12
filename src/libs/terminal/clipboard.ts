import type {WriteStream} from 'node:tty';

export const writeOsc52 = (stdout: Pick<WriteStream, 'write'>, value: string): boolean => {
	if (!value) return false;
	const encoded = Buffer.from(value, 'utf8').toString('base64');
	stdout.write(`\u001B]52;c;${encoded}\u0007`);
	return true;
};
