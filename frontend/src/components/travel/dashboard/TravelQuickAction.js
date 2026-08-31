import React from 'react';
import { useNavigate } from 'react-router-dom';

import { t } from '../../../i18n/i18n';
import { travelToneClasses } from './travelDashboardConfig';

const TravelQuickAction = ({ action }) => {
  const Icon = action.icon;
  const tone = travelToneClasses[action.tone] || travelToneClasses.neutral;
  const navigate = useNavigate();
  const canOpen = Boolean(action.route && !action.disabled);

  return (
    <button
      type="button"
      disabled={action.disabled}
      aria-disabled={action.disabled}
      onClick={canOpen ? () => navigate(action.route) : undefined}
      title={action.disabled ? t('travel.dashboard.actions.unavailableHint') : t('travel.dashboard.actions.open')}
      data-travel-quick-action={action.key}
      className={`relative min-h-[96px] overflow-hidden rounded-lg border ${tone.borderClass} bg-gradient-to-br ${tone.surfaceClass} p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
        canOpen ? 'hover:-translate-y-0.5 hover:shadow-md' : 'disabled:cursor-not-allowed disabled:opacity-90'
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.accentClass}`} />

      <div className="flex h-full items-start gap-3 pt-1">
        <span className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-lg shadow-sm ring-2 ${tone.iconClass}`}>
          <Icon aria-hidden="true" className="drop-shadow-sm" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">{t(action.labelKey)}</span>
          <span className={`mt-3 inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold ${tone.textClass} ring-1 ring-white/70`}>
            {t(action.disabled ? 'travel.dashboard.actions.comingSoon' : 'travel.dashboard.actions.open')}
          </span>
        </span>
      </div>
    </button>
  );
};

export default TravelQuickAction;
