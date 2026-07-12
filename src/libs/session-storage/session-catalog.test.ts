import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {SessionCatalog, type StoredProjectSession} from './session-catalog.js';

let directory: string;
let catalog: SessionCatalog;

const session = (id: string, projectRoot: string, updatedAt: string): StoredProjectSession => ({
	id,
	projectRoot,
	title: `Session ${id}`,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt,
});

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'aven-sessions-'));
	catalog = new SessionCatalog(join(directory, 'sessions.sqlite'));
});

afterEach(async () => {
	catalog.dispose();
	await rm(directory, {recursive: true, force: true});
});

describe('SessionCatalog', () => {
	it('isolates projects and orders sessions by recent activity', () => {
		catalog.save(session('older', '/project-a', '2026-01-01T01:00:00.000Z'));
		catalog.save(session('newer', '/project-a', '2026-01-01T02:00:00.000Z'));
		catalog.save(session('other', '/project-b', '2026-01-01T03:00:00.000Z'));

		expect(catalog.list('/project-a').map((item) => item.id)).toEqual(['newer', 'older']);
		expect(catalog.list('/project-b').map((item) => item.id)).toEqual(['other']);
	});

	it('updates activity and rejects cross-project selection', () => {
		catalog.save(session('one', '/project-a', '2026-01-01T01:00:00.000Z'));
		expect(catalog.touch('/project-a', 'one', '2026-01-02T00:00:00.000Z')).toMatchObject({
			id: 'one',
			updatedAt: '2026-01-02T00:00:00.000Z',
		});
		expect(() => catalog.touch('/project-b', 'one', '2026-01-03T00:00:00.000Z')).toThrow('current project');
	});

	it('claims legacy history for only the first project checked', () => {
		expect(catalog.claimLegacy('/project-a', true, '2026-01-01T00:00:00.000Z')).toMatchObject({
			id: 'aven-default',
			projectRoot: '/project-a',
			title: 'Legacy session',
		});
		expect(catalog.claimLegacy('/project-b', true)).toBeUndefined();
		expect(catalog.list('/project-b')).toEqual([]);
	});

	it('records a completed migration even when no legacy history exists', () => {
		expect(catalog.claimLegacy('/project-a', false)).toBeUndefined();
		expect(catalog.claimLegacy('/project-b', true)).toBeUndefined();
	});
});
