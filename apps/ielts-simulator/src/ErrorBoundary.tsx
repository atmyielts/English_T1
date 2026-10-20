import { RecoveryBoundary } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import type { ReactNode } from 'react';

export const ErrorBoundary = ({ children }: { children?: ReactNode }) => (
  <RecoveryBoundary app="ielts-simulator">{children}</RecoveryBoundary>
);
