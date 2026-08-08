import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ok } from '../../common/response.js';
import { fail } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { verifyWebhookSignature } from './razorpay.client.js';
import { paymentService } from './payment.service.js';
import { refundSchema, verifyPaymentSchema } from './payment.schema.js';

export default async function paymentRoutes(app: FastifyInstance) {
  /**
   * Capture the raw JSON body (needed for webhook HMAC verification) while
   * still exposing the parsed object. Scoped to this plugin only.
   */
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Client-side verify (after Razorpay Checkout success handler).
  app.post('/verify', { onRequest: [app.authenticate] }, async (req) => {
    const input = validate(verifyPaymentSchema, req.body);
    return ok(await paymentService.verify(req.authUser!.id, input));
  });

  // Razorpay server-to-server webhook. No auth; verified by signature.
  app.post('/webhook', async (req, reply) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? '';
    if (!signature || !verifyWebhookSignature(raw, signature)) {
      return reply.status(400).send(fail('INVALID_SIGNATURE', 'Webhook signature invalid'));
    }
    const body = req.body as { event: string; payload: Record<string, unknown> } & Record<string, unknown>;
    const eventId =
      (req.headers['x-razorpay-event-id'] as string) ||
      `${body.event}:${JSON.stringify(body.payload).length}`;
    const result = await paymentService.handleWebhook(eventId, body.event, body, signature);
    return reply.status(200).send(ok(result));
  });

  // Admin-triggered refund.
  app.post(
    '/orders/:orderId/refund',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('payment:refund')] },
    async (req) => {
      const input = validate(refundSchema, req.body ?? {});
      const { orderId } = req.params as { orderId: string };
      return ok(await paymentService.refund(orderId, input.amount, input.reason));
    },
  );
}
