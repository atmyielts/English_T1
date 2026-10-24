import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { useResource } from '../lib/useResource';
import { getLeague, LEAGUE_TIERS, saveLeagueSettings, timeLeft, type LeagueResponse, type LeagueTier } from '../lib/xp';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, Tag } from '../ui/kit';
import '../xp.css';

const neighbour = (tier: LeagueTier, step: 1 | -1): LeagueTier | null =>
  LEAGUE_TIERS[LEAGUE_TIERS.indexOf(tier) + step] ?? null;

const TimeLeft = ({ endsAt }: { endsAt: string }) => {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const left = timeLeft(endsAt, now);
  if (left.days + left.hours + left.minutes === 0) return <Tag>{t('xp.league.ending')}</Tag>;
  return <Tag>{left.days > 0 ? t('xp.league.left', left) : t('xp.league.leftHours', left)}</Tag>;
};

const LastWeek = ({ last }: { last: NonNullable<LeagueResponse['last_week']> }) => {
  const t = useT();
  const tier = t(`xp.tier.${last.tier}`);
  const text = last.rank === null
    ? t('xp.league.last.noRank', { tier })
    : t(`xp.league.last.${last.outcome ?? 'stayed'}`, { rank: last.rank, tier });
  return <p className={last.outcome === 'promoted' ? 'en-notice' : 'en-explain'} style={{ margin: 0 }}>{text}</p>;
};

const Ranking = ({ data }: { data: LeagueResponse }) => {
  const t = useT();
  const group = data.group!;
  return (
    <ol className="en-league-list" aria-label={t('xp.league.ranking')}>
      {group.members.map((member, index) => {
        const previous = group.members[index - 1];
        const zoneStarts = member.zone !== 'stay' && previous?.zone !== member.zone;
        const name = member.name === 'Learner' ? t('xp.league.anon') : member.name;
        return (
          <Fragment key={`${member.rank}-${member.name}`}>
            {zoneStarts ? (
              <li className={`en-league-zone is-${member.zone}`} aria-hidden="true">{t(`xp.league.zone.${member.zone}`)}</li>
            ) : null}
            <li className={`en-league-row is-${member.zone} ${member.me ? 'is-me' : ''}`.trim()} aria-current={member.me ? 'true' : undefined}>
              <span className="en-league-rank"><span className="visually-hidden">{t('xp.league.place', { rank: member.rank })}</span><span aria-hidden="true">{member.rank}</span></span>
              <span className="en-league-name">
                {name}{member.me ? <small> ({t('xp.league.you')})</small> : null}
                {member.zone !== 'stay' ? <span className="visually-hidden">, {t(`xp.league.zone.${member.zone}`)}</span> : null}
              </span>
              <span className="en-league-xp">{t('xp.today.value', { xp: member.xp })}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
};

export const LeaguePage = () => {
  const t = useT();
  const league = useResource((signal) => getLeague(signal), []);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<unknown>(null);
  const data = league.data;

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await saveLeagueSettings({ opted_out: false });
      league.reload();
    } catch (cause) {
      setJoinError(cause);
    } finally {
      setJoining(false);
    }
  };

  if (!data) {
    return (
      <>
        <PageHeader eyebrow={t('xp.league.eyebrow')} title={t('xp.league.titleNone')} />
        {league.error ? <ErrorState error={league.error} onRetry={league.reload} /> : <section className="en-panel"><Loading lines={6} /></section>}
      </>
    );
  }

  if (!data.tier || !data.group) {
    return (
      <>
        <PageHeader eyebrow={t('xp.league.eyebrow')} title={t('xp.league.titleNone')} lead={t('xp.league.lead')} />
        <section className="en-panel">
          <EmptyState
            title={t('xp.league.out.title')}
            body={t('xp.league.out.body')}
            action={<button type="button" disabled={joining} onClick={() => void join()}>{joining ? t('common.saving') : t('xp.league.out.cta')}</button>}
          />
          {joinError ? <ErrorState error={joinError} /> : null}
        </section>
      </>
    );
  }

  const tierName = t(`xp.tier.${data.tier}`);
  const up = neighbour(data.tier, 1);
  const down = neighbour(data.tier, -1);
  const me = data.group.members.find((member) => member.me);

  return (
    <>
      <PageHeader
        eyebrow={t('xp.league.eyebrow')}
        title={t('xp.league.title', { tier: tierName })}
        lead={t('xp.league.lead')}
        actions={<TimeLeft endsAt={data.week.ends_at} />}
      />
      {league.error ? <ErrorState error={league.error} onRetry={league.reload} /> : null}

      <div className="en-grid-2">
        <Panel title={t('xp.league.ranking')} aside={<span>{data.group.size}/{data.group.capacity}</span>}>
          {data.last_week ? <LastWeek last={data.last_week} /> : null}
          <Ranking data={data} />
          {data.group.size === 1 ? <p className="hint">{t('xp.league.alone')}</p> : null}
          {me && me.xp === 0 ? (
            <div className="en-actions">
              <p className="hint" style={{ margin: 0 }}>{t('xp.league.noXp')}</p>
              <Link className="en-button" to="/today">{t('xp.league.practise')}</Link>
            </div>
          ) : null}
        </Panel>

        <div className="en-stack">
          <Panel title={t('xp.league.current')}>
            <ol className="en-league-ladder" aria-label={t('xp.league.ladder')}>
              {data.tiers.map((tier) => (
                <li key={tier} className={tier === data.tier ? 'is-current' : undefined} aria-current={tier === data.tier ? 'true' : undefined}>
                  {t(`xp.tier.${tier}`)}
                </li>
              ))}
            </ol>
            <p className="hint">
              {up ? t('xp.league.promoteHint', { count: data.group.promote, tier: t(`xp.tier.${up}`) }) : t('xp.league.topHint', { count: data.group.demote })}
            </p>
            <p className="hint">
              {down ? t('xp.league.demoteHint', { count: data.group.demote, tier: t(`xp.tier.${down}`) }) : t('xp.league.bronzeHint')}
            </p>
            <p className="hint">{t('xp.today.how')}</p>
          </Panel>
          <Panel title={t('xp.league.settings')}>
            <p className="hint">{t('xp.league.privacy')}</p>
            <div className="en-actions"><Link className="en-button-quiet" to="/settings">{t('nav.settings')}</Link></div>
          </Panel>
        </div>
      </div>
    </>
  );
};
