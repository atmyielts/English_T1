import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';

// Browsers often lack Uzbek month names and print "2026 M11 23"; spell them out instead.
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/** A calendar day (YYYY-MM-DD) in the reader's language: "23 noyabr 2026", or without the year. */
export function useDay() {
  const { locale, date } = useI18n();
  return (value: string, withYear = true) => {
    const [year, month, day] = value.split('-').map(Number);
    if (locale === 'uz') return `${day} ${UZ_MONTHS[month - 1]}${withYear ? ` ${year}` : ''}`;
    return date(`${value}T00:00:00`, withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' });
  };
}
