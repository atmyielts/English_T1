// /w/:org/framework — the required English level per job role and department,
// overall and per skill, with a due date. Starting points by job role are offered
// and always marked as Schood suggestions.
import React, { useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type LevelCode } from './api.ts';
import { SKILL_CODES, type FrameworkData, type Requirement, type SkillLevels } from './api2.ts';
import { LEVEL_CODES, LEVEL_SHORT, LevelBadge, Loading, Panel, Problem, useFormat } from './ui.tsx';
import { JobSelect, SkillList } from './parts.tsx';

interface Draft { id: string | null; job_role: string; department_id: string; level: LevelCode; skills: SkillLevels; due_date: string; note: string; source: 'hr' | 'suggestion' }
const emptyDraft: Draft = { id: null, job_role: '', department_id: '', level: 'b1', skills: {}, due_date: '', note: '', source: 'hr' };

export function Framework() {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org } = useWorkspace();
  const { data, error, loading, reload } = useApi<FrameworkData>(`orgs/${org.id}/insights/requirements`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  if (error && !data) return <Problem message={error} retry={() => void reload()}/>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  const departmentName = (id: string | null) => data.departments.find((entry) => entry.id === id)?.name ?? '';
  const scopeText = (row: Pick<Requirement, 'job_role' | 'department_id'>) => {
    const role = row.job_role ? t(`job.${row.job_role}` as AppKey) : '';
    const department = row.department_id ? departmentName(row.department_id) : '';
    return [role, department].filter(Boolean).join(' · ') || t('insights.framework.wholeCompany');
  };
  async function run(work: () => Promise<string>) {
    setBusy(true); setActionError(''); setNotice('');
    try {
      setNotice(await work());
      await reload();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const body = { job_role: draft.job_role || null, department_id: draft.department_id || null, level: draft.level, skills: draft.skills, due_date: draft.due_date || null, note: draft.note, source: draft.source };
    await run(async () => {
      if (draft.id) await api(`orgs/${org.id}/insights/requirements/${draft.id}`, { method: 'PATCH', body });
      else await api(`orgs/${org.id}/insights/requirements`, { method: 'POST', body });
      setDraft(null);
      return t('common.saved');
    });
  }
  const unused = data.suggestions.filter((row) => row.in_use && !row.covered);

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.framework.title')}</h1>
        <p className="insights-lead">{t('insights.framework.lead')}</p>
      </div>
      <div className="company-actions">
        <Link className="button-link quiet" to={`/w/${org.id}/skills-gap`}>{t('insights.framework.seeGap')}</Link>
        {data.can_manage && !draft && <button onClick={() => setDraft(emptyDraft)}>{t('insights.framework.add')}</button>}
      </div>
    </header>
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}

    {draft && <Panel id="req-form" title={draft.id ? t('insights.framework.edit') : t('insights.framework.add')}>
      {draft.source === 'suggestion' && <p className="hint"><span className="company-badge">{t('insights.framework.suggestionBadge')}</span> {t('insights.framework.suggestionNote')}</p>}
      <form className="insights-form" onSubmit={submit}>
        <div className="insights-form-row">
          <label>{t('insights.framework.jobRole')}<JobSelect value={draft.job_role} onChange={(job_role) => setDraft({ ...draft, job_role })} anyLabel={t('insights.framework.anyRole')}/></label>
          <label>{t('insights.framework.department')}
            <select value={draft.department_id} onChange={(event) => setDraft({ ...draft, department_id: event.target.value })}>
              <option value="">{t('insights.framework.anyDepartment')}</option>
              {data.departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
        </div>
        <div className="insights-form-row">
          <label>{t('insights.framework.level')}
            <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as LevelCode })}>
              {LEVEL_CODES.map((level) => <option key={level} value={level}>{LEVEL_SHORT[level]}</option>)}
            </select>
          </label>
          <label>{t('insights.framework.dueDate')} <span className="hint">{t('common.optional')}</span><input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}/></label>
        </div>
        <fieldset>
          <legend>{t('insights.framework.perSkill')} <span className="hint">{t('common.optional')}</span></legend>
          <div className="insights-skill-picks">
            {SKILL_CODES.map((skill) => <label key={skill}>{t(`skill.${skill}` as AppKey)}
              <select value={draft.skills[skill] ?? ''} onChange={(event) => {
                const skills = { ...draft.skills };
                if (event.target.value) skills[skill] = event.target.value as LevelCode; else delete skills[skill];
                setDraft({ ...draft, skills });
              }}>
                <option value="">{t('insights.framework.sameAsOverall')}</option>
                {LEVEL_CODES.map((level) => <option key={level} value={level}>{LEVEL_SHORT[level]}</option>)}
              </select>
            </label>)}
          </div>
        </fieldset>
        <label>{t('insights.framework.note')} <span className="hint">{t('common.optional')}</span><input maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })}/></label>
        <div className="company-actions">
          <button disabled={busy}>{t('common.save')}</button>
          <button type="button" className="quiet" onClick={() => setDraft(null)}>{t('common.cancel')}</button>
        </div>
      </form>
    </Panel>}

    <Panel id="req-list" title={t('insights.framework.current')} actions={data.can_manage && data.requirements.length > 0 && <button className="quiet" disabled={busy}
      onClick={() => { if (confirm(t('insights.framework.syncConfirm'))) void run(async () => t('insights.framework.synced', { count: (await api<{ updated: number }>(`orgs/${org.id}/insights/requirements/sync-targets`, { method: 'POST' })).updated })); }}>{t('insights.framework.sync')}</button>}>
      {data.requirements.length === 0 ? <p className="insights-empty">{data.can_manage ? t('insights.framework.emptyHr') : t('insights.framework.empty')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('insights.framework.colScope')}</th><th scope="col">{t('insights.framework.level')}</th><th scope="col">{t('insights.framework.colSkills')}</th>
            <th scope="col">{t('insights.framework.dueDate')}</th><th scope="col">{t('insights.col.people')}</th>{data.can_manage && <th scope="col"><span className="visually-hidden">{t('insights.framework.colActions')}</span></th>}
          </tr></thead>
          <tbody>{data.requirements.map((row) => <tr key={row.id}>
            <th scope="row">{scopeText(row)}{row.source === 'suggestion' && <> <span className="company-badge">{t('insights.framework.suggestionBadge')}</span></>}{row.note ? <small className="insights-cell-note">{row.note}</small> : null}</th>
            <td><LevelBadge level={row.level}/></td>
            <td><SkillList skills={row.skills}/></td>
            <td>{row.due_date ? f.date(row.due_date) : '—'}</td>
            <td>{f.num(row.people)}</td>
            {data.can_manage && <td className="insights-row-actions">
              <button className="quiet" disabled={busy} onClick={() => setDraft({ id: row.id, job_role: row.job_role ?? '', department_id: row.department_id ?? '', level: row.level, skills: row.skills ?? {}, due_date: row.due_date ?? '', note: row.note ?? '', source: row.source })}>{t('common.edit')}</button>
              <button className="quiet" disabled={busy} onClick={() => { if (confirm(t('insights.framework.deleteConfirm'))) void run(async () => { await api(`orgs/${org.id}/insights/requirements/${row.id}`, { method: 'DELETE' }); return t('insights.framework.deleted'); }); }}>{t('common.delete')}</button>
            </td>}
          </tr>)}</tbody>
        </table>
      </div>}
      {data.without_requirement > 0 && <p className="hint">{t('insights.framework.uncovered', { count: data.without_requirement })}</p>}
      <p className="hint">{t('insights.framework.rule')}</p>
    </Panel>

    {data.can_manage && <Panel id="req-suggest" title={t('insights.framework.suggestions')} actions={unused.length > 0 && <button disabled={busy} onClick={() => void run(async () => t('insights.framework.applied', { count: (await api<{ added: number }>(`orgs/${org.id}/insights/requirements/apply-suggestions`, { method: 'POST', body: {} })).added }))}>{t('insights.framework.applyAll', { count: unused.length })}</button>}>
      <p className="hint">{t('insights.framework.suggestionNote')}</p>
      <ul className="insights-suggestions">
        {data.suggestions.map((row) => <li key={row.job_role} className={row.in_use ? 'insights-suggestion-used' : ''}>
          <div>
            <strong>{t(`job.${row.job_role}` as AppKey)}</strong>
            {row.in_use && <small>{t('insights.framework.inUse')}</small>}
            <span className="insights-suggestion-levels"><LevelBadge level={row.level}/> <SkillList skills={row.skills}/></span>
          </div>
          {row.covered ? <span className="company-badge good">{t('insights.framework.set')}</span>
            : <button className="quiet" disabled={busy} onClick={() => setDraft({ ...emptyDraft, job_role: row.job_role, level: row.level, skills: row.skills, source: 'suggestion' })}>{t('insights.framework.use')}</button>}
        </li>)}
      </ul>
    </Panel>}
    <p className="hint">{t('insights.estimateNote')}</p>
  </div>;
}
