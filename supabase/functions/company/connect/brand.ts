// White label: the name, colour and logo a workspace shows on its candidate page and
// certificates. brandOf and publicBrand are what the hiring pages read.
import { check, CompanyError, UUID, type Db, type Route } from '../types.ts';
import { obj, text } from '../util.ts';
import { cleanLogo } from './logo.ts';
import { HR, rateLimit } from './shared.ts';

export interface Brand { name: string; color: string | null; logo: string | null }
interface BrandRow { org_id: string; display_name: string | null; brand_color: string | null; logo_data_url: string | null }
const BRAND_COLUMNS = 'org_id,display_name,brand_color,logo_data_url';

const channel = (value: number) => {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const number = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((number >> 16) & 255) + 0.7152 * channel((number >> 8) & 255) + 0.0722 * channel(number & 255);
};
/** WCAG contrast of a colour with white, which is how buttons and headers use it. */
export const contrastWithWhite = (hex: string): number => Math.round((1.05 / (luminance(hex) + 0.05)) * 100) / 100;
export const MIN_CONTRAST = 4.5;

/** The same colour, darkened just enough to read on white. */
export function readableColor(hex: string): string {
  let value = hex;
  for (let step = 0; step < 100 && contrastWithWhite(value) < MIN_CONTRAST; step++) {
    const number = Number.parseInt(value.slice(1), 16);
    const darker = [(number >> 16) & 255, (number >> 8) & 255, number & 255].map((part) => Math.floor(part * 0.96));
    value = `#${darker.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  }
  return value;
}

export function readColor(value: unknown): string | null {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new CompanyError('invalid_field', 'Use a colour like #1e3a8a.', 400, { field: 'brand_color' });
  const color = value.toLowerCase();
  const contrast = contrastWithWhite(color);
  if (contrast < MIN_CONTRAST) throw new CompanyError('brand_low_contrast', 'White text would be hard to read on this colour.', 400, { field: 'brand_color', contrast: String(contrast), suggestion: readableColor(color) });
  return color;
}

/** A workspace's branding with its company name as the fallback, or null when it has none set. */
export async function brandOf(db: Db, orgId: string): Promise<Brand | null> {
  const row = check<BrandRow | null>(await db.from('company_brand').select(BRAND_COLUMNS).eq('org_id', orgId).maybeSingle());
  if (!row || (!row.display_name && !row.brand_color && !row.logo_data_url)) return null;
  const org = check<{ name: string } | null>(await db.from('company_orgs').select('name').eq('id', orgId).maybeSingle());
  return { name: row.display_name ?? org?.name ?? '', color: row.brand_color, logo: row.logo_data_url };
}

/** What a candidate page or certificate may show: nothing for a workspace that is closed. */
export async function publicBrand(db: Db, orgId: string): Promise<Brand | null> {
  if (!UUID.test(orgId)) return null;
  const org = check<{ status: string } | null>(await db.from('company_orgs').select('status').eq('id', orgId).maybeSingle());
  if (!org || org.status === 'closed') return null;
  return await brandOf(db, orgId);
}

export const brandRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/brand', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      const row = check<BrandRow | null>(await ctx.db.from('company_brand').select(BRAND_COLUMNS).eq('org_id', ctx.org!.id).maybeSingle());
      return { brand: { display_name: row?.display_name ?? null, brand_color: row?.brand_color ?? null, logo: row?.logo_data_url ?? null }, company_name: ctx.org!.name, public_path: `public/brand/${ctx.org!.id}` };
    },
  },
  {
    // { display_name?, brand_color?, logo? (data URL, or null to remove) }
    method: 'PUT', path: 'orgs/:org/connect/brand', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const patch: Record<string, unknown> = { org_id: ctx.org!.id, updated_by: ctx.user };
      if ('display_name' in input) patch.display_name = text(input.display_name, 'display_name', { min: 2, max: 120, optional: true });
      if ('brand_color' in input) patch.brand_color = readColor(input.brand_color);
      if ('logo' in input) patch.logo_data_url = input.logo === null || input.logo === '' ? null : cleanLogo(input.logo);
      const saved = check<BrandRow>(await ctx.db.from('company_brand').upsert(patch, { onConflict: 'org_id' }).select(BRAND_COLUMNS).single());
      await ctx.audit('brand.updated', ctx.org!.id, { display_name: saved.display_name, brand_color: saved.brand_color, logo: Boolean(saved.logo_data_url) });
      return { brand: { display_name: saved.display_name, brand_color: saved.brand_color, logo: saved.logo_data_url } };
    },
  },
  {
    method: 'GET', path: 'public/brand/:org', access: 'public',
    async handle(ctx, params) {
      await rateLimit(ctx.db, `brand:${ctx.ipHash}`, 120);
      return { brand: await publicBrand(ctx.db, params.org) };
    },
  },
];
