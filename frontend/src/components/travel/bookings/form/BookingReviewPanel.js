import React from 'react';
import { FaCheckCircle, FaSave } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import { TravelActionButton } from '../../master/TravelMasterUI';
import { Section } from './BookingFormControls';

const BookingReviewPanel = ({ customer, selectedTravelers, totals, saving, onSubmit }) => (
  <aside className="space-y-3 xl:sticky xl:top-3 xl:self-start">
    <Section titleKey="travel.booking.sections.review" icon={FaCheckCircle}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-extrabold text-slate-500">
            {t('travel.booking.fields.customer')}
          </p>
          <p className="mt-1 font-extrabold text-slate-900">{customer?.name || '-'}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-extrabold text-slate-500">
            {t('travel.booking.fields.travelers')}
          </p>
          <p className="mt-1 font-bold text-slate-900">
            {selectedTravelers.map((traveler) => traveler.fullName).join(', ') || '-'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-extrabold text-emerald-700">
              {t('travel.booking.fields.estimatedSellingBase')}
            </p>
            <p className="mt-1 text-lg font-black text-emerald-800">
              {totals.baseCurrency} {totals.selling.toLocaleString('en-GB')}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-extrabold text-rose-700">
              {t('travel.booking.fields.estimatedCostBase')}
            </p>
            <p className="mt-1 text-lg font-black text-rose-800">
              {totals.baseCurrency} {totals.cost.toLocaleString('en-GB')}
            </p>
          </div>
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
            <p className="text-xs font-extrabold text-cyan-700">
              {t('travel.booking.fields.estimatedProfit')}
            </p>
            <p className="mt-1 text-lg font-black text-cyan-800">
              {totals.baseCurrency} {totals.profit.toLocaleString('en-GB')}
            </p>
          </div>
        </div>

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {t('travel.booking.currency.estimateNote')}
        </p>
      </div>
    </Section>

    <div className="sticky bottom-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg xl:static xl:shadow-sm">
      <div className="grid grid-cols-1 gap-2">
        <TravelActionButton
          icon={FaSave}
          variant="secondary"
          disabled={saving}
          onClick={() => onSubmit('draft')}
        >
          {t('travel.booking.actions.saveDraft')}
        </TravelActionButton>
        <TravelActionButton
          icon={FaSave}
          variant="soft"
          disabled={saving}
          onClick={() => onSubmit('quotation')}
        >
          {t('travel.booking.actions.saveQuotation')}
        </TravelActionButton>
        <TravelActionButton
          icon={FaCheckCircle}
          variant="primary"
          disabled={saving}
          onClick={() => onSubmit('confirmed')}
        >
          {t('travel.booking.actions.confirm')}
        </TravelActionButton>
      </div>
    </div>
  </aside>
);

export default BookingReviewPanel;
