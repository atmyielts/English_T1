import { CalendarClock, CheckCircle2, GraduationCap, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatLocaleDateTime, translate } from '../i18n';
import {
  teacherStudioAcceptAccessInvitation,
  teacherStudioInvitationStatus,
  type AcademyAccessInvitation,
} from '../lib/client';

type Props = {
  signedIn: boolean;
  actorId: string;
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
  return 'Staff access';
};

export function InvitationAcceptView({ signedIn, actorId, sessionLoading, signInUrl, search, onContinue }: Props) {
  const token = useMemo(() => new URLSearchParams(search).get('token')?.trim() ?? '', [search]);
  const [invitation, setInvitation] = useState<AcademyAccessInvitation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'accepted' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [reload, setReload] = useState(0);
  const scope = useMemo(() => ({ actorId, token }), [actorId, token]);
  const currentScope = useRef<typeof scope | null>(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
    return () => { currentScope.current = null; };
  }, [scope]);

  useEffect(() => {
    let active = true;
    if (!signedIn || !token) return undefined;
    void teacherStudioInvitationStatus(token, actorId)
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
  }, [signedIn, actorId, token, reload]);

  const reviewAgain = () => {
    setInvitation(null);
    setState('loading');
    setMessage('');
    setConsent(false);
    setReload((previous) => previous + 1);
  };

  const accept = async () => {
    if (!token) return;
    const submittedScope = scope;
    setState('loading');
    setMessage('');
    try {
      const { invitation: accepted } = await teacherStudioAcceptAccessInvitation(token, invitation?.review_hash, actorId);
      if (currentScope.current !== submittedScope) return;
      const nextInvitation = {
        ...invitation,
        ...accepted,
      } as AcademyAccessInvitation;
      setInvitation(nextInvitation);
      setState('accepted');
    } catch (error) {
      if (currentScope.current !== submittedScope) return;
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
        <h1>{translate(state === 'accepted' ? 'Your account is linked' : 'Accept your invitation')}</h1>

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
                  <small>{translate('Academy')}</small>
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
            {invitation.student_name ? <p><strong>{translate('Student')}:</strong> {invitation.student_name}</p> : null}
            {invitation.classroom_name ? <p><strong>{translate('Group')}:</strong> {invitation.classroom_name}</p> : null}
            {invitation.invite_kind === 'guardian' && invitation.shared_sections?.length ? (
              <p>{translate('You can view')}: {invitation.shared_sections.map((section) => translate(section)).join(', ')}.</p>
            ) : null}
            {invitation.access_status === 'paused' ? <p className="info-banner">{translate('This group is paused. Your account can be linked without restarting lessons.')}</p> : null}
            {invitation.access_status === 'stopped' ? <p className="form-error">{translate('This access has been stopped. Ask the academy to review it.')}</p> : null}
            {state === 'accepted' ? (
              invitation.access_status === 'stopped' ? null : <button className="primary-btn" type="button" onClick={() => onContinue(destinationFor(invitation))}>
                {translate('Open my workspace')}
              </button>
            ) : invitation.status === 'pending' && invitation.access_status !== 'stopped' ? (
              <>
                {invitation.invite_kind === 'guardian' ? <label className="invitation-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{translate('I agree to link my account for the student and access shown above.')}</span></label> : null}
                <button className="primary-btn" type="button" disabled={state === 'error' || (invitation.invite_kind === 'guardian' && !consent)} onClick={() => void accept()}>
                  {translate(invitation.invite_kind === 'guardian' ? 'Confirm family access' : 'Accept invitation')}
                </button>
              </>
            ) : (
              invitation.access_status === 'stopped' ? null : <p className="form-error">
                {translate(`This invitation is ${invitation.status}. Ask the academy to send a new one.`)}
              </p>
            )}
            {state === 'error' ? <button className="ghost-btn" type="button" onClick={reviewAgain}>{translate('Review invitation again')}</button> : null}
          </>
        ) : (
          <>
            <p className="form-error">{translate(message || 'This invitation could not be opened.')}</p>
            <button className="ghost-btn" type="button" onClick={reviewAgain}>{translate('Review invitation again')}</button>
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
