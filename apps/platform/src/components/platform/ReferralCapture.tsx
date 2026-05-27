import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { referralsClaim } from '../../lib/platformClient';
import { buildReferralContext, normalizeReferralCode, storeReferral } from '../../lib/referralContext';
import { supabase } from '../../lib/supabase';

export const ReferralCapture = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = normalizeReferralCode(params.get('ref'));
    if (!code) return;

    const context = buildReferralContext(location.pathname, location.search, code);
    storeReferral(code, context);

    const claimIfAuthed = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      await referralsClaim(accessToken, code, context).catch(() => null);
    };

    void claimIfAuthed();

    if (location.pathname === '/') {
      params.delete('ref');
      const query = params.toString();
      navigate(`/r/${encodeURIComponent(code)}${query ? `?${query}` : ''}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return null;
};
