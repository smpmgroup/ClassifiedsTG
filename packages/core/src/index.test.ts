import { describe, expect, it } from 'vitest';
import { assertListingTransition, expiresAt } from './index.js';

describe('listing state machine', () => {
  it('allows required transitions', () => expect(() => assertListingTransition('draft', 'pending')).not.toThrow());
  it('rejects bypassing moderation', () => expect(() => assertListingTransition('draft', 'published')).toThrow(/not allowed/));
});

describe('expiration', () => {
  it('uses whole UTC days', () => expect(expiresAt(3, new Date('2026-07-17T00:00:00Z')).toISOString()).toBe('2026-07-20T00:00:00.000Z'));
});
