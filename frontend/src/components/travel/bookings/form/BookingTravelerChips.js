import React from 'react';
import { FaPlus } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import { TravelActionButton } from '../../master/TravelMasterUI';

const BookingTravelerChips = ({
  item,
  index,
  travelers,
  canManageTravelers,
  onQuickAddTraveler,
  onToggleItemTraveler,
}) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-extrabold text-slate-600">{t('travel.booking.fields.itemTravelers')}</p>
      {canManageTravelers && (
        <TravelActionButton icon={FaPlus} variant="soft" onClick={onQuickAddTraveler}>
          {t('travel.common.quickAdd')}
        </TravelActionButton>
      )}
    </div>

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {travelers.slice(0, 12).map((traveler) => {
        const selected = (item.travelerIds || []).some((idValue) => String(idValue) === String(traveler._id));

        return (
          <button
            type="button"
            key={traveler._id}
            onClick={() => onToggleItemTraveler(index, traveler._id)}
            className={`min-w-0 rounded-lg border px-3 py-2 text-left ${
              selected
                ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <span className="block truncate text-sm font-extrabold">{traveler.fullName}</span>
            <span className="block truncate text-xs font-semibold text-slate-500">
              {traveler.passportNumber || traveler.mobile || '-'}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default BookingTravelerChips;
