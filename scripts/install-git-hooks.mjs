import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

if (!existsSync('.git')) process.exit(0);

const configured = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {stdio: 'inherit'});
if (configured.error) throw configured.error;
if (configured.status !== 0) process.exit(configured.status ?? 1);
