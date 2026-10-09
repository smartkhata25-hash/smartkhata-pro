import React from 'react';
import { FaHotel } from 'react-icons/fa';
import { TravelFormModal, TravelRelationPicker } from '../master/TravelMasterUI';
import { hotelFields } from './travelHotelConfig';
import TravelCityAutocomplete from '../cities/TravelCityAutocomplete';

const TravelHotelFormModal = ({
  activeVendors = [],
  canManageVendors = false,
  editingHotel = null,
  values = {},
  onChange,
  onQuickAddVendor,
  onAddVendorDetails,
  cities,
  hotels = [],
  canManageCities = false,
  onCreateCity,
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
    {Array.isArray(cities) ? (
      <TravelCityAutocomplete
        value={values.city || ''}
        onChange={(value) => onChange('city', value)}
        cities={cities}
        hotels={hotels}
        onCreate={canManageCities ? onCreateCity : null}
        disabled={props.submitting}
      />
    ) : (
      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-extrabold text-slate-500">City</span>
        <input
          value={values.city || ''}
          onChange={(event) => onChange('city', event.target.value)}
          required
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        />
      </label>
    )}

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
