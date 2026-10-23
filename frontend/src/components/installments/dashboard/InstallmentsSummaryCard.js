import React from 'react';

import { t } from '../../../i18n/i18n';
import { formatInstallmentsMoney } from '../../../utils/installmentsMoney';

const InstallmentsSummaryCard = ({ card, value, loading = false, unavailable = false, onClick = null }) => {
  const Icon = card.icon;
  const Component = onClick ? 'button' : 'article';
  return (
    <Component type={onClick ? 'button' : undefined} onClick={onClick || undefined} aria-label={onClick ? t(`installments.dashboard.cards.${card.key}`) : undefined} className={`group relative min-h-[126px] w-full overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br ${card.gradient} p-4 text-start text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.7)] transition duration-200 sm:p-5 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200' : ''}`}>
      <div className={`absolute -right-9 -top-10 h-32 w-32 rounded-full ${card.glow} blur-xl`} />
      <div className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-slate-950/20 blur-lg" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <div className="relative flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-3"><p className="max-w-[13rem] text-sm font-bold leading-5 text-white/95">{t(`installments.dashboard.cards.${card.key}`)}</p><span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-lg shadow-slate-950/10 ring-1 ring-white/35 backdrop-blur-sm"><Icon aria-hidden="true" className="text-lg" /></span></div>
        <div className="text-2xl font-black tracking-tight drop-shadow-sm sm:text-3xl" aria-label={loading ? 'Loading' : undefined}>{loading ? '…' : unavailable ? '—' : formatInstallmentsMoney(value)}</div>
      </div>
    </Component>
  );
};

export default InstallmentsSummaryCard;
