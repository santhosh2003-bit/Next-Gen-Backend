import { prisma } from '../../common/prisma.js';
import type { SiteSettings } from './settings.schema.js';

const SITE_KEY = 'site';

/**
 * Seeded organisation defaults (real Good And Green Agro Farms details).
 * Contact fields left blank are filled in by the admin from the app — we never
 * fabricate a phone/email the business hasn't published.
 */
const DEFAULT_SITE: Required<Omit<SiteSettings, 'address' | 'social'>> & {
  address: NonNullable<SiteSettings['address']>;
  social: NonNullable<SiteSettings['social']>;
} = {
  appName: 'Good And Green Agro Farms',
  tagline: 'Seeds, fodder & farm essentials',
  about:
    'Established in 2024 in Telangana, Good And Green Agro Farms is a trusted trader and retailer of grass seed, animal grass, fodder and related agricultural products, serving farming communities with transparent pricing and dependable order fulfilment.',
  ownerName: 'Mahesh',
  phone: '+91 83281 37495',
  supportPhone: '+91 83281 37495',
  whatsapp: '918328137495',
  email: '',
  hours: 'Mon–Sat, 9:00 AM – 7:00 PM',
  gst: '',
  establishedYear: '2024',
  address: {
    line1: 'Door No 16, HMT Officers Colony',
    line2: 'Alwal Hills Road, Alwal',
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500010',
    country: 'India',
  },
  social: { website: '', facebook: '', instagram: '' },
};

export const settingsService = {
  /** Merge stored overrides over the seeded defaults. */
  async getSite(): Promise<typeof DEFAULT_SITE> {
    const row = await prisma.setting.findUnique({ where: { key: SITE_KEY } });
    const stored = (row?.value as Partial<SiteSettings> | undefined) ?? {};
    return {
      ...DEFAULT_SITE,
      ...stored,
      address: { ...DEFAULT_SITE.address, ...(stored.address ?? {}) },
      social: { ...DEFAULT_SITE.social, ...(stored.social ?? {}) },
    };
  },

  /** Deep-merge the patch into current settings and persist. */
  async updateSite(patch: SiteSettings) {
    const current = await this.getSite();
    const next = {
      ...current,
      ...patch,
      address: { ...current.address, ...(patch.address ?? {}) },
      social: { ...current.social, ...(patch.social ?? {}) },
    };
    await prisma.setting.upsert({
      where: { key: SITE_KEY },
      create: { key: SITE_KEY, value: next },
      update: { value: next },
    });
    return next;
  },
};
