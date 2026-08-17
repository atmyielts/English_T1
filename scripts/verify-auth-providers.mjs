const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !anonKey) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or their non-VITE aliases).');
  process.exit(2);
}

const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey } });
if (!response.ok) {
  console.error(`Supabase Auth settings request failed (${response.status}).`);
  process.exit(2);
}

const settings = await response.json();
const external = settings.external && typeof settings.external === 'object' ? settings.external : {};
const custom = Array.isArray(settings.custom_providers) ? settings.custom_providers : [];
const google = external.google ?? settings.external_google ?? false;
const telegramEntry = custom.find((provider) => provider?.identifier === 'custom:telegram');
const telegram = external['custom:telegram'] ?? external.telegram ?? Boolean(telegramEntry && telegramEntry.enabled !== false);

const result = {
  google_enabled: google === true,
  telegram_enabled: telegram === true,
};

console.log(JSON.stringify(result, null, 2));
if (!result.google_enabled || !result.telegram_enabled) process.exitCode = 1;
