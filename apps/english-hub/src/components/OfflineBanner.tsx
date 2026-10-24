import { Link, useLocation } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { useOfflineState, useOnline } from '../lib/offline/useOffline';

export const OfflineBanner = () => {
  const t = useT();
  const online = useOnline();
  const { session } = useEnglish();
  const location = useLocation();
  // Only look for a saved session while offline.
  const saved = useOfflineState(session?.user.id ?? null, !online);

  if (online) return null;
  const showLink = Boolean(saved.pack) && location.pathname !== '/offline';

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9000,
        background: '#7c2d12',
        color: '#fff',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      {t('offline.banner')}
      {showLink ? (
        <>
          {' '}
          <Link to="/offline" style={{ color: '#fff', textDecoration: 'underline' }}>{t('offline.banner.open')}</Link>
        </>
      ) : null}
    </div>
  );
};
