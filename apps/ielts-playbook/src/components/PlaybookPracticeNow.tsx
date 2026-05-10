import React from 'react';
import { Dumbbell, ExternalLink } from 'lucide-react';
import { PRACTICE_APP_URL } from '../lib/constants';

interface Props {
  moduleKey?: string | null;
}

// Maps a playbook module_key to a practice deep-link. The practice dashboard
// reads ?weak_skill and ?focus_module from the URL to auto-scope a session.
// module_key is expected to look like "reading_matching_headings" or
// "writing_task1" — we extract the leading section, with sensible fallbacks.
const deriveSection = (moduleKey: string | null | undefined): string | null => {
  if (!moduleKey) return null;
  const lower = String(moduleKey).toLowerCase();
  if (lower.startsWith('reading')) return 'reading';
  if (lower.startsWith('listening')) return 'listening';
  if (lower.startsWith('writing')) return 'writing';
  if (lower.startsWith('speaking')) return 'speaking';
  return null;
};

export const PlaybookPracticeNow: React.FC<Props> = ({ moduleKey }) => {
  const section = deriveSection(moduleKey);
  if (!section) return null;
  const params = new URLSearchParams({ source: 'playbook', weak_skill: section });
  if (moduleKey) params.set('focus_module', String(moduleKey));
  const href = `${PRACTICE_APP_URL}/dashboard?${params.toString()}`;

  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: '#1a1814',
        color: '#fff',
        textDecoration: 'none',
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        marginRight: 8,
      }}
    >
      <Dumbbell size={15} />
      Practice this now
      <ExternalLink size={12} style={{ opacity: 0.7 }} />
    </a>
  );
};
