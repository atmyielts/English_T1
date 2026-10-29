// CSV import of people: parsing (comma, semicolon or tab; quoted fields; Excel's
// BOM) and per-row checks. Headers may be English, Russian or Uzbek; without a
// recognisable header the columns are name, email, department, job role, role.
import { JOB_ROLES, type JobRole } from '../../../../packages/company-core/src/mod.ts';
import { EMAIL } from '../util.ts';

export const MAX_IMPORT_ROWS = 500;

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.split('\n', 1)[0] ?? '';
  const count = (char: string) => firstLine.split(char).length - 1;
  const delimiter = [';', '\t', ','].reduce((best, char) => count(char) > count(best) ? char : best, ',');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.trim() === '') { field = ''; quoted = true; }
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some((cell) => cell !== ''));
}

type Column = 'name' | 'email' | 'department' | 'job_role' | 'role';
const HEADERS: Record<Column, string[]> = {
  name: ['name', 'full name', 'full_name', 'fullname', 'employee', 'имя', 'фио', 'сотрудник', 'имя и фамилия', 'ism', 'ism familiya', 'f.i.sh', 'fish', 'xodim'],
  email: ['email', 'e-mail', 'mail', 'почта', 'электронная почта', 'эл. почта', 'pochta', 'elektron pochta'],
  department: ['department', 'dept', 'team', 'отдел', 'подразделение', 'департамент', 'bo‘lim', "bo'lim", 'bolim', 'bo`lim', 'boʻlim'],
  job_role: ['job role', 'job_role', 'job', 'position', 'track', 'должность', 'направление', 'lavozim', 'yo‘nalish', "yo'nalish"],
  role: ['role', 'access', 'роль', 'доступ', 'rol', 'huquq'],
};
const DEFAULT_ORDER: Column[] = ['name', 'email', 'department', 'job_role', 'role'];

const norm = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, ' ').trim();

const JOB_ALIASES: Record<string, JobRole> = {
  general: 'general', 'customer service': 'customer_service', 'call centre': 'customer_service', 'call center': 'customer_service', support: 'customer_service',
  sales: 'sales', hospitality: 'hospitality', hotel: 'hospitality', hotels: 'hospitality', tourism: 'hospitality', restaurant: 'hospitality',
  banking: 'banking_finance', finance: 'banking_finance', 'banking finance': 'banking_finance', accounting: 'banking_finance',
  it: 'it_software', software: 'it_software', 'it software': 'it_software', developer: 'it_software',
  healthcare: 'healthcare', medical: 'healthcare', logistics: 'logistics', trade: 'logistics',
  office: 'office_admin', admin: 'office_admin', 'office admin': 'office_admin', administration: 'office_admin',
  management: 'management', manager: 'management', leadership: 'management', engineering: 'engineering', manufacturing: 'engineering',
  // Russian and Uzbek short names HR teams tend to type.
  'продажи': 'sales', 'сервис': 'customer_service', 'колл центр': 'customer_service', 'отель': 'hospitality', 'финансы': 'banking_finance', 'банк': 'banking_finance',
  'логистика': 'logistics', 'офис': 'office_admin', 'управление': 'management', 'инженер': 'engineering', 'медицина': 'healthcare', 'общий': 'general',
  'savdo': 'sales', 'mehmonxona': 'hospitality', 'moliya': 'banking_finance', 'logistika': 'logistics', 'ofis': 'office_admin', 'boshqaruv': 'management', 'umumiy': 'general',
};
export function readJobRole(value: string): JobRole | null {
  if (!value) return 'general';
  const key = norm(value);
  const code = key.replaceAll(' ', '_');
  if ((JOB_ROLES as readonly string[]).includes(code)) return code as JobRole;
  return JOB_ALIASES[key] ?? null;
}

export type ImportRole = 'employee' | 'manager' | 'admin';
const ROLE_ALIASES: Record<string, ImportRole> = {
  employee: 'employee', staff: 'employee', 'сотрудник': 'employee', xodim: 'employee',
  manager: 'manager', head: 'manager', 'руководитель': 'manager', 'менеджер': 'manager', rahbar: 'manager',
  admin: 'admin', hr: 'admin', 'hr admin': 'admin', 'администратор': 'admin', 'hr администратор': 'admin',
};
export function readRole(value: string): ImportRole | null {
  if (!value) return 'employee';
  return ROLE_ALIASES[norm(value)] ?? null;
}

export interface ImportRow {
  line: number;
  name: string;
  email: string | null;
  department: string | null;
  job_role: JobRole | null;
  role: ImportRole | null;
  /** Problem code for the row, or null when it can be imported. */
  error: null | 'name' | 'email' | 'duplicate' | 'exists' | 'job_role' | 'role' | 'department';
}

/** Turns CSV text into rows with per-row problems. `existingEmails` are lower-case. */
export function readImport(input: string, existingEmails: Set<string>): { rows: ImportRow[]; header: boolean; tooMany: boolean } {
  const table = parseCsv(input);
  let columns = DEFAULT_ORDER, header = false;
  if (table.length) {
    const found = table[0].map((cell) => (Object.keys(HEADERS) as Column[]).find((column) => HEADERS[column].includes(norm(cell).replace(/[’ʼ']/g, '‘')) || HEADERS[column].includes(norm(cell))));
    if (found.includes('name')) {
      header = true;
      columns = found.map((column) => column ?? ('skip' as Column));
    }
  }
  const body = header ? table.slice(1) : table;
  const seen = new Set<string>();
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((cells, index): ImportRow => {
    const get = (column: Column) => cells[columns.indexOf(column)] ?? '';
    const name = get('name').slice(0, 200);
    const rawEmail = get('email').toLowerCase();
    const department = get('department') || null;
    const job_role = readJobRole(get('job_role'));
    const role = readRole(get('role'));
    const row: ImportRow = { line: index + (header ? 2 : 1), name, email: rawEmail || null, department, job_role, role, error: null };
    if (name.length < 2 || name.length > 120) row.error = 'name';
    else if (rawEmail && (rawEmail.length > 200 || !EMAIL.test(rawEmail))) row.error = 'email';
    else if (rawEmail && seen.has(rawEmail)) row.error = 'duplicate';
    else if (rawEmail && existingEmails.has(rawEmail)) row.error = 'exists';
    else if (department && department.length > 80) row.error = 'department';
    else if (!job_role) row.error = 'job_role';
    else if (!role) row.error = 'role';
    if (rawEmail) seen.add(rawEmail);
    return row;
  });
  return { rows, header, tooMany: body.length > MAX_IMPORT_ROWS };
}
