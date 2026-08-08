import { customAlphabet } from 'nanoid';

const suffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

/** Convert arbitrary text into a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug guaranteed unique by appending a short random suffix. */
export function uniqueSlug(text: string): string {
  const base = slugify(text) || 'item';
  return `${base}-${suffix()}`;
}
