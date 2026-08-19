import { CalendarClock, CheckCircle2, GraduationCap, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatLocaleDateTime, translate } from '../i18n';
import {
  teacherStudioAcceptAccessInvitation,
  teacherStudioInvitationStatus,
  type AcademyAccessInvitation,
} from '../lib/client';

type Props = {
  signedIn: boolean;
  sessionLoading: boolean;
  signInUrl: string;
  search: string;
  onContinue: (path: string) => void;
};

const destinationFor = (invitation: AcademyAccessInvitation): string => {
  const academyId = encodeURIComponent(String(invitation.academy_id ?? ''));
  if (invitation.invite_kind === 'student') return `/academy/student?academy_id=${academyId}`;
  if (invitation.invite_kind === 'guardian') return '/academy/parent';
  return `/academy/workspace?academy_id=${academyId}`;
};

const invitationLabel = (kind: AcademyAccessInvitation['invite_kind']): string => {
  if (kind === 'student') return 'Student learning access';
  if (kind === 'guardian') return 'Family access';
  return 'Staff workspace access';
};

export function InvitationAcceptView({ signedIn, sessionLoading, signInUrl, search, onContinue }: Props) {
  const token = useMemo(() => new URLSearchParams(search).get('token')?.trim() ?? '', [search]);
  const [invitation, setInvitation] = useState<AcademyAccessInvitation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'accepted' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!signedIn || !token) return undefined;
    void teacherStudioInvitationStatus(token)
      .then(({ invitation: nextInvitation }) => {
        if (!active) return;
        setInvitation(nextInvitation);
        setState(nextInvitation.status === 'accepted' ? 'accepted' : 'ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'This invitation could not be opened.');
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [signedIn, token]);

  const accept = async () => {
    if (!token) return;
    setState('loading');
    setMessage('');
    try {
      const { invitation: accepted } = await teacherStudioAcceptAccessInvitation(token);
      const nextInvitation = {
        ...invitation,
        ...accepted,
      } as AcademyAccessInvitation;
      setInvitation(nextInvitation);
      setState('accepted');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not accept this invitation.');
      setState('error');
    }
  };

  return (
    <div className="invitation-page">
      <main className="invitation-card">
        <div className="invitation-mark" aria-hidden="true">
          {state === 'accepted' ? <CheckCircle2 /> : <UserRoundCheck />}
        </div>
        <span className="market-badge">{translate('Academy invitation')}</span>
        <h1>{translate(state === 'accepted' ? 'Your access is ready' : 'Join your Academy workspace')}</h1>

        {sessionLoading ? (
          <div className="invitation-status" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>{translate('Checking your account...')}</span>
          </div>
        ) : !token ? (
          <>
            <p className="form-error">{translate('This invitation link is incomplete.')}</p>
            <a className="ghost-btn" href="/academies">
              {translate('Go to my workspaces')}
            </a>
          </>
        ) : !signedIn ? (
          <>
            <p>
              {translate(
                'Sign in with the email address that received this invitation. You will return here automatically.',
              )}
            </p>
            <a className="primary-btn" href={signInUrl}>
              {translate('Sign in to continue')}
            </a>
          </>
        ) : state === 'loading' ? (
          <div className="invitation-status" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>{translate('Checking your invitation...')}</span>
          </div>
        ) : invitation ? (
          <>
            <div className="invitation-summary">
              <div>
                <GraduationCap aria-hidden="true" />
                <span>
                  <small>{translate('Workspace')}</small>
                  <strong>{invitation.academy?.name ?? translate('Academy')}</strong>
                </span>
              </div>
              <div>
                <ShieldCheck aria-hidden="true" />
                <span>
                  <small>{translate('Access')}</small>
                  <strong>{translate(invitationLabel(invitation.invite_kind))}</strong>
                </span>
              </div>
              <div>
                <CalendarClock aria-hidden="true" />
                <span>
                  <small>{translate('Link expires')}</small>
                  <strong>{formatLocaleDateTime(invitation.token_expires_at)}</strong>
                </span>
              </div>
            </div>
            <p className="muted">
              {translate('This invitation was sent to')} <strong>{invitation.email}</strong>.
            </p>
            {state === 'accepted' ? (
              <button className="primary-btn" type="button" onClick={() => onContinue(destinationFor(invitation))}>
                {translate('Open my workspace')}
              </button>
            ) : invitation.status === 'pending' ? (
              <button className="primary-btn" type="button" onClick={() => void accept()}>
                {translate('Accept and open workspace')}
              </button>
            ) : (
              <p className="form-error">
                {translate(`This invitation is ${invitation.status}. Ask the academy to send a new one.`)}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="form-error">{translate(message || 'This invitation could not be opened.')}</p>
            <a className="ghost-btn" href="/academies">
              {translate('Go to my workspaces')}
            </a>
          </>
        )}
        {message && invitation ? <p className="form-error">{translate(message)}</p> : null}
      </main>
    </div>
  );
}
