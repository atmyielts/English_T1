import { useNavigate } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { Loading } from '../ui/kit';
import { Onboarding } from './Onboarding';

/** The monthly level check: the placement test again, compared with before. */
export const CheckPage = () => {
  const navigate = useNavigate();
  const { onboarding } = useEnglish();
  if (onboarding.status === 'loading' && !onboarding.value) return <Loading lines={3} />;
  if (!onboarding.value?.placementDone) return <Onboarding onDone={() => navigate('/today')} />;
  return <Onboarding check onDone={() => navigate('/progress')} />;
};
