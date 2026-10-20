import type { ReactNode } from 'react';
import { RecoveryBoundary } from '../../../../packages/ui-recovery/src/RecoveryBoundary';
import { reportEnglishRecovery } from '../lib/clientRecovery';
import { buildPlatformHref } from '../lib/navigation';
import { platformUrl } from '../lib/supabase';

export const AppErrorBoundary = ({ children }: { children: ReactNode }) => (
  <RecoveryBoundary
    app="english-hub"
    onError={reportEnglishRecovery}
    reloadLabel={{ en: 'Reload English', uz: 'Sahifani yangilash', ru: 'Обновить страницу' }}
    homeLabel={{ en: 'Learning centre', uz: 'O‘quv sahifasi', ru: 'Учебный центр' }}
    homeHref={buildPlatformHref(platformUrl, '/student-center', {
      returnTo: typeof window === 'undefined' ? '/' : window.location.origin + window.location.pathname,
    })}
  >
    {children}
  </RecoveryBoundary>
);
