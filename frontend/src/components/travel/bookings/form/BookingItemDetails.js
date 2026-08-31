import React from 'react';

import { t } from '../../../../i18n/i18n';
import { Field, Textarea } from './BookingFormControls';
import BookingHotelFields from './BookingHotelFields';
import BookingTicketFields from './BookingTicketFields';
import BookingTransportFields from './BookingTransportFields';
import BookingUmrahFields from './BookingUmrahFields';
import BookingVisaFields from './BookingVisaFields';

const BookingItemDetails = ({
  item,
  index,
  travelers,
  hotels,
  services,
  vendors,
  canManageHotels,
  onOpenModal,
  onUpdateItem,
  onUpdateItemField,
  onUpdateItemDetails,
  onUpdateUmrahComponent,
}) => {
  if (item.itemType === 'air_ticket') {
    return (
      <BookingTicketFields
        item={item}
        index={index}
        onUpdateItemDetails={onUpdateItemDetails}
      />
    );
  }

  if (item.itemType === 'visit_visa') {
    return (
      <BookingVisaFields
        item={item}
        index={index}
        travelers={travelers}
        onUpdateItem={onUpdateItem}
        onUpdateItemDetails={onUpdateItemDetails}
      />
    );
  }

  if (item.itemType === 'hotel') {
    return (
      <BookingHotelFields
        item={item}
        index={index}
        hotels={hotels}
        canManageHotels={canManageHotels}
        onOpenModal={onOpenModal}
        onUpdateItemDetails={onUpdateItemDetails}
      />
    );
  }

  if (item.itemType === 'umrah_package') {
    return (
      <BookingUmrahFields
        item={item}
        index={index}
        services={services}
        vendors={vendors}
        onUpdateItem={onUpdateItem}
        onUpdateItemDetails={onUpdateItemDetails}
        onUpdateUmrahComponent={onUpdateUmrahComponent}
      />
    );
  }

  if (item.itemType === 'transport') {
    return (
      <BookingTransportFields
        item={item}
        index={index}
        onUpdateItemDetails={onUpdateItemDetails}
      />
    );
  }

  return (
    <Field labelKey="travel.fields.description">
      <Textarea
        value={item.description}
        onChange={(event) => onUpdateItemField(index, 'description', event.target.value)}
        placeholder={t('travel.placeholders.description')}
      />
    </Field>
  );
};

export default BookingItemDetails;
