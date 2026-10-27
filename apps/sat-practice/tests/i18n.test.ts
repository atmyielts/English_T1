import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { format } from '../../../packages/service-i18n/src/format.ts';
import { en } from '../src/i18n/en.ts';
import { ru } from '../src/i18n/ru.ts';
import { uz } from '../src/i18n/uz.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map(m => m[1]).sort();

Deno.test('Uzbek and Russian catalogs are complete, non-empty and keep every placeholder', () => {
  for (const [name, catalog] of [['uz', uz], ['ru', ru]] as const) {
    assertEquals(Object.keys(catalog).sort(), Object.keys(en).sort(), name);
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      assert(catalog[key].trim(), `${name}:${key} is empty`);
      assertEquals(placeholders(catalog[key]), placeholders(en[key]), `${name}:${key} placeholders`);
    }
  }
});

Deno.test('Uzbek uses the proper o‘/g‘ (U+2018) and tutuq belgisi (U+2019), never ASCII apostrophes', () => {
  for (const [key, text] of Object.entries(uz)) {
    assert(!/[oOgG]['`ʻ]/.test(text), `${key}: use ‘ (U+2018) after o/g`);
    assert(!/'/.test(text), `${key}: ASCII apostrophe`);
  }
});

Deno.test('Plural forms render in every language', () => {
  const catalogs = { en, uz, ru };
  assertEquals(format(catalogs, 'ru', 'reviews.due', { count: 1 }), 'Сейчас пора повторить 1 вопрос.');
  assertEquals(format(catalogs, 'ru', 'reviews.due', { count: 3 }), 'Сейчас пора повторить 3 вопроса.');
  assertEquals(format(catalogs, 'ru', 'reviews.due', { count: 5 }), 'Сейчас пора повторить 5 вопросов.');
  assertEquals(format(catalogs, 'en', 'reviews.due', { count: 1 }), '1 question is due now.');
  assert(format(catalogs, 'uz', 'lab.confirmSubmit', { count: 2 }).startsWith('2 ta savolga'));
});
