import type {RowTone} from '../../libs/terminal/index.js';

export type {RowTone} from '../../libs/terminal/index.js';

type MessageBase = {
	id: string;
	timestamp?: string;
};

export type UserMessage = MessageBase & {
	kind: 'user';
	variant: 'prompt' | 'command' | 'bash' | 'image' | 'plan' | 'memory' | 'team' | 'attachment';
	content: string;
	meta?: string;
};

export type AssistantMessage = MessageBase & {
	kind: 'assistant';
	variant: 'text' | 'thinking' | 'redacted' | 'advisor';
	content: string;
};

export type ToolMessage = MessageBase & {
	kind: 'tool';
	name: string;
	status: 'queued' | 'running' | 'waitingPermission' | 'success' | 'error' | 'rejected' | 'cancelled';
	summary: string;
	detail?: string;
	group?: 'read' | 'search' | 'bash' | 'edit' | 'agent';
};

export type SystemMessage = MessageBase & {
	kind: 'system';
	level: 'info' | 'warning' | 'error' | 'success';
	variant?: 'compact' | 'rateLimit' | 'task' | 'shutdown' | 'planApproval';
	content: string;
};

export type DiffMessage = MessageBase & {
	kind: 'diff';
	file: string;
	before: string;
	after: string;
};

export type UiMessage = UserMessage | AssistantMessage | ToolMessage | SystemMessage | DiffMessage;

export type TextPoint = {row: number; column: number};

export type SelectionState = {
	anchor: TextPoint;
	focus: TextPoint;
	mode: 'character' | 'word' | 'line';
	dragging: boolean;
};

export type RowSegment = {
	text: string;
	tone?: RowTone;
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
	selectable?: boolean;
	link?: string;
};

export type TranscriptRow = {
	id: string;
	messageId: string;
	messageKind: UiMessage['kind'];
	segments: RowSegment[];
	background?: 'user' | 'code' | 'selected';
	softWrap?: boolean;
};

export type TranscriptHandle = {
	scrollBy: (amount: number) => void;
	pageBy: (direction: -1 | 1) => void;
	scrollToTop: () => void;
	scrollToBottom: () => void;
	copySelection: () => boolean;
	clearSelection: () => boolean;
	hasSelection: () => boolean;
	isPinned: () => boolean;
};
