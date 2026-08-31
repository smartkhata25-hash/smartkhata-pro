import React from 'react';
import { FaBell } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import { travelToneClasses } from './travelDashboardConfig';

const TravelSummaryCard = ({
  card,
  value,
  onCardClick = null,
  reminderSummary = null,
  onOpenReminderCenter = null,
}) => {
  const Icon = card.icon;
  const tone = travelToneClasses[card.tone] || travelToneClasses.neutral;

  const isUpcomingDepartures = card.key === 'upcomingDepartures';

  const canOpen = Boolean(card.route && !card.disabled && onCardClick && !isUpcomingDepartures);

  const Container = canOpen ? 'button' : 'article';

  const dueCount = Number(reminderSummary?.dueCount || 0);
  const upcomingCount = Number(reminderSummary?.upcomingCount || 0);
  const failedEmailCount = Number(reminderSummary?.failedEmailCount || 0);
  const attentionCount = Number(reminderSummary?.attentionCount || 0);

  return (
    <Container
      type={canOpen ? 'button' : undefined}
      onClick={canOpen ? () => onCardClick(card) : undefined}
      aria-disabled={!canOpen && Boolean(card.route) && !isUpcomingDepartures}
      data-travel-summary-card={card.key}
      data-travel-card-category={card.category}
      className={`group relative min-h-[126px] w-full overflow-hidden rounded-lg border ${tone.borderClass} bg-gradient-to-br ${tone.surfaceClass} p-4 text-left shadow-sm transition duration-200 ${
        canOpen
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'
          : 'cursor-default'
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.accentClass}`} />

      <div className="flex h-full flex-col justify-between gap-2 pt-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-xs font-bold uppercase tracking-normal text-slate-500">
            {t(card.labelKey)}
          </p>

          {isUpcomingDepartures ? (
            <button
              type="button"
              onClick={onOpenReminderCenter}
              title={t('travel.reminders.openCenter')}
              aria-label={t('travel.reminders.openCenter')}
              className={`relative inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-lg shadow-sm ring-2 transition hover:scale-105 ${tone.iconClass}`}
            >
              <FaBell aria-hidden="true" className="drop-shadow-sm" />

              {attentionCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-black text-white shadow">
                  {attentionCount}
                </span>
              )}
            </button>
          ) : (
            <span
              className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-lg shadow-sm ring-2 ${tone.iconClass}`}
            >
              <Icon aria-hidden="true" className="drop-shadow-sm" />
            </span>
          )}
        </div>

        {isUpcomingDepartures ? (
          <div className="min-w-0">
            <p className="truncate text-2xl font-extrabold leading-tight text-slate-950">{value}</p>

            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenReminderCenter}
                title={t('travel.reminders.dueNow')}
                className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-1.5 py-1 text-amber-700 transition hover:from-amber-100 hover:to-orange-100"
              >
                <span className="text-[11px] font-black">{dueCount.toLocaleString('en-GB')}</span>

                <span className="truncate text-[9px] font-bold">
                  {t('travel.reminders.dueNow')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenReminderCenter}
                title={t('travel.reminders.upcoming')}
                className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 px-1.5 py-1 text-cyan-700 transition hover:from-cyan-100 hover:to-sky-100"
              >
                <span className="text-[11px] font-black">
                  {upcomingCount.toLocaleString('en-GB')}
                </span>

                <span className="truncate text-[9px] font-bold">
                  {t('travel.reminders.upcoming')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenReminderCenter}
                title={t('travel.reminders.failedEmail')}
                className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-1.5 py-1 text-rose-700 transition hover:from-rose-100 hover:to-red-100"
              >
                <span className="text-[11px] font-black">
                  {failedEmailCount.toLocaleString('en-GB')}
                </span>

                <span className="truncate text-[9px] font-bold">
                  {t('travel.reminders.failedEmail')}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-2xl font-extrabold leading-tight text-slate-950">{value}</p>

            <div className={`mt-3 h-1 w-12 rounded-full bg-gradient-to-r ${tone.accentClass}`} />
          </div>
        )}
      </div>
    </Container>
  );
};

export default TravelSummaryCard;
