import { Suspense, type ReactNode } from 'react';
import { translate } from '../../i18n';
import { RecoveryBoundary } from '../../../../../packages/ui-recovery/src/RecoveryBoundary';

type LazyRouteBoundaryProps = { children: ReactNode; fallback: ReactNode };

export const LazyRouteBoundary = ({ children, fallback }: LazyRouteBoundaryProps) => (
  <RecoveryBoundary
    app="academy"
    compact
    title={translate('This workspace section could not load')}
    reloadLabel={translate('Reload workspace')}
  >
    <Suspense fallback={fallback}>{children}</Suspense>
  </RecoveryBoundary>
);
