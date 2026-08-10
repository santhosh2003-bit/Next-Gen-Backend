import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { UploadApiResponse } from 'cloudinary';
import { ok } from '../../common/response.js';
import { BadRequestError } from '../../common/errors.js';
import { recordAudit } from '../../common/audit.js';
import { env } from '../../config/env.js';
import { cloudinary, deleteFromCloudinary } from '../../common/cloudinary.js';

/** Accepted image MIME types. */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Media uploads. Admin-gated (product:write). Streams files straight to
 * Cloudinary (no local disk — Render's disk is ephemeral) and returns the
 * permanent CDN url plus the Cloudinary public_id. Callers must persist BOTH:
 * the url to render, and the public_id so the image can later be deleted or
 * replaced in Cloudinary.
 */
export default async function uploadsRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  const write = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('product:write')] };

  app.post('/', write, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError('No file uploaded — expected a multipart field named "file".');

    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestError('Unsupported image type. Use JPEG, PNG, WebP or GIF.');
    }

    // Pipe the incoming multipart stream directly into Cloudinary.
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'nextgen/products', resource_type: 'image' },
        (error, res) => {
          if (error || !res) reject(error ?? new Error('Cloudinary upload failed'));
          else resolve(res);
        },
      );
      file.file.on('error', reject);
      file.file.pipe(stream);
    });

    // @fastify/multipart flags truncation instead of throwing when the stream
    // is drained; a truncated write means the file exceeded the size limit.
    // Remove the partial upload from Cloudinary and reject.
    if (file.file.truncated) {
      await deleteFromCloudinary(result.public_id);
      throw new BadRequestError(`Image exceeds the ${env.MAX_UPLOAD_MB}MB size limit.`);
    }

    await recordAudit({
      userId: req.authUser!.id,
      action: 'media.upload',
      entity: 'media',
      entityId: result.public_id,
      metadata: { mimetype: file.mimetype },
      ipAddress: req.ip,
    });

    return reply.status(201).send(ok({ url: result.secure_url, publicId: result.public_id }));
  });
}
