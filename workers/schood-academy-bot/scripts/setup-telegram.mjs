const token = process.env.ACADEMY_TELEGRAM_BOT_TOKEN;
const workerUrl = (process.env.WORKER_URL || 'https://academy-bot.schood.online').replace(/\/$/, '');
const appUrl = process.env.TELEGRAM_APP_URL || 'https://academy.schood.online/telegram';
const webhookSecret = process.env.ACADEMY_TELEGRAM_WEBHOOK_SECRET;
const botName = (process.env.ACADEMY_TELEGRAM_BOT_NAME || 'schoodacademybot').replace(/^@/, '');
const mode = process.argv[2] || 'all';

if (!token) throw new Error('ACADEMY_TELEGRAM_BOT_TOKEN is required');

const call = async (method, body) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  console.log(method, { ok: payload.ok === true, description: payload.description || null });
  if (!response.ok || payload.ok === false) process.exitCode = 1;
  return payload;
};

const commands = [
  { command: 'today', description: "Open today's Academy work" },
  { command: 'announce', description: 'Write a scoped announcement' },
  { command: 'homework', description: 'Create homework and reminders' },
  { command: 'attendance', description: 'Take attendance' },
  { command: 'requests', description: 'Open learner and guardian requests' },
  { command: 'groups', description: 'Manage connected Academy groups' },
  { command: 'settings', description: 'Open notification settings' },
  { command: 'help', description: 'Show Academy bot commands' },
];

const identity = await call('getMe', {});
if (String(identity.result?.username || '').toLowerCase() !== botName.toLowerCase()) {
  throw new Error('Academy Telegram token does not match the configured bot username');
}

if (mode === 'all' || mode === 'webhook') {
  if (!webhookSecret) throw new Error('ACADEMY_TELEGRAM_WEBHOOK_SECRET is required for webhook setup');
  await call('setWebhook', {
    url: `${workerUrl}/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    drop_pending_updates: false,
  });
}
if (mode === 'all' || mode === 'menu') {
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open Academy', web_app: { url: appUrl } } });
}
if (mode === 'all' || mode === 'commands') {
  await call('setMyCommands', { commands });
  await call('setMyName', { name: 'Schood Academy' });
  await call('setMyShortDescription', { short_description: 'Daily Academy work, messages, homework, and attendance.' });
  await call('setMyDescription', { description: 'A role-scoped assistant for Schood Academy staff. It posts approved updates and keeps personal student information private.' });
}
