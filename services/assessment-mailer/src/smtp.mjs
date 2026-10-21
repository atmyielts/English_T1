import nodemailer from "nodemailer";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const email =
  /^[^\s<>@\u0000-\u001f]+@[^\s<>@\u0000-\u001f]+\.[^\s<>@\u0000-\u001f]+$/;
export function smtpConfiguration(value, { testLoopback = false } = {}) {
  const host = String(value.host ?? ""),
    port = Number(value.port),
    from = String(value.from ?? ""),
    local = testLoopback && ["127.0.0.1", "localhost", "::1"].includes(host);
  if (
    !/^[a-zA-Z0-9.:-]{1,253}$/.test(host) || !email.test(from) ||
    from.length > 254 || (!local && ![465, 587].includes(port)) ||
    (local && (!Number.isInteger(port) || port < 1 || port > 65535)) ||
    (!local && (!value.user || !value.password))
  ) throw new Error("Invalid mail transport configuration");
  return {
    host,
    port,
    from,
    user: local ? undefined : String(value.user),
    password: local ? undefined : String(value.password),
    local,
  };
}
export function smtpOutcome(error) {
  if (error?.code === "EAUTH" || error?.code === "ENOAUTH") {
    return { outcome: "failed", code: "smtp_auth" };
  }
  const response = Number(error?.responseCode);
  if (response >= 400 && response < 500) {
    return { outcome: "retry", code: "smtp_temporary" };
  }
  if (response >= 500 && response < 600) {
    return { outcome: "failed", code: "smtp_rejected" };
  }
  // Nodemailer may label a disconnect after DATA as CONN. CONN alone therefore
  // does not prove an unsent message. Only definite pre-DATA failures retry.
  if (
    /^(AUTH(?: .*?)?|EHLO|HELO|STARTTLS|MAIL FROM|RCPT TO)$/.test(
      String(error?.command),
    ) || error?.code === "EDNS" ||
    ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(error?.originalCode) ||
    ["CONNECT_TIMEOUT", "GREETING_TIMEOUT", "UPGRADE_TIMEOUT"].includes(
      error?.timeoutType,
    )
  ) return { outcome: "retry", code: "smtp_connect" };
  return {
    outcome: "uncertain",
    code: error?.code === "MAIL_HANDOFF_TIMEOUT"
      ? "smtp_timeout"
      : "smtp_unknown",
  };
}
export function smtpSender(
  value,
  {
    testLoopback = false,
    timeoutMs = 35000,
    transportFactory = nodemailer.createTransport,
  } = {},
) {
  const config = smtpConfiguration(value, { testLoopback });
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 45000) {
    throw new Error("Invalid SMTP deadline");
  }
  return async (message) => {
    if (
      !message || !uuid.test(message.id) || !email.test(message.to) ||
      message.to.length > 254 || typeof message.subject !== "string" ||
      /[\r\n\u0000]/.test(message.subject) || message.subject.length > 200 ||
      typeof message.text !== "string" || typeof message.html !== "string" ||
      message.text.length > 20000 || message.html.length > 40000
    ) throw new Error("Invalid canonical invitation message");
    const transport = transportFactory({
      host: config.host,
      port: config.port,
      secure: !config.local && config.port === 465,
      requireTLS: !config.local,
      ignoreTLS: config.local,
      ...(config.local
        ? {}
        : { auth: { user: config.user, pass: config.password } }),
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        servername: config.host,
      },
      pool: true,
      maxConnections: 1,
      maxMessages: 1,
      maxRequeues: 0,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error("SMTP deadline exceeded"), {
                code: "MAIL_HANDOFF_TIMEOUT",
              }),
            ),
          timeoutMs,
        );
      });
      const result = await Promise.race([
        transport.sendMail({
          from: { name: "Schood Assessment Cloud", address: config.from },
          to: message.to,
          envelope: { from: config.from, to: [message.to] },
          subject: message.subject,
          text: message.text,
          html: message.html,
          messageId: `<assessment-invitation-${message.id}@${
            config.from.split("@")[1]
          }>`,
          textEncoding: "base64",
          disableFileAccess: true,
          disableUrlAccess: true,
        }),
        timeout,
      ]);
      if (result.accepted?.length !== 1 || result.rejected?.length) {
        return { outcome: "uncertain", code: "smtp_unknown" };
      }
      return { outcome: "accepted", code: "smtp_accepted" };
    } catch (error) {
      return smtpOutcome(error);
    } finally {
      clearTimeout(timer);
      transport.close();
    }
  };
}
