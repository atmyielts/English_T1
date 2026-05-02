import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { referralsClaim } from '../../lib/platformClient';
import { supabase } from '../../lib/supabase';

const REFERRAL_STORAGE_KEY = 'schood:referral_code';

const normalizeReferralCode = (value?: string | null): string => String(value ?? '').trim().toUpperCase();

export const ReferralCapture = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = normalizeReferralCode(params.get('ref'));
    if (!code) return;

    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);

    const claimIfAuthed = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      await referralsClaim(accessToken, code).catch(() => null);
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
