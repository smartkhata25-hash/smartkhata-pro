import React from 'react';

import { t } from '../../../../i18n/i18n';
import { Field, Input, Select } from './BookingFormControls';

const BookingVisaFields = ({
  item,
  index,
  travelers,
  onUpdateItem,
  onUpdateItemDetails,
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <Field labelKey="travel.booking.fields.visaTraveler">
      <Select
        value={item.visaDetails.travelerId || item.travelerIds?.[0] || ''}
        onChange={(event) => {
          onUpdateItemDetails(index, 'visaDetails', 'travelerId', event.target.value);
          onUpdateItem(index, (currentItem) => ({
            ...currentItem,
            travelerIds: event.target.value ? [event.target.value] : [],
            visaDetails: {
              ...(currentItem.visaDetails || {}),
              travelerId: event.target.value,
            },
          }));
        }}
      >
        <option value="">{t('travel.booking.placeholders.selectTraveler')}</option>
        {travelers.map((traveler) => (
          <option key={traveler._id} value={traveler._id}>
            {traveler.fullName}
          </option>
        ))}
      </Select>
    </Field>
    <Field labelKey="travel.booking.fields.country">
      <Input
        value={item.visaDetails.country}
        onChange={(event) => onUpdateItemDetails(index, 'visaDetails', 'country', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.visaType">
      <Input
        value={item.visaDetails.visaType}
        onChange={(event) => onUpdateItemDetails(index, 'visaDetails', 'visaType', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.duration">
      <Input
        value={item.visaDetails.duration}
        onChange={(event) => onUpdateItemDetails(index, 'visaDetails', 'duration', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.governmentFee">
      <Input
        type="number"
        min="0"
        step="0.01"
        value={item.visaDetails.governmentFee}
        onChange={(event) => onUpdateItemDetails(index, 'visaDetails', 'governmentFee', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.serviceFee">
      <Input
        type="number"
        min="0"
        step="0.01"
        value={item.visaDetails.serviceFee}
        onChange={(event) => onUpdateItemDetails(index, 'visaDetails', 'serviceFee', event.target.value)}
      />
    </Field>
  </div>
);

export default BookingVisaFields;
