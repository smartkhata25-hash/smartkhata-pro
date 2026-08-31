import React from 'react';
import { FaSave } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import { Field, Section, Textarea } from './BookingFormControls';

const BookingNotesSection = ({ notes, internalNotes, onChange }) => (
  <Section titleKey="travel.booking.sections.notes" icon={FaSave}>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field labelKey="travel.fields.notes">
        <Textarea
          value={notes}
          onChange={(event) => onChange('notes', event.target.value)}
          placeholder={t('travel.placeholders.notes')}
        />
      </Field>
      <Field labelKey="travel.booking.fields.internalNotes">
        <Textarea
          value={internalNotes}
          onChange={(event) => onChange('internalNotes', event.target.value)}
          placeholder={t('travel.booking.placeholders.internalNotes')}
        />
      </Field>
    </div>
  </Section>
);

export default BookingNotesSection;
