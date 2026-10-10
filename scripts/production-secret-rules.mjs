const rules = [
  ['Supabase service role literal', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ['Supabase publishable literal', /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/],
  ['OpenRouter key literal', /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/],
  ['OpenAI key literal', /\bsk-[A-Za-z0-9]{20,}\b/],
  ['AWS access key id literal', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

// Return labels only; credential values must never reach CI output.
export function secretLabels(content) {
  const labels = rules.filter(([, pattern]) => pattern.test(content)).map(([label]) => label);
  for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (payload?.role === 'service_role') labels.push('Supabase legacy service role JWT');
    } catch { /* Non-JWT text is not a credential finding. */ }
  }
  return [...new Set(labels)];
}
