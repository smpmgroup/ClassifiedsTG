import { describe, expect, it } from 'vitest';
import { assertListingTransition, expiresAt, publicationAccess } from './index.js';

describe('listing state machine', () => {
  it('allows required transitions', () => expect(() => assertListingTransition('draft', 'pending')).not.toThrow());
  it('rejects bypassing moderation', () => expect(() => assertListingTransition('draft', 'published')).toThrow(/not allowed/));
});

describe('expiration', () => {
  it('uses whole UTC days', () => expect(expiresAt(3, new Date('2026-07-17T00:00:00Z')).toISOString()).toBe('2026-07-20T00:00:00.000Z'));
});

describe('publication access', () => {
  it('is free for active members and moderators', () => { expect(publicationAccess('member',10,10,false)).toBe('free'); expect(publicationAccess('moderator',0,10,false)).toBe('free'); });
  it('requires and recognizes Stars payment below threshold', () => { expect(publicationAccess('member',9,10,false)).toBe('payment_required'); expect(publicationAccess('member',0,10,true)).toBe('paid'); });
});
