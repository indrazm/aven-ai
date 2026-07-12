import {describe, expect, it} from 'vitest';
import {FileStateCache, type FileReadState} from './file-state-cache.js';

const state = (content: string): FileReadState => ({
	content,
	fingerprint: content,
	timestamp: 1,
	totalLines: 1,
	readLines: 1,
});

describe('FileStateCache', () => {
	it('evicts least-recently-used entries by count', () => {
		const cache = new FileStateCache(2, 1_000);
		cache.set('/a', state('a'));
		cache.set('/b', state('b'));
		expect(cache.get('/a')).toBeDefined();
		cache.set('/c', state('c'));

		expect(cache.peek('/a')).toBeDefined();
		expect(cache.peek('/b')).toBeUndefined();
		expect(cache.peek('/c')).toBeDefined();
	});

	it('enforces the byte budget and clears retained state', () => {
		const cache = new FileStateCache(10, 4);
		cache.set('/a', state('1234'));
		cache.set('/b', state('x'));
		expect(cache.peek('/a')).toBeUndefined();
		expect(cache.byteSize).toBe(1);

		cache.set('/large', state('12345'));
		expect(cache.peek('/large')).toBeUndefined();
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.byteSize).toBe(0);
	});
});
