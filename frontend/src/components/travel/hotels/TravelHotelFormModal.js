import React from 'react';
import { FaHotel } from 'react-icons/fa';
import { TravelFormModal, TravelRelationPicker } from '../master/TravelMasterUI';
import { hotelFields } from './travelHotelConfig';

const TravelHotelFormModal = ({
  activeVendors = [],
  canManageVendors = false,
  editingHotel = null,
  values = {},
  onChange,
  onQuickAddVendor,
  onAddVendorDetails,
  ...props
}) => (
  <TravelFormModal
    {...props}
    titleKey="travel.hotels.formTitle"
    modeKey={editingHotel ? 'travel.common.edit' : 'travel.common.addWithDetails'}
    fields={hotelFields}
    values={values}
    onChange={onChange}
    submitIcon={FaHotel}
  >
    <TravelRelationPicker
      labelKey="travel.fields.vendor"
      value={values.vendorId || ''}
      onChange={(value) => onChange('vendorId', value)}
      records={activeVendors}
      getLabel={(vendor) => vendor?.name || '-'}
      getMeta={(vendor) => vendor?.travelVendorType || vendor?.phone || vendor?.email || ''}
      searchPlaceholderKey="travel.vendors.search"
      emptyKey="travel.vendors.empty"
      onQuickAdd={canManageVendors ? onQuickAddVendor : null}
      onAddDetails={canManageVendors ? onAddVendorDetails : null}
    />
  </TravelFormModal>
);

export default TravelHotelFormModal;
