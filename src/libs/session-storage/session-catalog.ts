import {chmodSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {singleLineLabel} from '../../utils/text.js';

const LEGACY_SESSION_ID = 'aven-default';
const LEGACY_MIGRATION_KEY = 'legacy_session_checked';

type SessionRow = {
	id: string;
	project_root: string;
	title: string;
	created_at: string;
	updated_at: string;
};

const schema = `
CREATE TABLE IF NOT EXISTS aven_projects (
  project_root TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aven_sessions (
  id TEXT PRIMARY KEY,
  project_root TEXT NOT NULL REFERENCES aven_projects(project_root) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS aven_sessions_project_updated_idx
  ON aven_sessions(project_root, updated_at DESC);

CREATE TABLE IF NOT EXISTS aven_session_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export type StoredProjectSession = {
	id: string;
	projectRoot: string;
	title: string;
	createdAt: string;
	updatedAt: string;
};

const fromRow = (row: SessionRow): StoredProjectSession => ({
	id: row.id,
	projectRoot: row.project_root,
	title: singleLineLabel(row.title) || 'New session',
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export class SessionCatalog {
	readonly path: string;
	#database: DatabaseSync | undefined;

	constructor(path: string) {
		this.path = path;
	}

	list(projectRoot: string): StoredProjectSession[] {
		const rows = this.#db()
			.prepare(
				`
			SELECT id, project_root, title, created_at, updated_at
			FROM aven_sessions
			WHERE project_root = ?
			ORDER BY updated_at DESC, created_at DESC
		`,
			)
			.all(projectRoot) as SessionRow[];
		return rows.map(fromRow);
	}

	get(projectRoot: string, sessionId: string): StoredProjectSession | undefined {
		const row = this.#db()
			.prepare(
				`
			SELECT id, project_root, title, created_at, updated_at
			FROM aven_sessions
			WHERE project_root = ? AND id = ?
		`,
			)
			.get(projectRoot, sessionId) as SessionRow | undefined;
		return row ? fromRow(row) : undefined;
	}

	save(session: StoredProjectSession): void {
		const db = this.#db();
		db.exec('BEGIN IMMEDIATE');
		try {
			const existing = db.prepare('SELECT project_root FROM aven_sessions WHERE id = ?').get(session.id) as
				{project_root: string} | undefined;
			if (existing && existing.project_root !== session.projectRoot) {
				throw new Error('Session ID already belongs to another project.');
			}
			this.#upsertProject(db, session.projectRoot, session.createdAt, session.updatedAt);
			db.prepare(
				`
				INSERT INTO aven_sessions (id, project_root, title, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
				  title = excluded.title,
				  updated_at = excluded.updated_at
			`,
			).run(session.id, session.projectRoot, session.title, session.createdAt, session.updatedAt);
			db.exec('COMMIT');
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	}

	touch(projectRoot: string, sessionId: string, updatedAt: string): StoredProjectSession {
		const db = this.#db();
		db.exec('BEGIN IMMEDIATE');
		try {
			const result = db
				.prepare(
					`
				UPDATE aven_sessions SET updated_at = ?
				WHERE project_root = ? AND id = ?
			`,
				)
				.run(updatedAt, projectRoot, sessionId);
			if (result.changes !== 1) throw new Error('Session does not belong to the current project.');
			db.prepare('UPDATE aven_projects SET updated_at = ? WHERE project_root = ?').run(updatedAt, projectRoot);
			const row = db
				.prepare(
					`
				SELECT id, project_root, title, created_at, updated_at
				FROM aven_sessions WHERE project_root = ? AND id = ?
			`,
				)
				.get(projectRoot, sessionId) as SessionRow | undefined;
			if (!row) throw new Error('Session disappeared while it was being selected.');
			db.exec('COMMIT');
			return fromRow(row);
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	}

	claimLegacy(
		projectRoot: string,
		hasLegacyHistory: boolean,
		now = new Date().toISOString(),
	): StoredProjectSession | undefined {
		const db = this.#db();
		db.exec('BEGIN IMMEDIATE');
		try {
			const checked = db.prepare('SELECT value FROM aven_session_metadata WHERE key = ?').get(LEGACY_MIGRATION_KEY);
			if (checked) {
				db.exec('COMMIT');
				return undefined;
			}
			db.prepare('INSERT INTO aven_session_metadata (key, value) VALUES (?, ?)').run(LEGACY_MIGRATION_KEY, projectRoot);
			if (!hasLegacyHistory) {
				db.exec('COMMIT');
				return undefined;
			}
			this.#upsertProject(db, projectRoot, now, now);
			db.prepare(
				`
				INSERT OR IGNORE INTO aven_sessions (id, project_root, title, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?)
			`,
			).run(LEGACY_SESSION_ID, projectRoot, 'Legacy session', now, now);
			const row = db
				.prepare(
					`
				SELECT id, project_root, title, created_at, updated_at
				FROM aven_sessions WHERE project_root = ? AND id = ?
			`,
				)
				.get(projectRoot, LEGACY_SESSION_ID) as SessionRow | undefined;
			db.exec('COMMIT');
			return row ? fromRow(row) : undefined;
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	}

	dispose(): void {
		this.#database?.close();
		this.#database = undefined;
	}

	#db(): DatabaseSync {
		if (this.#database) return this.#database;
		mkdirSync(dirname(this.path), {recursive: true, mode: 0o700});
		chmodSync(dirname(this.path), 0o700);
		const database = new DatabaseSync(this.path);
		try {
			database.exec('PRAGMA foreign_keys = ON');
			database.exec('PRAGMA journal_mode = WAL');
			database.exec(schema);
			chmodSync(this.path, 0o600);
			this.#database = database;
			return database;
		} catch (error) {
			database.close();
			throw error;
		}
	}

	#upsertProject(db: DatabaseSync, projectRoot: string, createdAt: string, updatedAt: string): void {
		db.prepare(
			`
			INSERT INTO aven_projects (project_root, created_at, updated_at)
			VALUES (?, ?, ?)
			ON CONFLICT(project_root) DO UPDATE SET updated_at = excluded.updated_at
		`,
		).run(projectRoot, createdAt, updatedAt);
	}
}
