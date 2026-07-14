#!/usr/bin/env node
import process from 'node:process';
import {formatCliError, runCli} from './modules/app/index.js';

try {
	await runCli();
} catch (error) {
	process.stderr.write(formatCliError(error));
	process.exitCode = 1;
}
