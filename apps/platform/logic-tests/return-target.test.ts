import { sanitizeReturnTarget } from '../src/lib/returnToPolicy.ts';

const check = (raw: string | null, expected: string, hosts = ['schood.online', 'academy.schood.online']) => {
  const actual = sanitizeReturnTarget(raw, 'https://schood.online', hosts);
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

Deno.test('preserves internal customer destinations, query strings and anchors', () => {
  check('/checkout?plan_id=practice&returnTo=%2Faccount#status', '/checkout?plan_id=practice&returnTo=%2Faccount#status');
  check('/academy/../account', '/account');
  check('/', '/');
});

Deno.test('preserves approved HTTPS services and rejects unapproved origins', () => {
  check('https://academy.schood.online/academy/workspace?view=office#contacts', 'https://academy.schood.online/academy/workspace?view=office#contacts');
  check('https://academy.schood.online.evil.test/', '/account');
  check('https://evil.test/', '/account');
  check('https://academy.schood.online:444/', '/account');
  check('https://ACADEMY.SCHOOD.ONLINE/', 'https://academy.schood.online/');
});

Deno.test('refuses insecure or non-web destinations before authentication handoff', () => {
  for (const target of ['http://academy.schood.online/', 'http://schood.online/', 'ftp://academy.schood.online/', 'javascript:alert(1)', 'data:text/html,test']) check(target, '/account');
});

Deno.test('refuses userinfo, backslash and control-character URL confusion', () => {
  for (const target of ['https://person:password@academy.schood.online/', '/\\evil.test/', '\\evil.test/', '//evil.test/', '/\n/evil.test/', '\thttps://academy.schood.online/', '/account\u0000']) check(target, '/account');
});

Deno.test('uses current host when no allowlist exists and respects suffix boundaries', () => {
  check('https://schood.online/account', 'https://schood.online/account', []);
  check('https://academy.schood.online/', '/account', []);
  check('https://academy.schood.online/', 'https://academy.schood.online/', ['.schood.online']);
  check('https://evilschood.online/', '/account', ['.schood.online']);
  check('https://academy.schood.online/', 'https://academy.schood.online/', ['ACADEMY.SCHOOD.ONLINE']);
});

Deno.test('allows HTTP only for same-origin loopback previews', () => {
  for (const origin of ['http://127.0.0.1:4178', 'http://localhost:4178', 'http://[::1]:4178']) {
    if (sanitizeReturnTarget('/account', origin, []) !== '/account') throw new Error('Internal preview failed');
    if (sanitizeReturnTarget(origin + '/start', origin, []) !== origin + '/start') throw new Error('Absolute preview failed');
    if (sanitizeReturnTarget('http://localhost:9999/', origin, ['localhost:9999']) !== '/account') throw new Error('Different preview origin accepted');
    if (sanitizeReturnTarget('http://academy.schood.online/', origin, ['academy.schood.online']) !== '/account') throw new Error('Remote HTTP accepted');
  }
});

Deno.test('invalid and empty targets safely return to the account', () => {
  for (const target of [null, '', 'invalid', 'https://', '/\r/account']) check(target, '/account');
});
