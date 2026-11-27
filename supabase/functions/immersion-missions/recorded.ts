import { hasRecordedListening } from '../_shared/english-recorded-listening.ts';
import { stepKind } from '../_shared/english-immersion.ts';

type Step = { step_type?: unknown; metadata?: unknown };

export const missionStepAudio = (step: Step): string | null => {
  if (stepKind(step.step_type) !== 'listen' || !step.metadata || typeof step.metadata !== 'object') return null;
  const audio = (step.metadata as Record<string, unknown>).audio_url;
  return hasRecordedListening(audio) ? audio as string : null;
};

export const playableMissionSteps = <T extends Step>(steps: T[]): T[] =>
  steps.filter((step) => stepKind(step.step_type) !== 'listen' || missionStepAudio(step) !== null);
