import { Loader2 } from 'lucide-react';
import { useAppT } from '../../i18n';

export const AccessLoading = (props: { label?: string; detail?: string }) => {
  const t = useAppT();
  return <div className="access-loading-shell" role="status">
    <div className="access-loading-card">
      <div className="access-loading-mark"><Loader2 className="spin" size={22} aria-hidden="true" /></div>
      <div className="access-loading-copy">
        <h1>{props.label ?? t('access.checking')}</h1>
        <p>{props.detail ?? t('access.detail')}</p>
      </div>
    </div>
  </div>;
};
