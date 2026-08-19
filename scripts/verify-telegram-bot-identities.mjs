const contracts = [
  {
    label: "public",
    token: process.env.TELEGRAM_PUBLIC_BOT_TOKEN,
    expectedUsername: "schoodonlinebot",
  },
  {
    label: "student",
    token: process.env.TELEGRAM_BOT_TOKEN,
    expectedUsername: "schoodstudentbot",
  },
  {
    label: "academy",
    token: process.env.ACADEMY_TELEGRAM_BOT_TOKEN,
    expectedUsername: "schoodacademybot",
  },
];

const missing = contracts.filter((contract) => !contract.token).map((contract) => contract.label);
if (missing.length) {
  throw new Error(`Missing Telegram token environment variables for: ${missing.join(", ")}`);
}

const identities = [];
for (const contract of contracts) {
  const response = await fetch(`https://api.telegram.org/bot${contract.token}/getMe`, {
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true || !payload.result) {
    throw new Error(`${contract.label} bot getMe failed with HTTP ${response.status}`);
  }
  const username = String(payload.result.username ?? "").toLowerCase();
  if (username !== contract.expectedUsername) {
    throw new Error(`${contract.label} token resolves to @${username || "unknown"}; expected @${contract.expectedUsername}`);
  }
  identities.push({ label: contract.label, id: String(payload.result.id), username });
}

if (new Set(identities.map((identity) => identity.id)).size !== identities.length) {
  throw new Error("Telegram token variables must resolve to three distinct bots");
}

for (const identity of identities) {
  console.log(`${identity.label}: @${identity.username} (${identity.id})`);
}
