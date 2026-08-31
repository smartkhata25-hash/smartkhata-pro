import React from 'react';

import { t } from '../../../i18n/i18n';

const statusClasses = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  quotation: 'border-amber-200 bg-amber-50 text-amber-700',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  processing: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
};

const BookingStatusBadge = ({ status, compact = false, className = '' }) => (
  <span
    className={`inline-flex w-fit rounded-full border ${
      compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'
    } font-extrabold ${
      statusClasses[status] || statusClasses.draft
    } ${className}`}
  >
    {t(`travel.booking.status.${status || 'draft'}`)}
  </span>
);

export default BookingStatusBadge;
