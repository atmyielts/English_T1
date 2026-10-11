// Only the complete workspace suite may satisfy the release gate.
export function isFullAcademyRouteCommand(command) {
  if (typeof command !== 'string') return false;
  const tokens = command.trim().split(/\s+/);
  const base = ['npm', '--workspace', 'apps/academy', 'run', 'test:routes'];
  if (!base.every((token, index) => tokens[index] === token)) return false;
  if (tokens.length === base.length) return true;
  if (tokens[base.length] !== '--') return false;
  const flags = tokens.slice(base.length + 1);
  return flags.length === 2 && new Set(flags).size === 2
    && flags.includes('--fully-parallel') && flags.some(flag => /^--workers=[12]$/.test(flag));
}
