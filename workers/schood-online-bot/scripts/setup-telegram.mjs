const token = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = (process.env.WORKER_URL || 'https://onlinebot.schood.online').replace(/\/$/, '');
const appUrl = process.env.TELEGRAM_APP_URL || 'https://schood.online/telegram/discover';
const webhookSecret = process.env.WEBHOOK_SECRET;
const mode = process.argv[2] || 'all';

if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const call = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  console.log(method, payload);
  if (!res.ok || payload.ok === false) process.exitCode = 1;
};

const commands = [
  { command: 'start', description: 'Open the Schood ecosystem gateway' },
  { command: 'explore', description: 'Launch the Schood Mini App map' },
  { command: 'exams', description: 'IELTS, SAT, TOEFL, and iTEP routes' },
  { command: 'english', description: 'English Hub and skill practice' },
  { command: 'academy', description: 'Academy OS and classroom tools' },
  { command: 'centers', description: 'Center and partner operations' },
  { command: 'pricing', description: 'Plans, trials, and checkout' },
  { command: 'student', description: 'Open the linked student bot' },
  { command: 'support', description: 'Ask Schood for help' },
  { command: 'help', description: 'Show bot commands' },
];

if (mode === 'all' || mode === 'webhook') {
  if (!webhookSecret) throw new Error('WEBHOOK_SECRET is required for webhook setup');
  await call('setWebhook', {
    url: `${workerUrl}/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
}

if (mode === 'all' || mode === 'menu') {
  await call('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Open Schood', web_app: { url: appUrl } },
  });
}

if (mode === 'all' || mode === 'commands') {
  await call('setMyCommands', { commands });
  await call('setMyName', { name: 'Schood' });
  await call('setMyShortDescription', { short_description: 'Explore the Schood learning ecosystem.' });
  await call('setMyDescription', {
    description:
      'Schood gateway for IELTS, SAT, TOEFL, English, Academy OS, centers, pricing, support, and student bot handoff.',
  });
}
