export type VoucherChoices = {
  tenant_id: string;
  center_office: true;
  access_kind: 'mock_exam' | 'subscription' | 'seat';
  quantity: number;
  expires_in_days: number;
  prefix: string;
  experience_id?: string;
  plan_id?: string;
  classroom_id?: string;
  assigned_students: Array<{ name?: string; email?: string; phone?: string }>;
};
export type VoucherAttempt = { version: 1; actor: string; tenant: string; key: string; choices: VoucherChoices };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const storage = (): Store => {
  try {
    return window.sessionStorage;
  } catch {
    throw Error('This browser cannot save your voucher request. Enable browser storage before generating vouchers.');
  }
};
const identity = (actor: string, tenant: string) => {
  if (!uuid(actor) || !uuid(tenant)) throw Error('Sign in again to recover your center voucher request.');
  return `schood-voucher-issue:v1:${actor}:${tenant}`;
};
export function voucherChoices(raw: Record<string, unknown>, tenant: string): VoucherChoices {
  const kind = raw.access_kind, quantity = raw.quantity, days = raw.expires_in_days ?? 30;
  if (
    !uuid(tenant) || raw.tenant_id !== tenant || !['mock_exam', 'subscription', 'seat'].includes(String(kind)) ||
    typeof kind !== 'string' ||
    typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 ||
    typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365
  ) throw Error('Choose a valid voucher type, quantity and expiry.');
  const prefix = typeof raw.prefix === 'string' ? raw.prefix.trim().toUpperCase() : '';
  if (!/^[A-Z0-9-]{1,40}$/.test(prefix)) throw Error('Use 1–40 letters, numbers or hyphens for the voucher prefix.');
  const choices: VoucherChoices = {
    tenant_id: tenant,
    center_office: true,
    access_kind: kind as VoucherChoices['access_kind'],
    quantity,
    expires_in_days: days,
    prefix,
    assigned_students: [],
  };
  const resource = kind === 'mock_exam' ? 'experience_id' : 'plan_id';
  if (!uuid(raw[resource])) throw Error('Select a voucher resource before generating a batch.');
  choices[resource] = raw[resource].toLowerCase();
  if (raw.classroom_id != null && raw.classroom_id !== '') {
    if (!uuid(raw.classroom_id)) throw Error('Select a valid classroom.');
    choices.classroom_id = raw.classroom_id.toLowerCase();
  }
  const roster = raw.assigned_students ?? [];
  if (!Array.isArray(roster) || roster.length > quantity) throw Error('The roster must fit this voucher batch.');
  for (const row of roster) {
    if (!object(row)) throw Error('The voucher roster is invalid.');
    const entry: VoucherChoices['assigned_students'][number] = {};
    for (const [field, max] of [['name', 200], ['email', 320], ['phone', 80]] as const) {
      if (row[field] == null) continue;
      if (typeof row[field] !== 'string' || row[field].length > max) {
        throw Error('A roster name, email or phone is too long or invalid.');
      }
      entry[field] = field === 'email' ? row[field].trim().toLowerCase() : row[field].trim();
    }
    choices.assigned_students.push(entry);
  }
  if (new TextEncoder().encode(JSON.stringify(choices)).length > 200000) {
    throw Error('This roster is too large for one recoverable batch. Split it into smaller batches.');
  }
  return choices;
}
export function readVoucherAttempt(actor: string, tenant: string, provided?: Store): VoucherAttempt | null {
  const name = identity(actor, tenant);
  let raw: string | null;
  try {
    raw = (provided ?? storage()).getItem(name);
  } catch {
    throw Error(
      'This browser cannot read your saved voucher request. Restore browser storage before generating another batch.',
    );
  }
  if (!raw) return null;
  try {
    if (new TextEncoder().encode(raw).length > 220000) throw Error('oversized');
    const parsed = JSON.parse(raw);
    if (
      !object(parsed) || parsed.version !== 1 || parsed.actor !== actor || parsed.tenant !== tenant ||
      !uuid(parsed.key) || !object(parsed.choices)
    ) throw Error('invalid');
    const choices = voucherChoices(parsed.choices, tenant);
    if (JSON.stringify(choices) !== JSON.stringify(parsed.choices)) throw Error('changed');
    return { version: 1, actor, tenant, key: parsed.key, choices };
  } catch {
    throw Error('Your saved voucher request needs review. Check recorded batches before creating another.');
  }
}
export function saveVoucherAttempt(value: VoucherAttempt, provided?: Store): void {
  const store = provided ?? storage(), name = identity(value.actor, value.tenant);
  const saved = readVoucherAttempt(value.actor, value.tenant, store);
  if (saved && saved.key !== value.key) {
    throw Error('Resume or close the original voucher request before creating another.');
  }
  const encoded = JSON.stringify({ ...value, choices: voucherChoices(value.choices, value.tenant) });
  try {
    store.setItem(name, encoded);
    if (store.getItem(name) !== encoded) throw Error('not retained');
  } catch {
    throw Error(
      'This browser could not save the voucher request. No new request was sent; restore browser storage and try again.',
    );
  }
}
export function finishVoucherAttempt(value: VoucherAttempt, provided?: Store): void {
  const store = provided ?? storage(), saved = readVoucherAttempt(value.actor, value.tenant, store);
  if (saved && saved.key !== value.key) throw Error('The saved voucher reference changed. Check its original batch.');
  try {
    store.removeItem(identity(value.actor, value.tenant));
    if (store.getItem(identity(value.actor, value.tenant))) throw Error('not removed');
  } catch {
    throw Error(
      'The outcome is recorded, but this browser could not clear its reference. Resume it to finish safely before creating another batch.',
    );
  }
}
