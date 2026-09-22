import React from 'react';

import { t } from '../../../i18n/i18n';
import { weavingToneClasses } from './weavingDashboardConfig';

const WeavingSummaryCard = ({ card, value, onCardClick = null }) => {
  const Icon = card.icon;
  const tone = weavingToneClasses[card.tone] || weavingToneClasses.production;
  const isClickable = Boolean(card.route && onCardClick);

  const handleCardClick = () => {
    if (isClickable) {
      onCardClick(card);
    }
  };

  const handleCardKeyDown = (event) => {
    if (!isClickable) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCardClick();
    }
  };

  return (
    <article
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleCardClick : undefined}
      onKeyDown={isClickable ? handleCardKeyDown : undefined}
      data-weaving-summary-card={card.key}
      className={`group relative min-h-[126px] w-full overflow-hidden rounded-lg border ${
        tone.borderClass
      } bg-gradient-to-br ${tone.surfaceClass} p-4 text-left shadow-sm transition duration-200 ${
        isClickable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500'
          : 'cursor-default'
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.accentClass}`} />

      <div className="flex h-full flex-col justify-between gap-3 pt-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-xs font-bold uppercase tracking-normal text-slate-500">
            {t(card.labelKey)}
          </p>

          <span
            className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-lg shadow-sm ring-2 ${tone.iconClass}`}
          >
            <Icon aria-hidden="true" className="drop-shadow-sm" />
          </span>
        </div>

        <div className="min-w-0">
          <p
            className={card.format === 'looms'
              ? 'text-base font-extrabold leading-snug text-slate-950'
              : 'truncate text-2xl font-extrabold leading-tight text-slate-950'}
          >
            {value}
          </p>
          <div className={`mt-3 h-1 w-12 rounded-full bg-gradient-to-r ${tone.accentClass}`} />
        </div>
      </div>
    </article>
  );
};

export default WeavingSummaryCard;
