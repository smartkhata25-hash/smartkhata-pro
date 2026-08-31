import React from 'react';

import { DEFAULT_TRAVEL_CURRENCY } from '../../../../config/travelConfig';
import { t } from '../../../../i18n/i18n';
import { travelBookingCurrencyOptions } from '../travelBookingConfig';
import { Field, Input, Select } from './BookingFormControls';

const BookingMoneyFields = ({ item, index, onUpdateItemField }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
    <Field labelKey="travel.booking.fields.sellingPrice">
      <Input
        type="number"
        min="0"
        step="0.01"
        value={item.sellingPrice}
        onChange={(event) => onUpdateItemField(index, 'sellingPrice', event.target.value)}
        placeholder={t('travel.placeholders.amount')}
      />
    </Field>
    <Field labelKey="travel.booking.fields.sellingCurrency">
      <Select
        value={item.sellingCurrency || DEFAULT_TRAVEL_CURRENCY}
        onChange={(event) => onUpdateItemField(index, 'sellingCurrency', event.target.value)}
      >
        {travelBookingCurrencyOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </Select>
    </Field>
    <Field labelKey="travel.booking.fields.costPrice">
      <Input
        type="number"
        min="0"
        step="0.01"
        value={item.costPrice}
        onChange={(event) => onUpdateItemField(index, 'costPrice', event.target.value)}
        placeholder={t('travel.placeholders.amount')}
      />
    </Field>
    <Field labelKey="travel.booking.fields.costCurrency">
      <Select
        value={item.costCurrency || DEFAULT_TRAVEL_CURRENCY}
        onChange={(event) => onUpdateItemField(index, 'costCurrency', event.target.value)}
      >
        {travelBookingCurrencyOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </Select>
    </Field>
  </div>
);

export default BookingMoneyFields;
