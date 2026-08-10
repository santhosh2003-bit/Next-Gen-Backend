/**
 * Shared helper for bulk-create endpoints. Runs each item through the given
 * single-item creator, capturing per-item success/failure so one bad row never
 * aborts the whole batch. Reuses the exact single-create logic (slug, images,
 * validation) — the /bulk routes are a thin wrapper, not a parallel code path.
 */
export interface BulkItemResult {
  index: number;
  ok: boolean;
  id?: string;
  error?: string;
}

export interface BulkResult {
  created: number;
  failed: number;
  results: BulkItemResult[];
}

export async function runBulk<T>(
  items: T[],
  create: (item: T) => Promise<{ id: string }>,
): Promise<BulkResult> {
  const results: BulkItemResult[] = [];
  let created = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    try {
      const row = await create(items[i]);
      results.push({ index: i, ok: true, id: row.id });
      created++;
    } catch (err) {
      results.push({ index: i, ok: false, error: err instanceof Error ? err.message : 'Failed' });
      failed++;
    }
  }
  return { created, failed, results };
}
