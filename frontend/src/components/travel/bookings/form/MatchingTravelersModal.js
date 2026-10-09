import React from 'react';
import { FaIdCard, FaUsers } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import { TravelActionButton } from '../../master/TravelMasterUI';

const MatchingTravelersModal = ({ open, customerName, travelers = [], onCancel, onSelect }) => {
  if (!open) return null;

  const message = t('travel.booking.customerTraveler.matchingMessage').replace(
    '{name}',
    customerName || '-'
  );

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="matching-travelers-title">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-cyan-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-gradient-to-r from-cyan-700 to-blue-700 px-5 py-4 text-white">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><FaUsers aria-hidden="true" /></span>
          <div>
            <h2 id="matching-travelers-title" className="text-lg font-black">
              {t('travel.booking.customerTraveler.matchingTitle')}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-cyan-50">
              {t('travel.booking.customerTraveler.selectCorrect')}
            </p>
          </div>
        </div>

        <div className="p-5">
          <p className="mb-4 text-sm font-semibold leading-6 text-slate-700">{message}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {travelers.map((traveler) => {
              const meta = [
                traveler.passportNumber && `${t('travel.fields.passportNumber')}: ${traveler.passportNumber}`,
                traveler.mobile && `${t('travel.fields.mobile')}: ${traveler.mobile}`,
                traveler.cnic && `${t('travel.fields.cnic')}: ${traveler.cnic}`,
              ].filter(Boolean);

              return (
                <button
                  type="button"
                  key={traveler._id}
                  onClick={() => onSelect(traveler)}
                  className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/60 hover:shadow-sm"
                >
                  <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700"><FaIdCard aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900">
                      {traveler.fullName || traveler.name || '-'}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      {meta.join(' · ') || t('travel.booking.customerTraveler.noIdentityDetails')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 p-4">
          <TravelActionButton variant="secondary" onClick={onCancel}>
            {t('travel.common.cancel')}
          </TravelActionButton>
        </div>
      </div>
    </div>
  );
};

export default MatchingTravelersModal;
