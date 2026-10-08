import React from 'react';
import { FaBed } from 'react-icons/fa';

import { TravelFormModal } from '../master/TravelMasterUI';

import TravelVendorFormModal from '../vendors/TravelVendorFormModal';

import { quickHotelFields } from './travelHotelConfig';
import TravelHotelFormModal from './TravelHotelFormModal';

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
      />

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
