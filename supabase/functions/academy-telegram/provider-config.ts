export type TelegramApiCall = (method: string, body: Record<string, unknown>) => Promise<Record<string, any>>;

export const academyTelegramCommands = [
  { command: "today", description: "Open today's Academy work" },
  { command: "announce", description: "Write a scoped announcement" },
  { command: "homework", description: "Create homework and reminders" },
  { command: "attendance", description: "Take attendance" },
  { command: "requests", description: "Open learner and guardian requests" },
  { command: "groups", description: "Manage connected Academy groups" },
  { command: "settings", description: "Open notification settings" },
  { command: "help", description: "Show Academy bot commands" },
];

export const configureAcademyTelegramProvider = async ({
  call,
  botName,
  siteUrl,
  workerUrl,
  webhookSecret,
}: {
  call: TelegramApiCall;
  botName: string;
  siteUrl: string;
  workerUrl: string;
  webhookSecret: string;
}): Promise<void> => {
  const identity = await call("getMe", {});
  if (String(identity.result?.username ?? "").trim().toLowerCase() !== botName.replace(/^@/, "").toLowerCase()) {
    throw new Error("Academy Telegram token does not match the configured bot username");
  }
  if (identity.result?.can_read_all_group_messages === true) {
    throw new Error("Academy Telegram group privacy mode must be enabled in BotFather");
  }
  await call("setWebhook", {
    url: `${workerUrl.replace(/\/$/, "")}/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: false,
  });
  await call("setChatMenuButton", { menu_button: { type: "web_app", text: "Open Academy", web_app: { url: `${siteUrl.replace(/\/$/, "")}/telegram` } } });
  await call("setMyCommands", { commands: academyTelegramCommands });
  await call("setMyName", { name: "Schood Academy" });
  await call("setMyShortDescription", { short_description: "Daily Academy work, messages, homework, and attendance." });
  await call("setMyDescription", { description: "A role-scoped assistant for Schood Academy staff. It posts approved updates and keeps personal student information private." });
};
