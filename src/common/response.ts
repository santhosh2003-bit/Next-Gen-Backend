/**
 * Standard envelope for all API responses.
 *   { success: true, data, meta? }
 *   { success: false, error: { code, message, details? } }
 */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export function paginated<T>(items: T[], page: number, pageSize: number, total: number) {
  const meta: PageMeta = {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
  return { success: true as const, data: items, meta };
}

export function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, ...(details ? { details } : {}) } };
}

/** Parse & clamp pagination query params. */
export function parsePagination(query: { page?: unknown; pageSize?: unknown }) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
