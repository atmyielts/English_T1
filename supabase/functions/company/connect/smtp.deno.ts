// Pinned to the already-used SMTP library. An explicit Deno bundle keeps the
// isolated Edge typecheck independent of a Node workspace install.
// @deno-types="./smtp-types.d.ts"
export { createTransport } from 'https://esm.sh/nodemailer@10.2.1?target=denonext';
