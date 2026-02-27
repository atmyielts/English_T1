import React, { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

export type SiteHeaderNavItem = {
  id: string;
  label: string;
  onClick: () => void;
  active?: boolean;
};

export type SiteHeaderAction = {
  id: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
};

type SiteHeaderProps = {
  navItems?: SiteHeaderNavItem[];
  actions?: SiteHeaderAction[];
  showLanguageSwitcher?: boolean;
  brandLabel?: string;
  onBrandClick?: () => void;
  className?: string;
};

const buttonBase = 'h-10 px-3.5 rounded-full text-sm font-medium border border-[#1f2937] whitespace-nowrap';

export const SiteHeader: React.FC<SiteHeaderProps> = ({
  navItems = [],
  actions = [],
  showLanguageSwitcher = true,
  brandLabel,
  onBrandClick,
  className = '',
}) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavId = useId();

  const hasMobileContent = useMemo(() => navItems.length > 0 || actions.length > 0 || showLanguageSwitcher, [actions.length, navItems.length, showLanguageSwitcher]);

  const brand = brandLabel ?? t('nav.brand');

  const runAndClose = (handler: () => void) => {
    setMobileOpen(false);
    handler();
  };

  const brandButton = (
    <button
      type="button"
      onClick={onBrandClick ?? (() => navigate('/'))}
      className="flex items-center gap-2 font-semibold tracking-tight text-gray-900 hover:text-gray-700"
    >
      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#0f172a]" />
      {brand}
    </button>
  );

  return (
    <header className={`px-6 md:px-10 pt-6 ${className}`.trim()}>
      <div className="mx-auto max-w-6xl rounded-3xl md:rounded-full border border-[#1f2937] bg-[#efe6d8]/80 px-4 py-3 backdrop-blur">
        <div className="md:hidden flex items-center justify-between gap-3">
          {brandButton}

          {hasMobileContent ? (
            <button
              type="button"
              className={`${buttonBase} md:hidden bg-white/70`}
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
            >
              {t('common.menu')}
            </button>
          ) : null}
        </div>

        <div className="hidden md:flex md:items-center md:gap-3">
          <div className="shrink-0">{brandButton}</div>

          <div className="min-w-0 flex-1">
            <nav className="flex items-center justify-center gap-2 whitespace-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`${buttonBase} ${item.active ? 'bg-[#0f172a] text-white' : 'bg-white/70 text-gray-900'}`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 whitespace-nowrap">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className={`${buttonBase} ${action.primary ? 'bg-[#0f172a] text-white' : 'bg-white/70 text-gray-900'}`}
              >
                {action.label}
              </button>
            ))}
            {showLanguageSwitcher ? <LanguageSwitcher compact /> : null}
          </div>
        </div>

        {hasMobileContent ? (
          <div
            id={mobileNavId}
            hidden={!mobileOpen}
            aria-hidden={!mobileOpen}
            className={`md:hidden mt-3 rounded-2xl border border-[#1f2937] bg-white/90 px-4 py-3 space-y-2 ${mobileOpen ? 'block' : 'hidden'}`}
          >
            {navItems.map((item) => (
              <button
                key={`mobile-${item.id}`}
                type="button"
                onClick={() => runAndClose(item.onClick)}
                className={`w-full text-left px-3 py-2 rounded-xl ${item.active ? 'bg-[#0f172a] text-white' : 'bg-white/70 border border-[#1f2937] text-sm font-semibold text-gray-900'}`}
              >
                {item.label}
              </button>
            ))}

            {actions.map((action) => (
              <button
                key={`mobile-action-${action.id}`}
                type="button"
                onClick={() => runAndClose(action.onClick)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold border border-[#1f2937] ${action.primary ? 'bg-[#0f172a] text-white' : 'bg-white/70 text-gray-900'}`}
              >
                {action.label}
              </button>
            ))}

            {showLanguageSwitcher ? <LanguageSwitcher className="w-full justify-between pt-1" compact /> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
};
