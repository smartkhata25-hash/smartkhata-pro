import React from 'react';
import { FaBed, FaHotel, FaUserTie } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';

import { TravelFormModal, TravelRelationPicker } from '../master/TravelMasterUI';

import { quickVendorFields, vendorFields } from '../vendors/travelVendorConfig';

import { hotelFields, quickHotelFields } from './travelHotelConfig';

const TravelHotelModals = ({
  activeVendors = [],

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

  quickVendorOpen,

  submitting,

  vendorModalOpen,
  vendorValues,

  canManageVendors,
}) => {
  const safeVendors = Array.isArray(activeVendors) ? activeVendors : [];

  const handleHotelVendorChange = (value) => {
    onHotelChange('vendorId', value);
  };

  const handleQuickVendor = (query = '') => {
    if (!canManageVendors || !onOpenQuickVendor) {
      return;
    }

    onOpenQuickVendor(query, 'hotelDetails');
  };

  const handleVendorDetails = (query = '') => {
    if (!canManageVendors || !onOpenVendorDetails) {
      return;
    }

    onOpenVendorDetails(null, query, 'hotelDetails');
  };

  const getVendorLabel = (vendor) => vendor?.name || '-';

  const getVendorMeta = (vendor) => {
    if (vendor?.travelVendorType) {
      return t(`travel.vendorTypes.${vendor.travelVendorType}`);
    }

    return vendor?.phone || vendor?.email || '';
  };

  const vendorModalIsOpen = vendorModalOpen || quickVendorOpen;

  const vendorIsQuickMode = Boolean(quickVendorOpen);

  const vendorModeKey = vendorIsQuickMode
    ? 'travel.common.quickAdd'
    : editingVendor
      ? 'travel.common.edit'
      : 'travel.common.addWithDetails';

  return (
    <>
      {/* =========================================
          HOTEL — ADD / EDIT WITH DETAILS
      ========================================= */}

      <TravelFormModal
        open={hotelModalOpen}
        titleKey="travel.hotels.formTitle"
        modeKey={editingHotel ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={hotelFields}
        values={hotelValues}
        onChange={onHotelChange}
        onClose={onHotelClose}
        onSubmit={onHotelSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaHotel}
      >
        <TravelRelationPicker
          labelKey="travel.fields.vendor"
          value={hotelValues?.vendorId || ''}
          onChange={handleHotelVendorChange}
          records={safeVendors}
          getLabel={getVendorLabel}
          getMeta={getVendorMeta}
          searchPlaceholderKey="travel.vendors.search"
          emptyKey="travel.vendors.empty"
          onQuickAdd={canManageVendors ? handleQuickVendor : null}
          onAddDetails={canManageVendors ? handleVendorDetails : null}
        />
      </TravelFormModal>

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

      <TravelFormModal
        open={vendorModalIsOpen}
        titleKey={vendorIsQuickMode ? 'travel.vendors.quickTitle' : 'travel.vendors.formTitle'}
        modeKey={vendorModeKey}
        fields={vendorIsQuickMode ? quickVendorFields : vendorFields}
        values={vendorValues}
        onChange={onVendorChange}
        onClose={onVendorClose}
        onSubmit={onVendorSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaUserTie}
      />
    </>
  );
};

export default TravelHotelModals;
