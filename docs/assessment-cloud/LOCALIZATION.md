# Localization (Uzbek, Russian, English)

Status 2026-10-22: **Assessment Cloud and Exam UI localized; review and remaining surfaces open.** Backlog: `UX-01`. Proctor is paused and not yet localized.

## Design

- `packages/service-i18n` provides the language layer, with no account, API or routing coupling:
  - `I18nProvider`, a typed `useT`, Intl date and number formatting, plural templates (`{count|one:…|few:…|many:…|other:…}`) and `LocaleSwitcher`
  - it uses the mother platform's codes (`en`, `uz`, `ru`) and the same `schood.locale` storage key
  - the initial language comes from `?lang=`, then storage, then the browser, then English
- Catalogs:
  - `packages/assessment-web/src/i18n/{en,uz,ru}.ts` holds shared component text (529 keys)
  - `apps/exam/src/i18n` holds 286 keys
  - `apps/assessment-cloud/src/i18n` holds 1,169 keys
  - `uz` and `ru` are typed `Record<keyof typeof en, string>`, so a missing key fails the build
- English text is unchanged character for character, because browser journeys select by it. The one deliberate change: the accommodations panel's picker is labelled "Sitting to review", so it no longer collides with the registration form's "Sitting".
- Errors: known server codes translate through `error.<code>` keys (`errorText` / `useErrorText`). Shared modules throw `LocalizedError`, whose `.message` stays in English. Unknown server text is shown as sent.
- Uzbek uses the Latin alphabet with ‘ (U+2018) in o‘/g‘ and ’ (U+2019) for the tutuq belgisi. Russian uses the formal register.

## Evidence (local)

- Builds pass for all three apps, and `tsc` enforces catalog coverage.
- `packages/service-i18n/tests/i18n.test.ts` covers locale normalization, placeholders, Russian and Uzbek plural rules, and English fallback for empty or missing text.
- Agent checks found no missing or extra keys, no mismatched placeholders, no empty strings and no ASCII apostrophes in Uzbek. All 953 Playwright selector strings still match.
- The Exam build was rendered in uz and ru, and the language switched live.

## Remaining work

- Native-speaker review of the uz and ru copy. It was machine-assisted; known inconsistencies include "chaqirib olish" vs "qaytarib olish" in Uzbek and "утверждение" vs "одобрение" in Russian.
- Localize the Proctor app when Proctor resumes; localize validation text from `assessment-core`, invitation and other mail, exports and PDFs (certificates are already three-language), and operational states.
- Bundle size: catalogs are bundled for all three languages; the main chunks are now about 770 kB (Exam) and 924 kB (Assessment Cloud). Lazy-load each language.
- Manual screen-reader review in each language (UX-03).
