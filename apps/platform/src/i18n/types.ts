export const SUPPORTED_LOCALES = ['en', 'uz', 'ru'] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export type TranslationParams = Record<string, string | number>;
