import React from 'react';
import { FaPlus, FaUsers } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import { TravelActionButton } from '../../master/TravelMasterUI';
import { Section } from './BookingFormControls';

const BookingTravelersSection = ({
  travelers,
  selectedTravelerIds,
  canManageTravelers,
  onToggleTraveler,
  onQuickAdd,
  onAddDetails,
}) => (
  <Section titleKey="travel.booking.sections.travelers" icon={FaUsers}>
    <div className="mb-3 flex flex-wrap justify-end gap-2">
      {canManageTravelers && (
        <>
          <TravelActionButton icon={FaPlus} variant="soft" onClick={onQuickAdd}>
            {t('travel.common.quickAdd')}
          </TravelActionButton>
          <TravelActionButton icon={FaUsers} variant="secondary" onClick={onAddDetails}>
            {t('travel.common.addWithDetails')}
          </TravelActionButton>
        </>
      )}
    </div>

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {travelers.slice(0, 18).map((traveler) => {
        const selected = selectedTravelerIds.some((idValue) => String(idValue) === String(traveler._id));

        return (
          <button
            type="button"
            key={traveler._id}
            onClick={() => onToggleTraveler(traveler._id)}
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
  </Section>
);

export default BookingTravelersSection;
