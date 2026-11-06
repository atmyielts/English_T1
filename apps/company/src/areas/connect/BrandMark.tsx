// Shows a workspace's branding on public pages (candidate test, certificate). Pass it the
// `brand` from the server's publicBrand helper, or let useBrand read the public route.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT } from '../../i18n/index.ts';

export interface Brand { name: string; color: string | null; logo: string | null }

export function useBrand(orgId: string | null | undefined): Brand | null {
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    api<{ brand: Brand | null }>(`public/brand/${orgId}`, { auth: false }).then((result) => { if (live) setBrand(result.brand); }, () => undefined);
    return () => { live = false; };
  }, [orgId]);
  return brand;
}

export function BrandMark({ brand }: { brand: Brand | null }) {
  const t = useAppT();
  if (!brand) return null;
  return <div className="connect-mark" style={brand.color ? { borderColor: brand.color } : undefined}>
    {brand.logo && <img src={brand.logo} alt={t('connect.brand.logoAlt', { name: brand.name })}/>}
    <strong style={brand.color ? { color: brand.color } : undefined}>{brand.name}</strong>
  </div>;
}
