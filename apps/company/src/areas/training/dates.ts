// A plain function, apart from the pages, so supabase/functions/company/training.test.ts can check it.

/** Calendar day in Tashkent (UTC+5, no daylight saving), the day the server's date rules use. */
export const tashkentDate = (at: Date): string => new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
