import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { ok } from '../../common/response.js';
import { BadRequestError } from '../../common/errors.js';
import { recordAudit } from '../../common/audit.js';
import { env, UPLOAD_ROOT } from '../../config/env.js';

/** Accepted image MIME types → file extension. */
const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

/**
 * Media uploads. Admin-gated (product:write). Stores files on the server's
 * local disk under UPLOAD_ROOT; they are served statically at /uploads by
 * the app. Returns an absolute URL derived from the requesting host so it is
 * reachable by whoever uploaded it (LAN device today, public domain in prod).
 */
export default async function uploadsRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  const write = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('product:write')] };

  app.post('/', write, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError('No file uploaded — expected a multipart field named "file".');

    const ext = ALLOWED_TYPES.get(file.mimetype);
    if (!ext) throw new BadRequestError('Unsupported image type. Use JPEG, PNG, WebP or GIF.');

    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const dest = path.join(UPLOAD_ROOT, filename);
    await mkdir(UPLOAD_ROOT, { recursive: true });

    try {
      await pipeline(file.file, createWriteStream(dest));
    } catch (err) {
      await unlink(dest).catch(() => {});
      throw err;
    }

    // @fastify/multipart flags truncation instead of throwing when the stream
    // is drained; treat a truncated write as an over-limit rejection.
    if (file.file.truncated) {
      await unlink(dest).catch(() => {});
      throw new BadRequestError(`Image exceeds the ${env.MAX_UPLOAD_MB}MB size limit.`);
    }

    const host = req.headers.host ?? req.hostname;
    const url = `${req.protocol}://${host}/uploads/${filename}`;
    await recordAudit({
      userId: req.authUser!.id,
      action: 'media.upload',
      entity: 'media',
      entityId: filename,
      metadata: { mimetype: file.mimetype },
      ipAddress: req.ip,
    });
    return reply.status(201).send(ok({ url, filename }));
  });
}
