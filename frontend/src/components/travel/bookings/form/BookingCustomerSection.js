import React from 'react';
import { FaUser } from 'react-icons/fa';

import { TravelRelationPicker } from '../../master/TravelMasterUI';
import { Section } from './BookingFormControls';

const BookingCustomerSection = ({
  customerId,
  customers,
  onChange,
  onQuickAdd,
  onAddDetails,
}) => (
  <Section titleKey="travel.booking.sections.customer" icon={FaUser}>
    <TravelRelationPicker
      labelKey="travel.booking.fields.customer"
      value={customerId}
      onChange={onChange}
      records={customers}
      getLabel={(record) => record.name}
      getMeta={(record) => record.phone || record.email}
      searchPlaceholderKey="travel.booking.placeholders.customerSearch"
      emptyKey="travel.booking.empty.customers"
      onQuickAdd={onQuickAdd}
      onAddDetails={onAddDetails}
    />
  </Section>
);

export default BookingCustomerSection;
