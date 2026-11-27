import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { articleTransfer, getTransfer, timeReferenceTransfer } from '../lib/transfer';
import { useResource } from '../lib/useResource';

export const TransferLink = ({ attemptId, skill = 'writing' }: { attemptId?: string; skill?: 'writing' | 'speaking' }) => {
  const t = useT();
  const { access, isPaused, session } = useEnglish();
  const enabled = access.unlocked.has(skill) && access.unlocked.has('grammar') && !isPaused(skill) && !isPaused('grammar');
  const target = skill === 'writing' ? articleTransfer : timeReferenceTransfer;
  const { data, error, loading } = useResource((signal) => getTransfer(target.slug, signal),
    [session?.user.id, attemptId, target.slug], enabled);
  const pathway = data?.pathway;
  if (!enabled || loading || error || !pathway || (attemptId && (pathway.stage !== 1 || pathway.source_attempt_id !== attemptId))) return null;

  return (
    <aside className="en-notice">
      <strong lang="en">{pathway.title}</strong>
      <p>{t(attemptId ? 'transfer.fromFeedback' : skill === 'speaking' ? 'transfer.speech.catalogLead' : 'transfer.catalogLead')}</p>
      <Link className="en-button-quiet" to={target.href}>{t(skill === 'speaking' ? 'transfer.speech.open' : 'transfer.open')}</Link>
    </aside>
  );
};
