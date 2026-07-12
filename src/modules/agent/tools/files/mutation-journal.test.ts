import {describe, expect, it} from 'vitest';
import {MutationJournal} from './mutation-journal.js';

describe('MutationJournal', () => {
	it('takes entries once and evicts the oldest bounded entry', () => {
		const journal = new MutationJournal();
		const ids = Array.from({length: 101}, (_, index) =>
			journal.record({
				file: `/file-${index}`,
				before: '',
				after: String(index),
			}),
		);
		expect(journal.take(ids[0] ?? '')).toBeUndefined();
		expect(journal.take(ids[100] ?? '')).toMatchObject({file: '/file-100'});
		expect(journal.take(ids[100] ?? '')).toBeUndefined();
		journal.clear();
	});
});
