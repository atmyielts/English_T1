import { useAppT } from '../i18n';

export const PageLoading = (props: { label?: string }) => {
  const t = useAppT();
  return <div className="page-loading" role="status">
    <span className="skeleton-line long" />
    <span className="skeleton-line medium" />
    <p>{props.label ?? t('app.loading')}</p>
  </div>;
};
