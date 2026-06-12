import type { FormEvent } from 'react';
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
  summary: TeacherStudioSummary | null;
  contactsCount: number;
  classroomsCount: number;
  offersCount: number;
  paymentsCount: number;
  openAlertsCount: number;
  landingForm: AcademyLandingFormState;
  onLandingFieldChange: (field: keyof AcademyLandingFormState, value: string) => void;
  onSaveLanding: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  canManageLanding: boolean;
  onNavigate: (path: string) => void;
};

type QuickTarget = {
  title: string;
  caption: string;
  path: string;
};

const QUICK_TARGETS: QuickTarget[] = [
  {
    title: 'Education OS',
    caption: 'Run learning, ops, staff, reports, and engagement',
    path: '/academy/teacher/os',
  },
  {
    title: 'Contacts',
    caption: 'Manage students and assistants',
    path: '/academy/teacher/contacts',
  },
  {
    title: 'Classrooms',
    caption: 'Create cohorts and assign members',
    path: '/academy/teacher/classrooms',
  },
  {
    title: 'Offers',
    caption: 'Define paid plans and packages',
    path: '/academy/teacher/offers',
  },
  {
    title: 'Payments',
    caption: 'Track payments and convert to access',
    path: '/academy/teacher/payments',
  },
];

export const AcademyView = ({
  academyId,
  role,
  summary,
  contactsCount,
  classroomsCount,
  offersCount,
  paymentsCount,
  openAlertsCount,
  landingForm,
  onLandingFieldChange,
  onSaveLanding,
  busy,
  canManageLanding,
  onNavigate,
}: AcademyViewProps) => {
  return (
    <section className="grid">
      <div className="panel">
        <h3>Academy workspace</h3>
        <p className="muted">
          Academy ID: <strong>{academyId || '-'}</strong>
        </p>
        <p className="muted">
          Your role: <strong>{role || 'member'}</strong>
        </p>
      </div>

      <div className="grid two">
        <div className="panel">
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
            <div className="metric-row">
              <span>Offers</span>
              <strong>{summary?.counts.offers ?? offersCount}</strong>
            </div>
            <div className="metric-row">
              <span>Payments</span>
              <strong>{paymentsCount}</strong>
            </div>
            <div className="metric-row">
              <span>Open alerts</span>
              <strong>{summary?.counts.open_alerts ?? openAlertsCount}</strong>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>Quick actions</h3>
          <div className="grid">
            {QUICK_TARGETS.map((item) => (
              <button
                key={item.path}
                className="ghost-btn"
                type="button"
                onClick={() => onNavigate(item.path)}
              >
                {item.title}: {item.caption}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Public academy landing</h3>
        <p className="muted">
          These fields power the public-facing academy page before users enter Teacher Office or Student Workplace.
        </p>
        <ul className="list">
          <li>Headline and subheadline define the first impression.</li>
          <li>CTA labels let you tune conversion copy for your audience.</li>
          <li>Name update keeps directory cards and landing hero synchronized.</li>
        </ul>
        <form className="grid" onSubmit={onSaveLanding}>
          <label className="grid">
            <span className="small muted">Academy name</span>
            <input
              className="input"
              value={landingForm.name}
              onChange={(event) => onLandingFieldChange('name', event.target.value)}
              placeholder="Academy name"
              disabled={!canManageLanding || busy}
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
              disabled={!canManageLanding || busy}
            />
          </label>
          <label className="grid">
            <span className="small muted">Landing subheadline</span>
            <textarea
              className="input"
              value={landingForm.subheadline}
              onChange={(event) => onLandingFieldChange('subheadline', event.target.value)}
              placeholder="Explain outcomes, workflow, and value in one practical paragraph."
              disabled={!canManageLanding || busy}
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
                disabled={!canManageLanding || busy}
              />
            </label>
            <label className="grid">
              <span className="small muted">Secondary CTA label</span>
              <input
                className="input"
                value={landingForm.secondary_cta_label}
                onChange={(event) => onLandingFieldChange('secondary_cta_label', event.target.value)}
                placeholder="Enter Teacher Office"
                disabled={!canManageLanding || busy}
              />
            </label>
          </div>
          <button className="primary-btn" type="submit" disabled={!canManageLanding || busy}>
            Save academy landing
          </button>
          {!canManageLanding ? <p className="small muted">Owner/admin role required to update landing settings.</p> : null}
        </form>
      </div>
    </section>
  );
};
