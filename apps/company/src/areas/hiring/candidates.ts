// Reading a pasted list or a CSV file of candidates in the browser, and remembering personal
// links here: the server stores only their hash, so it can show each link once.

export interface ParsedRow { line: number; name: string; email: string; phone: string }
export interface ParsedList { rows: ParsedRow[]; ignored: number[] }

const EMAIL = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']{2,}/;
const PHONE = /^\+?[\d\s()./-]{7,}$/;
const HEADER = /^(name|full ?name|имя|фио|ism|f\.?i\.?o\.?|candidate|кандидат|nomzod|email|e-mail|почта|phone|телефон|telefon)$/i;

/** One CSV or pasted line into cells. Quotes keep a comma inside a cell; a doubled quote is a quote. */
function cells(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { out.push(current.trim()); current = ''; }
    else current += char;
  }
  out.push(current.trim());
  return out;
}

const delimiterOf = (line: string) => line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';

/**
 * Accepts a spreadsheet paste, a CSV, or plain lines such as "Aziza Karimova aziza@mail.uz
 * +998 90 123 45 67". Columns are recognised by what is in them, so their order does not
 * matter. A line with neither an email nor a phone is reported as ignored, not guessed at.
 */
export function parseCandidates(input: string): ParsedList {
  const rows: ParsedRow[] = [], ignored: number[] = [];
  input.replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const parts = cells(line, delimiterOf(line)).filter(Boolean);
    if (parts.length && parts.every((part) => HEADER.test(part))) return;
    let email = '', phone = '';
    const names: string[] = [];
    for (const part of parts) {
      const found = part.match(EMAIL)?.[0];
      if (found && !email) {
        email = found.toLowerCase();
        const rest = part.replace(found, '').replace(/[<>()]/g, ' ').trim();
        if (rest) {
          const phoneInRest = rest.match(/\+?\d[\d\s()./-]{6,}\d/)?.[0];
          if (phoneInRest && !phone) phone = phoneInRest.trim();
          const nameInRest = (phoneInRest ? rest.replace(phoneInRest, '') : rest).trim();
          if (nameInRest) names.push(nameInRest);
        }
      } else if (PHONE.test(part) && !phone) phone = part;
      else {
        const phoneInPart = part.match(/\+?\d[\d\s()./-]{6,}\d/)?.[0];
        if (phoneInPart && !phone) {
          phone = phoneInPart.trim();
          const rest = part.replace(phoneInPart, '').trim();
          if (rest) names.push(rest);
        } else names.push(part);
      }
    }
    const name = names.join(' ').replace(/\s+/g, ' ').trim();
    if (!email && !phone) ignored.push(index + 1);
    else rows.push({ line: index + 1, name, email, phone });
  });
  return { rows, ignored };
}

const inviteKey = (id: string) => `company-hiring-invite:${id}`;
export function rememberInvite(id: string, link: string) {
  try { localStorage.setItem(inviteKey(id), link); } catch { /* shown once */ }
}
export function recallInvite(id: string): string | null {
  try { return localStorage.getItem(inviteKey(id)); } catch { return null; }
}
export const telegramShare = (link: string | null, text: string) => `https://t.me/share/url?url=${encodeURIComponent(link ?? '')}&text=${encodeURIComponent(text)}`;
export const mailTo = (email: string | null, subject: string, text: string) => `mailto:${encodeURIComponent(email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
