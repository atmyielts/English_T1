import type { ReactNode } from 'react';
import { AccessBoundaryCard } from '../../../english-shared/src/ui';

type EntitledRouteProps = {
  productSlug: string;
  hasAccess: boolean;
  checkingAccess: boolean;
  pricingHref: string;
  title?: string;
  message?: string;
  children: ReactNode;
};

const titleFromSlug = (productSlug: string): string => {
  const label = productSlug.replace(/^english-/, '').replace(/-/g, ' ');
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)} Module`;
};

export const EntitledRoute = ({
  productSlug,
  hasAccess,
  checkingAccess,
  pricingHref,
  title,
  message,
  children,
}: EntitledRouteProps) => {
  if (checkingAccess) {
    return <div className="loading-container">Verifying plan access...</div>;
  }

  if (!hasAccess) {
    return (
      <div className="locked-view-container">
        <AccessBoundaryCard
          hasAccess={false}
          title={title ?? titleFromSlug(productSlug)}
          message={message ?? `Unlock full access to the ${productSlug.replace(/^english-/, '')} practice routes, diagnostics, and AI feedback loops.`}
          ctaHref={pricingHref}
        />
      </div>
    );
  }

  return <>{children}</>;
};
