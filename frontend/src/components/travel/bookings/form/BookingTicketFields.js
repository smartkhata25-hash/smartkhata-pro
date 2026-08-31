import React from 'react';

import { t } from '../../../../i18n/i18n';
import { journeyTypeOptions } from '../travelBookingConfig';
import { Field, Input, Select } from './BookingFormControls';

const BookingTicketFields = ({ item, index, onUpdateItemDetails }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <Field labelKey="travel.booking.fields.journeyType">
      <Select
        value={item.ticketDetails.journeyType}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'journeyType', event.target.value)}
      >
        {journeyTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </Select>
    </Field>
    <Field labelKey="travel.booking.fields.airline">
      <Input
        value={item.ticketDetails.airline}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'airline', event.target.value)}
        placeholder={t('travel.booking.placeholders.airline')}
      />
    </Field>
    <Field labelKey="travel.booking.fields.travelClass">
      <Input
        value={item.ticketDetails.travelClass}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'travelClass', event.target.value)}
        placeholder={t('travel.booking.placeholders.travelClass')}
      />
    </Field>
    <Field labelKey="travel.booking.fields.origin">
      <Input
        value={item.ticketDetails.origin}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'origin', event.target.value)}
        placeholder="LHE"
      />
    </Field>
    <Field labelKey="travel.booking.fields.destination">
      <Input
        value={item.ticketDetails.destination}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'destination', event.target.value)}
        placeholder="JED"
      />
    </Field>
    <Field labelKey="travel.booking.fields.departureDateTime">
      <Input
        type="datetime-local"
        value={item.ticketDetails.departureDateTime}
        onChange={(event) =>
          onUpdateItemDetails(index, 'ticketDetails', 'departureDateTime', event.target.value)
        }
      />
    </Field>
    {item.ticketDetails.journeyType !== 'one_way' && (
      <>
        <Field labelKey="travel.booking.fields.returnOrigin">
          <Input
            value={item.ticketDetails.returnOrigin}
            onChange={(event) =>
              onUpdateItemDetails(index, 'ticketDetails', 'returnOrigin', event.target.value)
            }
            placeholder="JED"
          />
        </Field>
        <Field labelKey="travel.booking.fields.returnDestination">
          <Input
            value={item.ticketDetails.returnDestination}
            onChange={(event) =>
              onUpdateItemDetails(index, 'ticketDetails', 'returnDestination', event.target.value)
            }
            placeholder="LHE"
          />
        </Field>
        <Field labelKey="travel.booking.fields.returnDateTime">
          <Input
            type="datetime-local"
            value={item.ticketDetails.returnDateTime}
            onChange={(event) =>
              onUpdateItemDetails(index, 'ticketDetails', 'returnDateTime', event.target.value)
            }
          />
        </Field>
      </>
    )}
    <Field labelKey="travel.booking.fields.pnr">
      <Input
        value={item.ticketDetails.pnr}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'pnr', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.ticketNumber">
      <Input
        value={item.ticketDetails.ticketNumber}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'ticketNumber', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.baggage">
      <Input
        value={item.ticketDetails.baggage}
        onChange={(event) => onUpdateItemDetails(index, 'ticketDetails', 'baggage', event.target.value)}
      />
    </Field>
  </div>
);

export default BookingTicketFields;
