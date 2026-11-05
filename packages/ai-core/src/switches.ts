// Feature switches. The service settings row holds the global switch and per-feature
// switches; a centre workspace can switch features off for its own members (C7).
// A switch names a credit key (`tutor.reply`) or its area (`tutor`); the most
// specific entry wins, and anything not listed is on.

export type Switches = Record<string, boolean>;

export function switchState(switches: Switches | null | undefined, key: string): boolean | undefined {
  if (!switches) return undefined;
  if (typeof switches[key] === 'boolean') return switches[key];
  const area = key.split('.')[0];
  if (typeof switches[area] === 'boolean') return switches[area];
  return undefined;
}

export type SwitchDecision = { on: true } | { on: false; scope: 'global' | 'feature' | 'workspace' };

export function featureSwitch(input: { enabled: boolean; features: Switches; workspace?: Switches | null }, key: string): SwitchDecision {
  if (!input.enabled) return { on: false, scope: 'global' };
  if (switchState(input.features, key) === false) return { on: false, scope: 'feature' };
  if (switchState(input.workspace, key) === false) return { on: false, scope: 'workspace' };
  return { on: true };
}

export const SWITCH_KEY_PATTERN = /^[a-z][a-z0-9_]{1,30}(\.[a-z][a-z0-9_]{1,30})?$/;
/** Cleans a switches object from a request or a row: valid keys, booleans only, at most 200 entries. */
export function cleanSwitches(value: unknown): Switches {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, on]) => SWITCH_KEY_PATTERN.test(key) && typeof on === 'boolean').slice(0, 200)) as Switches;
}
