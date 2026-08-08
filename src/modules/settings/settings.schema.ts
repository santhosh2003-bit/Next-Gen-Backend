import { z } from 'zod';

/** Nested address block for the organisation profile. */
export const addressSchema = z.object({
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(120).optional(),
});

export const socialSchema = z.object({
  website: z.string().max(300).optional(),
  facebook: z.string().max(300).optional(),
  instagram: z.string().max(300).optional(),
});

/**
 * The admin-editable site/organisation profile. Every field is optional so the
 * admin can patch any subset; the service merges over the seeded defaults.
 */
export const siteSettingsSchema = z.object({
  appName: z.string().min(1).max(120).optional(),
  tagline: z.string().max(200).optional(),
  about: z.string().max(4000).optional(),
  ownerName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  supportPhone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  hours: z.string().max(200).optional(),
  gst: z.string().max(40).optional(),
  establishedYear: z.string().max(10).optional(),
  address: addressSchema.optional(),
  social: socialSchema.optional(),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
