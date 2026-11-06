// Preview people. Pick one with ?as=owner|hr|manager|employee|newcomer|staff|signedout
// (remembered), or sign in with "<persona>@…" and any password. ?reset=1 reseeds data.
export const ORG_ID = '7a0f5c1e-0000-4000-8000-00000000c0de';
export const PERSONAS = {
  owner: { id: '00000000-0000-4000-8000-00000000a001', name: 'Dilnoza Karimova', role: 'owner' },
  hr: { id: '00000000-0000-4000-8000-00000000a002', name: 'Rustam Aliev', role: 'admin' },
  manager: { id: '00000000-0000-4000-8000-00000000a003', name: 'Elena Kim', role: 'manager' },
  employee: { id: '00000000-0000-4000-8000-00000000a004', name: 'Bekzod Tursunov', role: 'employee' },
  // Signed in but in no workspace yet (join links, starting a pilot).
  newcomer: { id: '00000000-0000-4000-8000-00000000a005', name: 'Aziza Rakhimova', role: null },
  staff: { id: '00000000-0000-4000-8000-00000000a006', name: 'Schood staff', role: null },
} as const;
export type Persona = keyof typeof PERSONAS | 'signedout';

const KEY = 'company-preview-persona';
export function currentPersona(): Persona {
  const asked = new URLSearchParams(location.search).get('as');
  if (asked && (asked === 'signedout' || asked in PERSONAS)) {
    try { localStorage.setItem(KEY, asked); } catch { /* preview only */ }
    return asked as Persona;
  }
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (stored === 'signedout' || stored in PERSONAS)) return stored as Persona;
  } catch { /* preview only */ }
  return 'owner';
}
export function setPersona(persona: Persona) {
  try { localStorage.setItem(KEY, persona); } catch { /* preview only */ }
}
