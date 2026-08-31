import React from 'react';

import { TravelRelationPicker } from '../../master/TravelMasterUI';
import { Field, Input } from './BookingFormControls';

const BookingHotelFields = ({
  item,
  index,
  hotels,
  canManageHotels,
  onOpenModal,
  onUpdateItemDetails,
}) => (
  <div className="space-y-3">
    <TravelRelationPicker
      labelKey="travel.fields.hotel"
      value={item.hotelDetails.hotelId}
      onChange={(value) => onUpdateItemDetails(index, 'hotelDetails', 'hotelId', value)}
      records={hotels.filter((hotel) => hotel.isActive !== false)}
      getLabel={(hotel) => hotel.name}
      getMeta={(hotel) => [hotel.city, hotel.country].filter(Boolean).join(', ')}
      searchPlaceholderKey="travel.hotels.search"
      emptyKey="travel.hotels.empty"
      onQuickAdd={canManageHotels ? (query) => onOpenModal('hotel', 'quick', { query, itemIndex: index }) : null}
      onAddDetails={canManageHotels ? (query) => onOpenModal('hotel', 'details', { query, itemIndex: index }) : null}
    />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Field labelKey="travel.booking.fields.checkIn">
        <Input
          type="date"
          value={item.hotelDetails.checkIn}
          onChange={(event) => onUpdateItemDetails(index, 'hotelDetails', 'checkIn', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.checkOut">
        <Input
          type="date"
          value={item.hotelDetails.checkOut}
          onChange={(event) => onUpdateItemDetails(index, 'hotelDetails', 'checkOut', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.rooms">
        <Input
          type="number"
          min="0"
          value={item.hotelDetails.rooms}
          onChange={(event) => onUpdateItemDetails(index, 'hotelDetails', 'rooms', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.roomType">
        <Input
          value={item.hotelDetails.roomType}
          onChange={(event) => onUpdateItemDetails(index, 'hotelDetails', 'roomType', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.adults">
        <Input
          type="number"
          min="0"
          value={item.hotelDetails.adults}
          onChange={(event) => onUpdateItemDetails(index, 'hotelDetails', 'adults', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.children">
        <Input
          type="number"
          min="0"
          value={item.hotelDetails.children}
          onChange={(event) => onUpdateItemDetails(index, 'hotelDetails', 'children', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.confirmationNumber">
        <Input
          value={item.hotelDetails.confirmationNumber}
          onChange={(event) =>
            onUpdateItemDetails(index, 'hotelDetails', 'confirmationNumber', event.target.value)
          }
        />
      </Field>
    </div>
  </div>
);

export default BookingHotelFields;
