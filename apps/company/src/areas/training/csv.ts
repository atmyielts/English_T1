// CSV for HR's exports, built in the browser. A cell a spreadsheet would run as a
// formula is made plain text first.
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: unknown[][]): string {
  // The byte order mark tells Excel this is UTF-8, so Russian and Uzbek names stay readable.
  return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
