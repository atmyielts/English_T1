import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Plan-template task strings reference pages as "(/module-slug)" and tools as
 * "(https://…)" or bare https URLs. Render those as links; keep the rest as text.
 */
export const TaskText = ({ text, titleOf }: { text: string; titleOf?: (slug: string) => string | null }) => {
  const parts: ReactNode[] = [];
  const re = /\((\/[a-z0-9]+(?:-[a-z0-9]+)*)\)|\(?(https:\/\/[^\s)]+)\)?/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      const slug = match[1].slice(1);
      const title = titleOf?.(slug) ?? null;
      const before = text.slice(0, match.index).toLowerCase();
      // Task text usually names the module already; then the link is a compact "open" arrow.
      const named = !!title && before.includes(title.toLowerCase().split(':').pop()!.trim().split(' ')[0] ?? '');
      parts.push(
        <Link key={key++} to={match[1]} className="task-link" aria-label={title ?? slug}>
          {named ? '↗' : title ?? slug}
        </Link>,
      );
    } else if (match[2]) {
      const url = match[2].replace(/[.,;:]+$/, '');
      const trailing = match[2].slice(url.length);
      let label = url.replace(/^https:\/\//, '').replace(/\/$/, '');
      if (label.length > 42) label = `${label.slice(0, 40)}…`;
      parts.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="task-link">{label} <ExternalLink size={12} aria-hidden="true" /></a>);
      if (trailing) parts.push(trailing);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};
