import { bool, optionalText, optionalUuid, record, stringList } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { randomToken } from './crypto.ts';
import { loadTest } from './placement.ts';
import { asRecord, requireCentre } from './shared.ts';
import type { SettingsRow } from './store.ts';

// C14 white label and embed: the assistant's name and colours (core branding),
// an avatar and widget texts, and the website widgets (admissions chat, placement
// test) served from ai.schood.online/embed/widget.js. The widget calls the public
// centre routes from the centre's own site; the function answers only Origins on
// the centre's list of allowed domains.

const ORIGIN = /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?$/;
const LANGS = ['uz', 'ru', 'en'] as const;

export function embedView(settings: SettingsRow, appUrl: string, publicUrl: string | null = null) {
  const api = publicUrl ? ` data-api="${publicUrl}"` : '';
  const widgets = asRecord(settings.widgets), white = asRecord(settings.white_label);
  return {
    public_key: settings.public_key, embed_domains: settings.embed_domains,
    widgets: { admissions_chat: widgets.admissions_chat === true, placement: widgets.placement === true, placement_page_id: typeof widgets.placement_page_id === 'string' ? widgets.placement_page_id : null, greeting: asRecord(widgets.greeting), position: widgets.position === 'left' ? 'left' : 'right' },
    white_label: { avatar_url: typeof white.avatar_url === 'string' ? white.avatar_url : null, launcher_label: asRecord(white.launcher_label) },
    snippet: `<script src="${appUrl}/embed/widget.js" data-centre="${settings.public_key}" async></script>`,
    placement_snippet: `<div data-schood-placement></div>\n<script src="${appUrl}/embed/widget.js" data-centre="${settings.public_key}" data-widget="placement" async></script>`,
  };
}

export const embed = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const access = await ctx.access('C14');
    return { embed: embedView(centre.settings, centre.deps.config.appUrl, centre.deps.config.publicUrl), allowed: access.allowed };
  },
  /** { embed_domains?, widgets?, white_label?, rotate_key? } */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const ws = centre.access.workspace;
    const patch: Partial<SettingsRow> = { updated_by: ctx.user.id };
    if (body.embed_domains !== undefined) {
      const domains = stringList(body.embed_domains, 'embed_domains', { max: 10, pattern: /^https:\/\/[^\s/]+$/ }).map((origin) => origin.toLowerCase().replace(/\/+$/, ''));
      if (domains.some((origin) => !ORIGIN.test(origin) || /schood\.online$/.test(origin))) throw new SchoodAIError('invalid_request', 'Domains are https origins of the centre’s own site, like https://registan.uz.', 400, { field: 'embed_domains' });
      patch.embed_domains = domains;
    }
    if (body.widgets !== undefined) {
      const row = record(body.widgets, 'widgets'), current = asRecord(centre.settings.widgets);
      const turningOn = row.admissions_chat === true || row.placement === true;
      if (turningOn) await ctx.requireFeature('C14');
      const placementId = row.placement_page_id === undefined ? current.placement_page_id ?? null : optionalUuid(row.placement_page_id, 'widgets.placement_page_id');
      if (placementId) await loadTest(ctx.repo, ws.id, String(placementId), { approvedOnly: true });
      const greeting = row.greeting === undefined ? asRecord(current.greeting) : Object.fromEntries(LANGS.map((lang) => [lang, optionalText(record(row.greeting, 'widgets.greeting')[lang], `widgets.greeting.${lang}`, { max: 300 })]).filter(([, value]) => value));
      patch.widgets = {
        admissions_chat: row.admissions_chat === undefined ? current.admissions_chat === true : bool(row.admissions_chat, 'widgets.admissions_chat'),
        placement: row.placement === undefined ? current.placement === true : bool(row.placement, 'widgets.placement'),
        placement_page_id: placementId, greeting, position: row.position === 'left' ? 'left' : row.position === 'right' ? 'right' : current.position ?? 'right',
      };
    }
    if (body.white_label !== undefined) {
      const row = record(body.white_label, 'white_label');
      const avatar = optionalText(row.avatar_url, 'white_label.avatar_url', { max: 500 });
      if (avatar && !/^https:\/\/[^\s"'<>]{1,500}$/.test(avatar)) throw new SchoodAIError('invalid_request', 'The avatar must be an https address.', 400, { field: 'white_label.avatar_url' });
      const label = row.launcher_label === undefined ? {} : Object.fromEntries(LANGS.map((lang) => [lang, optionalText(record(row.launcher_label, 'white_label.launcher_label')[lang], `white_label.launcher_label.${lang}`, { max: 40 })]).filter(([, value]) => value));
      patch.white_label = { avatar_url: avatar, launcher_label: label };
    }
    if (body.rotate_key === true) patch.public_key = randomToken(18);
    const [row] = await centre.deps.store.table('settings').update({ workspace_id: ws.id }, patch);
    await ctx.audit('centre.embed_updated', { fields: Object.keys(patch).filter((key) => key !== 'updated_by') }, { type: 'workspace', id: ws.id });
    return { embed: embedView(row, centre.deps.config.appUrl, centre.deps.config.publicUrl) };
  },
};
