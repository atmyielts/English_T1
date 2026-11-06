// The small SMTP API this adapter uses. The runtime library is the repository's
// existing Nodemailer version, bundled for Deno rather than a local npm install.
export function createTransport(options: {
  host: string; tls: { servername: string }; port: number; secure: boolean;
  auth: { user: string; pass: string }; disableFileAccess: boolean; disableUrlAccess: boolean;
}): { sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown> };
