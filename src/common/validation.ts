import type { ZodTypeAny, output } from 'zod';
import { BadRequestError } from './errors.js';

/**
 * Parse unknown input against a Zod schema, converting failures into a
 * structured 400 with field-level details. Returns the schema's OUTPUT type
 * (so `.default()` / transforms are reflected as required).
 */
export function validate<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestError('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}
