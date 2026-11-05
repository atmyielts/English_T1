// One-time Telegram setup of a coach bot, after the owner creates it in BotFather and
// the worker is deployed. For each pack it prints, and with --apply makes, these Bot
// API calls:
//   setWebhook          https://coach-bots.schood.online/tg/<pack>, the secret token, and
//                       only the updates the coaches use (message, callback_query, poll_answer);
//   setMyCommands       the pack's commands, in English (default), Uzbek and Russian;
//   setMyName / setMyDescription / setMyShortDescription   from the pack manifest;
//   setChatMenuButton   a Mini App button opening https://ai.schood.online/coach/<pack>.
//
// Dry run (default, no network):
//   deno run --no-lock --allow-read --allow-env workers/schood-coach-bots/scripts/setup-webhooks.ts ielts
// Apply (changes the live bot; the owner or the coordinator runs it, never CI):
//   COACH_BOT_TOKEN_IELTS=… COACH_WEBHOOK_SECRET_IELTS=… deno run --no-lock --allow-read --allow-env --allow-net \
//     workers/schood-coach-bots/scripts/setup-webhooks.ts ielts --apply
// Tokens and secrets are read from the environment and never printed.
import { pick, type CoachPack, type Locale } from '../../../packages/coach-packs/src/mod.ts';
import { loadPacks } from '../../../packages/coach-packs/src/registry.ts';
import { envKey } from '../src/worker.ts';

const WORKER = 'https://coach-bots.schood.online';
const APP = 'https://ai.schood.online';
const LANGUAGES: (Locale | null)[] = [null, 'uz', 'ru'];

export interface BotCall { method: string; body: Record<string, unknown> }

/** The Bot API calls that set one coach bot up. Pure: no token, no network. */
export function setupCalls(pack: CoachPack, webhookSecret: string, options: { worker?: string; app?: string } = {}): BotCall[] {
  const worker = options.worker ?? WORKER, app = options.app ?? APP;
  const id = pack.manifest.id;
  const calls: BotCall[] = [{
    method: 'setWebhook',
    body: { url: `${worker}/tg/${id}`, secret_token: webhookSecret, allowed_updates: ['message', 'callback_query', 'poll_answer'], drop_pending_updates: false, max_connections: 20 },
  }];
  for (const language of LANGUAGES) {
    const locale: Locale = language ?? 'en';
    const scope = language ? { language_code: language } : {};
    calls.push({ method: 'setMyCommands', body: { commands: pack.manifest.commands.map((command) => ({ command: command.command, description: pick(command.description, locale).slice(0, 256) })), ...scope } });
    calls.push({ method: 'setMyName', body: { name: pick(pack.manifest.name, locale).slice(0, 64), ...scope } });
    calls.push({ method: 'setMyDescription', body: { description: pick(pack.manifest.description, locale).slice(0, 512), ...scope } });
    calls.push({ method: 'setMyShortDescription', body: { short_description: pick(pack.manifest.tagline, locale).slice(0, 120), ...scope } });
  }
  calls.push({ method: 'setChatMenuButton', body: { menu_button: { type: 'web_app', text: pick(pack.manifest.name, 'en').slice(0, 64), web_app: { url: `${app}/coach/${id}` } } } });
  return calls;
}

if (import.meta.main) {
  const apply = Deno.args.includes('--apply');
  const wanted = Deno.args.filter((arg) => !arg.startsWith('--'));
  const packs = loadPacks();
  if (!wanted.length) { console.error(`Name a pack: ${[...packs.keys()].join(', ')}`); Deno.exit(2); }
  for (const id of wanted) {
    const pack = packs.get(id);
    if (!pack) { console.error(`Unknown pack ${id}.`); Deno.exit(2); }
    const key = envKey(id);
    const token = Deno.env.get(`COACH_BOT_TOKEN_${key}`) ?? '';
    const secret = Deno.env.get(`COACH_WEBHOOK_SECRET_${key}`) ?? '';
    if (apply && (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token) || secret.length < 16 || !/^[A-Za-z0-9_-]{16,256}$/.test(secret))) {
      console.error(`Set COACH_BOT_TOKEN_${key} (from BotFather) and COACH_WEBHOOK_SECRET_${key} (16+ of A-Z a-z 0-9 _ -) first.`);
      Deno.exit(2);
    }
    for (const call of setupCalls(pack, apply ? secret : '<COACH_WEBHOOK_SECRET>')) {
      const shown = JSON.stringify({ ...call.body, ...('secret_token' in call.body ? { secret_token: '<hidden>' } : {}) });
      if (!apply) { console.log(`[dry run] ${id}: ${call.method} ${shown}`); continue; }
      const response = await fetch(`https://api.telegram.org/bot${token}/${call.method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call.body) });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; description?: string };
      console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${id}: ${call.method}${result.ok ? '' : ` (${result.description ?? response.status})`}`);
      if (!result.ok) Deno.exit(1);
    }
  }
  if (!apply) console.log('Dry run only. Add --apply to make these calls (this changes the live bot).');
}
