// Uzbek dates by hand: many browsers ship no Uzbek calendar data and print
// "2026 M10 4" for uz. Shown in Tashkent time (UTC+5, no daylight saving).
export const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export function uzDate(value: string | number | Date, withTime = false): string {
  const local = new Date(new Date(value).getTime() + 5 * 3_600_000);
  const day = `${local.getUTCDate()}-${UZ_MONTHS[local.getUTCMonth()]}, ${local.getUTCFullYear()}`;
  return withTime ? `${day}, ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}` : day;
}
