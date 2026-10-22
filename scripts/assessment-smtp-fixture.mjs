import { createServer } from "node:net";
/** Loopback-only SMTP sink. It accepts no credentials and never relays mail. */
export async function smtpFixture({ mode = "accept" } = {}) {
  const messages = [], sockets = new Set();
  let behavior = mode;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let buffer = "", dataMode = false, message = { from: "", to: "", raw: "" };
    socket.write("220 localhost synthetic SMTP fixture\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (dataMode) {
          if (line !== ".") {
            message.raw += (line.startsWith("..") ? line.slice(1) : line) +
              "\r\n";
            continue;
          }
          dataMode = false;
          messages.push({ ...message });
          if (behavior === "uncertain") {
            socket.destroy();
            return;
          }
          if (behavior === "stall") continue;
          socket.write("250 2.0.0 fixture accepted\r\n");
          continue;
        }
        if (/^EHLO /i.test(line)) {
          socket.write("250-localhost\r\n250 8BITMIME\r\n");
        } else if (/^HELO /i.test(line)) socket.write("250 localhost\r\n");
        else if (/^MAIL FROM:/i.test(line)) {
          message = { from: line, to: "", raw: "" };
          socket.write("250 2.1.0 sender accepted\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          message.to = line;
          socket.write(
            behavior === "temporary"
              ? "451 4.2.0 fixture temporary failure\r\n"
              : behavior === "reject"
              ? "550 5.1.1 fixture unknown recipient\r\n"
              : "250 2.1.5 recipient accepted\r\n",
          );
        } else if (/^DATA$/i.test(line)) {
          dataMode = true;
          socket.write("354 end with dot\r\n");
        } else if (/^QUIT$/i.test(line)) socket.end("221 bye\r\n");
        else if (/^RSET$|^NOOP$/i.test(line)) socket.write("250 ok\r\n");
        else socket.write("502 unsupported fixture command\r\n");
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    port: server.address().port,
    messages,
    setMode(value) {
      behavior = value;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
export function smtpFixtureText(raw) {
  const match =
    /Content-Type: text\/plain[^]*?Content-Transfer-Encoding: (base64|quoted-printable|7bit|8bit)\r\n\r\n([^]*?)\r\n--/i
      .exec(raw);
  if (!match) {
    throw new Error("Expected the known Nodemailer fixture text MIME part");
  }
  if (match[1].toLowerCase() === "base64") {
    return Buffer.from(match[2].replace(/\s/g, ""), "base64").toString("utf8");
  }
  if (match[1].toLowerCase() === "quoted-printable") {
    return Buffer.from(
      match[2].replace(/=\r\n/g, "").replace(
        /=([a-f0-9]{2})/gi,
        (_value, hex) => String.fromCharCode(parseInt(hex, 16)),
      ),
      "binary",
    ).toString("utf8");
  }
  return match[2];
}
