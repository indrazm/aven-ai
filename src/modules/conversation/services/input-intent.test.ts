import {describe, expect, it} from 'vitest';
import {transcriptInputIntent} from './input-intent.js';

describe('transcript input intents', () => {
	it('maps navigation keys without performing terminal effects', () => {
		expect(transcriptInputIntent('k', {})).toEqual({type: 'scroll', amount: -1});
		expect(transcriptInputIntent('j', {})).toEqual({type: 'scroll', amount: 1});
		expect(transcriptInputIntent('', {upArrow: true})).toEqual({type: 'scroll', amount: -1});
		expect(transcriptInputIntent('', {downArrow: true})).toEqual({type: 'scroll', amount: 1});
		expect(transcriptInputIntent('', {pageUp: true})).toEqual({type: 'page', direction: -1});
		expect(transcriptInputIntent('', {pageDown: true})).toEqual({type: 'page', direction: 1});
		expect(transcriptInputIntent('g', {})).toEqual({type: 'start'});
		expect(transcriptInputIntent('G', {})).toEqual({type: 'end'});
		expect(transcriptInputIntent('q', {})).toEqual({type: 'close'});
		expect(transcriptInputIntent('', {escape: true})).toEqual({type: 'close'});
		expect(transcriptInputIntent('o', {ctrl: true})).toEqual({type: 'close'});
		expect(transcriptInputIntent('x', {})).toEqual({type: 'handled'});
	});
});
