import type { FastifyInstance } from 'fastify';
import { ok, paginated } from '../../common/response.js';
import { searchService } from './search.service.js';

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const { q = '', categoryId } = req.query as { q?: string; categoryId?: string };
    const { items, page, pageSize, total } = await searchService.search(q, { ...(req.query as object), categoryId });
    return paginated(items, page, pageSize, total);
  });

  app.get('/suggest', async (req) => {
    const { q = '' } = req.query as { q?: string };
    return ok(await searchService.suggest(q));
  });

  app.get('/related/:productId', async (req) => {
    const { productId } = req.params as { productId: string };
    return ok(await searchService.related(productId));
  });

  app.get('/trending', async () => ok(await searchService.trending()));

  // Personalized when authenticated; falls back to trending for guests.
  app.get('/recommendations', async (req) => {
    let userId: string | undefined;
    try {
      const payload = await req.jwtVerify<{ sub: string }>();
      userId = payload.sub;
    } catch {
      userId = undefined;
    }
    return ok(await searchService.recommendations(userId));
  });
}
