// Catalog contract for IELTS Practice (deno test). Imports the part files
// directly so no React is loaded.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { common } from '../src/i18n/parts/common.ts';
import { shell } from '../src/i18n/parts/shell.ts';
import { today } from '../src/i18n/parts/today.ts';
import { reviews } from '../src/i18n/parts/reviews.ts';
import { generator } from '../src/i18n/parts/generator.ts';
import { speaking } from '../src/i18n/parts/speaking.ts';
import { onboarding } from '../src/i18n/parts/onboarding.ts';
import { dashboard } from '../src/i18n/parts/dashboard.ts';
import { insights } from '../src/i18n/parts/insights.ts';
import { lab } from '../src/i18n/parts/lab.ts';
import { results } from '../src/i18n/parts/results.ts';
import { extras } from '../src/i18n/parts/extras.ts';
import { pages } from '../src/i18n/parts/pages.ts';
import { experience } from '../src/i18n/parts/experience.ts';

type Part = { en: Record<string, string>; uz: Record<string, string>; ru: Record<string, string> };
const parts: Record<string, Part> = { common, shell, today, reviews, generator, speaking, onboarding, dashboard, insights, lab, results, extras, pages, experience };

/** Placeholder names, ignoring plural form bodies: "{count|one:#…}" -> "count". */
const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((match) => match[1]!).sort();

Deno.test('every part has the same keys in en, uz and ru, none empty', () => {
  for (const [name, part] of Object.entries(parts)) {
    const keys = Object.keys(part.en).sort();
    assert(keys.length > 0, `${name} is empty`);
    assertEquals(Object.keys(part.uz).sort(), keys, `${name}: uz keys differ`);
    assertEquals(Object.keys(part.ru).sort(), keys, `${name}: ru keys differ`);
    for (const key of keys) {
      for (const locale of ['en', 'uz', 'ru'] as const) {
        assert(part[locale][key]!.trim().length > 0, `${name}.${locale}.${key} is empty`);
      }
    }
  }
});

Deno.test('keys are unique across parts', () => {
  const seen = new Map<string, string>();
  for (const [name, part] of Object.entries(parts)) {
    for (const key of Object.keys(part.en)) {
      assert(!seen.has(key), `${key} is defined in both ${seen.get(key)} and ${name}`);
      seen.set(key, name);
    }
  }
});

Deno.test('placeholders match the English message', () => {
  for (const [name, part] of Object.entries(parts)) {
    for (const [key, text] of Object.entries(part.en)) {
      const expected = [...new Set(placeholders(text))];
      for (const locale of ['uz', 'ru'] as const) {
        assertEquals([...new Set(placeholders(part[locale][key]!))], expected, `${name}.${locale}.${key}`);
      }
    }
  }
});

Deno.test('Uzbek uses ‘ (U+2018) in o‘ g‘ and ’ (U+2019) for the tutuq belgisi, never an ASCII apostrophe', () => {
  for (const [name, part] of Object.entries(parts)) {
    for (const [key, text] of Object.entries(part.uz)) {
      // English quotes inside messages (e.g. “The chart below shows…”) are allowed;
      // a bare ' or ` or ʻ in Uzbek words is not.
      assert(!/[A-Za-z]['`ʻʼ][A-Za-z]/.test(text.replace(/“[^”]*”/g, '')), `${name}.uz.${key}: ${text}`);
      // o’/g’ is only right before a suffix on a borrowed word (Writing’ni, Playbook’dagi).
      assert(!/[oOgG]’(?!(ni|ga|da|dan|dagi|ning|lar)(?![a-z]))/.test(text), `${name}.uz.${key} uses ’ where o‘/g‘ needs ‘: ${text}`);
    }
  }
});

Deno.test('Russian messages are written in Cyrillic, not left in English', () => {
  const allowedLatin = /^(IELTS|Practice Labs|IELTS Practice|IELTS Simulator|IELTS Playbook|Schood IELTS Practice|IELTS Practice Lab|Task 1|Task 2|True \/ False \/ Not Given|SRS|AI|4|\{[^}]+\}|\{section\} \{band\}|\{count\} \(\{pct\}\))$/;
  for (const [name, part] of Object.entries(parts)) {
    for (const [key, text] of Object.entries(part.ru)) {
      if (allowedLatin.test(text.trim())) continue;
      if (text.replace(/\{[^{}]*\}/g, '').replace(/[\s:·().,/–-]/g, '') === '') continue; // only placeholders
      assert(/[А-Яа-яЁё]/.test(text), `${name}.ru.${key} has no Cyrillic: ${text}`);
    }
  }
});
