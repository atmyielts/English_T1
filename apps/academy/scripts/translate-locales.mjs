import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const academyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeRoot = path.join(academyRoot, 'src', 'i18n', 'locales');
const source = JSON.parse(fs.readFileSync(path.join(localeRoot, 'en.json'), 'utf8'));
const sourceEntries = Object.entries(source);
const batchSize = 60;
const maxAttempts = 3;

const localeConfig = {
  uz: {
    language: 'natural professional Uzbek written in Latin script',
    glossary: 'generic academy = akademiya; student = o‘quvchi; classroom = o‘quv guruhi; enrollment = o‘quv guruhiga yozilish; workspace = ish maydoni; education center = ta’lim markazi; guardian = vasiy; attendance = davomat; tuition = o‘qish to‘lovi; charge = hisoblangan to‘lov; payment = to‘lov; account credit = hisob krediti; access grant = kirish huquqi; entitlement = foydalanish huquqi; lead = potensial mijoz; pipeline = savdo jarayoni; revenue = tushum; payroll = ish haqi; retention = o‘quvchini saqlab qolish; intelligence = tahlil',
  },
  ru: {
    language: 'natural professional Russian',
    glossary: 'generic academy = академия; student = учащийся; classroom = учебная группа; enrollment = зачисление; workspace = рабочее пространство; education center = образовательный центр; guardian = законный представитель; attendance = посещаемость; tuition = плата за обучение; charge = начисление; payment = платёж; account credit = кредит счёта; access grant = право доступа; entitlement = право пользования; lead = потенциальный клиент; pipeline = воронка продаж; revenue = выручка; payroll = расчёт заработной платы; retention = удержание учащихся; intelligence = аналитика',
  },
};

const protectedTerms = 'Schood, standalone Academy as the product name, Click, Telegram, IELTS, SAT, TOEFL, iTEP, CRM, KPI, URL, ID, CSV, Excel, API, UZS, SLA, SMS';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join('|');

const runAgy = (prompt) => new Promise((resolve, reject) => {
  const child = spawn('agy.exe', [
    '--model', 'gemini-3.5-flash-low',
    '--effort', 'low',
    '--mode', 'accept-edits',
    '--sandbox',
    '--output-format', 'json',
    '--print-timeout', '4m',
    '-p', prompt,
  ], { cwd: academyRoot, windowsHide: true });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code !== 0) {
      reject(new Error(`agy exited ${code}: ${stderr.trim() || stdout.trim()}`));
      return;
    }
    try {
      const envelope = JSON.parse(stdout.trim());
      resolve(envelope.response);
    } catch (error) {
      reject(new Error(`Invalid agy envelope: ${error.message}`));
    }
  });
});

const parseBatch = (raw, batch, locale) => {
  const jsonText = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const translated = JSON.parse(jsonText);
  if (!Array.isArray(translated) || translated.length !== batch.length) {
    throw new Error(`${locale}: expected ${batch.length} translated rows, received ${Array.isArray(translated) ? translated.length : 'non-array'}`);
  }

  const expectedIds = batch.map((row) => row.id);
  const actualIds = translated.map((row) => row.id);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) throw new Error(`${locale}: IDs or ordering changed`);

  for (let index = 0; index < batch.length; index += 1) {
    const original = batch[index];
    const result = translated[index];
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error(`${locale}: empty translation for ${original.id}`);
    if (placeholders(original.text) !== placeholders(result.text)) throw new Error(`${locale}: placeholders changed for ${original.id}`);
  }

  return translated;
};

const translateBatch = async (locale, batch) => {
  const encodedInput = Buffer.from(JSON.stringify(batch), 'utf8').toString('base64');
  const config = localeConfig[locale];
  const prompt = `Do not use tools and do not read or edit files. Decode the UTF-8 base64 INPUT. Translate only each text field into ${config.language} for an education-academy operations product in Uzbekistan. Return only one valid JSON array, no markdown or explanation. Preserve every numeric id exactly and return exactly ${batch.length} objects in the same order. Only change text. Keep these terms unchanged: ${protectedTerms}. Use this terminology: ${config.glossary}. Prefer concise, unambiguous interface wording over literal translation. Preserve punctuation, numbers, and every placeholder in braces exactly. INPUT_BASE64:${encodedInput}`;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return parseBatch(await runAgy(prompt), batch, locale);
    } catch (error) {
      lastError = error;
      console.warn(`${locale} batch ${batch[0].id}-${batch.at(-1).id}, attempt ${attempt}: ${error.message}`);
    }
  }
  throw lastError;
};

const translateLocale = async (locale) => {
  const localePath = path.join(localeRoot, `${locale}.json`);
  const dictionary = JSON.parse(fs.readFileSync(localePath, 'utf8'));
  const pending = sourceEntries
    .filter(([sourceText]) => !dictionary[sourceText])
    .map(([text], index) => ({ id: index, text }));
  const batches = [];
  for (let start = 0; start < pending.length; start += batchSize) batches.push(pending.slice(start, start + batchSize));

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const translated = await translateBatch(locale, batches[batchIndex]);
    for (const row of translated) dictionary[row.textSource ?? batches[batchIndex].find((sourceRow) => sourceRow.id === row.id).text] = row.text;
    const ordered = Object.fromEntries(sourceEntries.filter(([key]) => dictionary[key]).map(([key]) => [key, dictionary[key]]));
    fs.writeFileSync(localePath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
    console.log(`${locale}: completed batch ${batchIndex + 1}/${batches.length} (${Object.keys(ordered).length}/${sourceEntries.length})`);
  }
};

const requestedLocales = process.argv.slice(2);
const locales = requestedLocales.length ? requestedLocales : ['uz', 'ru'];
for (const locale of locales) {
  if (!localeConfig[locale]) throw new Error(`Unsupported locale: ${locale}`);
}

await Promise.all(locales.map((locale) => translateLocale(locale)));
