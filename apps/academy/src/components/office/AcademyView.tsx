import type { FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import type { TeacherStudioSummary } from '../../lib/client';

type AcademyLandingFormState = {
  name: string;
  headline: string;
  subheadline: string;
  primary_cta_label: string;
  secondary_cta_label: string;
};

type AcademyViewProps = {
  academyId: string;
  role: string;
  scope: string;
  assignedClassroomsCount: number;
  summary: TeacherStudioSummary | null;
  contactsCount: number;
  classroomsCount: number;
  offersCount: number;
  paymentsCount: number;
  openAlertsCount: number;
  quickTargets: QuickTarget[];
  landingForm: AcademyLandingFormState;
  onLandingFieldChange: (field: keyof AcademyLandingFormState, value: string) => void;
  onSaveLanding: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  canManageLanding: boolean;
  canViewOffers: boolean;
  canViewFinance: boolean;
  canViewAlerts: boolean;
  onNavigate: (path: string) => void;
};

type QuickTarget = {
  title: string;
  caption: string;
  path: string;
};

export const AcademyView = ({
  academyId,
  role,
  scope,
  assignedClassroomsCount,
  summary,
  contactsCount,
  classroomsCount,
  offersCount,
  paymentsCount,
  openAlertsCount,
  quickTargets,
  landingForm,
  onLandingFieldChange,
  onSaveLanding,
  busy,
  canManageLanding,
  canViewOffers,
  canViewFinance,
  canViewAlerts,
  onNavigate,
}: AcademyViewProps) => {
  const scopeLabel = scope === 'assigned_classrooms'
    ? `${assignedClassroomsCount} assigned classroom${assignedClassroomsCount === 1 ? '' : 's'}`
    : 'academy scope';

  return (
    <section className="grid academy-overview">
      <div className="panel academy-overview__context">
        <div>
          <span className="eyebrow">Current workspace</span>
          <h3>Academy workspace</h3>
        </div>
        <dl className="academy-overview__identity">
          <div>
            <dt>Academy ID</dt>
            <dd>{academyId || '-'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{role || 'Member'}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{scopeLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="academy-overview__grid">
        <div className="panel academy-overview__health">
          <h3>Health snapshot</h3>
          <div className="metric-list">
            <div className="metric-row">
              <span>Contacts</span>
              <strong>{summary?.counts.contacts ?? contactsCount}</strong>
            </div>
            <div className="metric-row">
              <span>Classrooms</span>
              <strong>{summary?.counts.classrooms ?? classroomsCount}</strong>
            </div>
            {canViewOffers ? (
              <div className="metric-row">
                <span>Offers</span>
                <strong>{summary?.counts.offers ?? offersCount}</strong>
              </div>
            ) : null}
            {canViewFinance ? (
              <div className="metric-row">
                <span>Payments</span>
                <strong>{paymentsCount}</strong>
              </div>
            ) : null}
            {canViewAlerts ? (
              <div className="metric-row">
                <span>Open alerts</span>
                <strong>{summary?.counts.open_alerts ?? openAlertsCount}</strong>
              </div>
            ) : null}
          </div>
        </div>

        {quickTargets.length > 0 ? (
          <div className="panel academy-overview__actions">
            <div>
              <span className="eyebrow">Shortcuts</span>
              <h3>Quick actions</h3>
            </div>
            <div className="academy-overview__action-list">
              {quickTargets.map((item) => (
                <button
                  key={item.path}
                  className="academy-overview__action"
                  type="button"
                  onClick={() => onNavigate(item.path)}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.caption}</small>
                  </span>
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {canManageLanding ? (
        <div className="panel academy-overview__landing">
          <h3>Public academy landing</h3>
          <form className="grid" onSubmit={onSaveLanding}>
            <label className="grid">
              <span className="small muted">Academy name</span>
              <input
                className="input"
                value={landingForm.name}
                onChange={(event) => onLandingFieldChange('name', event.target.value)}
                placeholder="Academy name"
                disabled={busy}
                required
              />
            </label>
            <label className="grid">
              <span className="small muted">Landing headline</span>
              <input
                className="input"
                value={landingForm.headline}
                onChange={(event) => onLandingFieldChange('headline', event.target.value)}
                placeholder="Master IELTS with structured pathways"
                disabled={busy}
              />
            </label>
            <label className="grid">
              <span className="small muted">Landing subheadline</span>
              <textarea
                className="input"
                value={landingForm.subheadline}
                onChange={(event) => onLandingFieldChange('subheadline', event.target.value)}
                placeholder="Explain outcomes, workflow, and value in one practical paragraph."
                disabled={busy}
              />
            </label>
            <div className="grid two">
              <label className="grid">
                <span className="small muted">Primary CTA label</span>
                <input
                  className="input"
                  value={landingForm.primary_cta_label}
                  onChange={(event) => onLandingFieldChange('primary_cta_label', event.target.value)}
                  placeholder="Open classroom landing pages"
                  disabled={busy}
                />
              </label>
              <label className="grid">
                <span className="small muted">Secondary CTA label</span>
                <input
                  className="input"
                  value={landingForm.secondary_cta_label}
                  onChange={(event) => onLandingFieldChange('secondary_cta_label', event.target.value)}
                  placeholder="Enter staff workspace"
                  disabled={busy}
                />
              </label>
            </div>
            <button className="primary-btn" type="submit" disabled={busy}>
              Save academy landing
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
};
