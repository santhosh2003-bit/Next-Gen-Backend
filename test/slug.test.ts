import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from '../src/common/slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips punctuation', () => {
    expect(slugify('Acme® Cookware, Set!')).toBe('acme-cookware-set');
  });
  it('collapses whitespace and underscores', () => {
    expect(slugify('a   b_c')).toBe('a-b-c');
  });
});

describe('uniqueSlug', () => {
  it('appends a random suffix', () => {
    const s = uniqueSlug('Wireless Headphones');
    expect(s).toMatch(/^wireless-headphones-[a-z0-9]{6}$/);
  });
  it('produces distinct slugs for the same input', () => {
    expect(uniqueSlug('Same Name')).not.toBe(uniqueSlug('Same Name'));
  });
});
