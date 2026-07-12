import type {Message} from '@anvia/core';
import type {SqliteMemoryStore} from '@anvia/memory-sqlite';
import {randomUUID} from 'node:crypto';
import {NEW_SESSION_TITLE, sessionTitleFromActivity, type ProjectSessionSummary} from '../types.js';
import {SessionCatalog} from '../../../libs/session-storage/index.js';

type SessionActivity = {content: string; mode: 'prompt' | 'bash'};

const LEGACY_SESSION_ID = 'aven-default';

export type ProjectSessionSelection = {
	session: ProjectSessionSummary;
	messages: Message[];
};

export class ProjectSessionManager {
	readonly projectRoot: string;
	readonly #catalog: SessionCatalog;
	readonly #memory: SqliteMemoryStore;
	#active: ProjectSessionSummary;
	#initialized = false;

	constructor(projectRoot: string, catalog: SessionCatalog, memory: SqliteMemoryStore) {
		this.projectRoot = projectRoot;
		this.#catalog = catalog;
		this.#memory = memory;
		this.#active = this.#createNew();
	}

	active(): ProjectSessionSummary {
		return {...this.#active};
	}

	async initialize(): Promise<void> {
		if (this.#initialized) return;
		const legacy = await this.#memory.load({sessionId: LEGACY_SESSION_ID});
		this.#catalog.claimLegacy(this.projectRoot, legacy.length > 0);
		this.#initialized = true;
	}

	async list(): Promise<ProjectSessionSummary[]> {
		await this.initialize();
		const stored = this.#catalog
			.list(this.projectRoot)
			.filter((session) => session.id !== this.#active.id)
			.map((session) => ({...session, active: false, persisted: true}));
		return [{...this.#active, active: true}, ...stored];
	}

	startNew(): ProjectSessionSummary {
		this.#active = this.#createNew();
		return this.active();
	}

	async select(sessionId: string): Promise<ProjectSessionSelection> {
		if (sessionId === this.#active.id) {
			return {session: this.active(), messages: await this.loadMessages()};
		}
		const stored = this.#catalog.get(this.projectRoot, sessionId);
		if (!stored) throw new Error('Session does not belong to the current project.');
		const messages = await this.#memory.load({sessionId});
		const touched = this.#catalog.touch(this.projectRoot, sessionId, new Date().toISOString());
		this.#active = {...touched, active: true, persisted: true};
		return {session: this.active(), messages};
	}

	beginActivity(request: SessionActivity): void {
		if (this.#active.title !== NEW_SESSION_TITLE) return;
		this.#active = {
			...this.#active,
			title: sessionTitleFromActivity(request.content, request.mode),
			updatedAt: new Date().toISOString(),
		};
	}

	commit(): ProjectSessionSummary {
		const updatedAt = new Date().toISOString();
		this.#catalog.save({
			id: this.#active.id,
			projectRoot: this.#active.projectRoot,
			title: this.#active.title,
			createdAt: this.#active.createdAt,
			updatedAt,
		});
		this.#active = {...this.#active, updatedAt, persisted: true};
		return this.active();
	}

	loadMessages(): Promise<Message[]> {
		return this.#memory.load({sessionId: this.#active.id});
	}

	dispose(): void {
		this.#catalog.dispose();
	}

	#createNew(): ProjectSessionSummary {
		const now = new Date().toISOString();
		return {
			id: randomUUID(),
			projectRoot: this.projectRoot,
			title: NEW_SESSION_TITLE,
			createdAt: now,
			updatedAt: now,
			active: true,
			persisted: false,
		};
	}
}
