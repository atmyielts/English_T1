import React from 'react';
import { ArrowUpRight, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import {
  EXAM_FAMILIES,
  memberUrl,
  pricingPathForSlug,
  roleLabelKey,
  type ExamFamilyKey,
} from '../../content/examFamilies';

type ProductLike = { metadata?: Record<string, unknown> | null };

type ExamFamilyCardsProps = {
  families?: ExamFamilyKey[];
  productsBySlug?: Map<string, ProductLike>;
  /** Opens an external service url (defaults to a full-page navigation). */
  onOpen?: (url: string) => void;
  showHeading?: boolean;
  compact?: boolean;
  className?: string;
};

const isExternal = (href: string): boolean => /^https?:\/\//i.test(href);

export const ExamFamilyCards: React.FC<ExamFamilyCardsProps> = ({
  families,
  productsBySlug,
  onOpen,
  showHeading = true,
  compact = false,
  className = '',
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const list = EXAM_FAMILIES.filter((family) => !families || families.includes(family.key));
  const single = list.length === 1;

  const open = (href: string) => {
    if (!isExternal(href)) {
      navigate(href);
      return;
    }
    if (onOpen) onOpen(href);
    else window.location.assign(href);
  };

  return (
    <div className={className} data-testid="exam-families">
      {showHeading ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Layers size={14} /> {t('examFamily.badge')}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-2">{t('examFamily.title')}</h2>
          <p className="text-gray-600 mt-1 max-w-3xl">{t('examFamily.desc')}</p>
        </div>
      ) : null}

      <div className={`${showHeading ? 'mt-6' : ''} grid grid-cols-1 ${!compact && !single ? 'lg:grid-cols-3' : ''} gap-4`}>
        {list.map((family) => (
          <section
            key={family.key}
            aria-label={t(family.titleKey)}
            className="min-w-0 rounded-3xl border border-gray-900 bg-white/90 p-4 md:p-5 flex flex-col"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-gray-900">{t(family.titleKey)}</h3>
              {!compact ? (
                <a
                  href={family.discoveryPath}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    navigate(family.discoveryPath);
                  }}
                  className="text-xs font-semibold text-gray-600 underline underline-offset-2"
                >
                  {t('examFamily.learnMore')}
                </a>
              ) : null}
            </div>
            <ul className={`mt-3 flex-1 ${single && !compact ? 'grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4' : 'space-y-2'}`}>
              {family.members.map((member) => {
                const complete = member.role === 'complete';
                const url = memberUrl(member, productsBySlug);
                return (
                  <li
                    key={member.slug}
                    className={[
                      'rounded-2xl border p-3',
                      complete ? 'border-amber-300 bg-amber-50' : 'border-gray-900/10 bg-white',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          'text-[11px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 border',
                          complete ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-gray-100 text-gray-700 border-gray-200',
                        ].join(' ')}
                      >
                        {t(roleLabelKey(member.role))}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{member.name}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 [overflow-wrap:anywhere]">{t(member.descKey)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!complete ? (
                        <button
                          type="button"
                          onClick={() => open(url)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#0f172a] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {t('examFamily.open')} <ArrowUpRight size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => open(pricingPathForSlug(member.slug))}
                        className={[
                          'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold border',
                          complete ? 'bg-amber-600 border-amber-700 text-white' : 'border-gray-900 bg-white text-gray-900',
                        ].join(' ')}
                      >
                        {complete ? t('examFamily.seePlan', { name: member.name }) : t('examFamily.prices')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};
