import React from 'react';
import { FaTags } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import { Section } from './BookingFormControls';
import { serviceTypeCards } from './bookingFormConfig';

const BookingServiceTypeSelector = ({ serviceType, onChange }) => (
  <Section titleKey="travel.booking.sections.serviceType" icon={FaTags}>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {serviceTypeCards.map((card) => {
        const Icon = card.icon;
        const active = serviceType === card.value;

        return (
          <button
            key={card.value}
            type="button"
            onClick={() => onChange(card.value)}
            className={`min-h-24 rounded-lg border p-3 text-left transition ${
              active
                ? 'border-cyan-400 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-100'
                : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/50'
            }`}
          >
            <Icon aria-hidden="true" className="mb-2 text-lg" />
            <span className="block text-sm font-extrabold">{t(card.labelKey)}</span>
          </button>
        );
      })}
    </div>
  </Section>
);

export default BookingServiceTypeSelector;
