import React from 'react';

import { Field, Input } from './BookingFormControls';

const BookingTransportFields = ({ item, index, onUpdateItemDetails }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
    <Field labelKey="travel.booking.fields.pickup">
      <Input
        value={item.transportDetails.pickup}
        onChange={(event) => onUpdateItemDetails(index, 'transportDetails', 'pickup', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.dropoff">
      <Input
        value={item.transportDetails.dropoff}
        onChange={(event) => onUpdateItemDetails(index, 'transportDetails', 'dropoff', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.dateTime">
      <Input
        type="datetime-local"
        value={item.transportDetails.dateTime}
        onChange={(event) => onUpdateItemDetails(index, 'transportDetails', 'dateTime', event.target.value)}
      />
    </Field>
    <Field labelKey="travel.booking.fields.vehicleType">
      <Input
        value={item.transportDetails.vehicleType}
        onChange={(event) => onUpdateItemDetails(index, 'transportDetails', 'vehicleType', event.target.value)}
      />
    </Field>
  </div>
);

export default BookingTransportFields;
