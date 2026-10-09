import React from 'react';
import { FaBed } from 'react-icons/fa';

import { TravelFormModal } from '../master/TravelMasterUI';

import TravelVendorFormModal from '../vendors/TravelVendorFormModal';

import { quickHotelFields } from './travelHotelConfig';
import TravelHotelFormModal from './TravelHotelFormModal';
import TravelCityAutocomplete from '../cities/TravelCityAutocomplete';

const TravelHotelModals = ({
  activeVendors = [],
  categories = [],

  editingHotel,
  editingVendor,

  formError,

  hotelModalOpen,
  hotelValues,

  onHotelChange,
  onHotelClose,
  onHotelSubmit,

  onOpenVendorDetails,
  onOpenQuickVendor,

  onQuickHotelChange,
  onQuickHotelClose,
  onQuickHotelSubmit,

  onVendorChange,
  onVendorClose,
  onVendorSubmit,

  quickHotelOpen,
  quickHotelValues,

  submitting,

  vendorModalOpen,
  vendorValues,

  canManageVendors,
  cities = [],
  hotels = [],
  canManageCities = false,
  onCreateCity,
}) => {
  const handleQuickVendor = (query = '') => {
    if (!canManageVendors || !onOpenQuickVendor) {
      return;
    }

    return onOpenQuickVendor(query, 'hotelDetails');
  };

  const handleVendorDetails = (query = '') => {
    if (!canManageVendors || !onOpenVendorDetails) {
      return;
    }

    onOpenVendorDetails(null, query, 'hotelDetails');
  };

  return (
    <>
      {/* =========================================
          HOTEL — ADD / EDIT WITH DETAILS
      ========================================= */}

      <TravelHotelFormModal
        open={hotelModalOpen}
        editingHotel={editingHotel}
        activeVendors={activeVendors}
        canManageVendors={canManageVendors}
        values={hotelValues}
        onChange={onHotelChange}
        onClose={onHotelClose}
        onSubmit={onHotelSubmit}
        submitting={submitting}
        error={formError}
        onQuickAddVendor={handleQuickVendor}
        onAddVendorDetails={handleVendorDetails}
        cities={cities}
        hotels={hotels}
        canManageCities={canManageCities}
        onCreateCity={onCreateCity}
      />

      {/* =========================================
          HOTEL — QUICK ADD
      ========================================= */}

      <TravelFormModal
        open={quickHotelOpen}
        titleKey="travel.hotels.quickTitle"
        modeKey="travel.common.quickAdd"
        fields={quickHotelFields}
        values={quickHotelValues}
        onChange={onQuickHotelChange}
        onClose={onQuickHotelClose}
        onSubmit={onQuickHotelSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaBed}
      >
        <TravelCityAutocomplete
          value={quickHotelValues.city || ''}
          onChange={(value) => onQuickHotelChange('city', value)}
          cities={cities}
          hotels={hotels}
          onCreate={canManageCities ? onCreateCity : null}
          disabled={submitting}
        />
      </TravelFormModal>

      {/* =========================================
          VENDOR — QUICK ADD / DETAILS / EDIT
      ========================================= */}

      <TravelVendorFormModal
        open={vendorModalOpen}
        editingVendor={editingVendor}
        categories={categories}
        values={vendorValues}
        onChange={onVendorChange}
        onClose={onVendorClose}
        onSubmit={onVendorSubmit}
        submitting={submitting}
        error={formError}
      />
    </>
  );
};

export default TravelHotelModals;
