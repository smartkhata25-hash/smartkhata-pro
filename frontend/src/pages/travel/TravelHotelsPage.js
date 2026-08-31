import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaSyncAlt, FaTimes } from 'react-icons/fa';

import {
  createTravelHotel,
  createTravelVendor,
  deleteTravelHotel,
  fetchTravelHotels,
  fetchTravelVendors,
  updateTravelHotel,
  updateTravelHotelStatus,
  updateTravelVendor,
} from '../../services/travelMasterService';

import { getCachedTravelRecords, TRAVEL_CACHE_DOMAINS } from '../../utils/travelMasterCache';

import { hasPermission } from '../../utils/permissionHelper';
import { t } from '../../i18n/i18n';
import usePageMemory from '../../hooks/usePageMemory';

import {
  TravelActionButton,
  TravelFilterSelect,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
  getAddAction,
  getQuickAddAction,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

import TravelHotelList from '../../components/travel/hotels/TravelHotelList';
import TravelHotelModals from '../../components/travel/hotels/TravelHotelModals';

import {
  emptyHotelForm,
  emptyQuickHotel,
  getVendorId,
} from '../../components/travel/hotels/travelHotelConfig';

import { emptyHotelVendorForm as emptyVendorForm } from '../../components/travel/vendors/travelVendorConfig';

import { DEFAULT_TRAVEL_CURRENCY } from '../../config/travelConfig';

const PAGE_MEMORY_DEFAULTS = {
  search: '',
  status: 'active',
  city: '',
  selectedId: '',
};

const STATUS_OPTIONS = [
  {
    value: 'active',
    labelKey: 'travel.common.active',
  },
  {
    value: 'inactive',
    labelKey: 'travel.common.inactive',
  },
  {
    value: 'all',
    labelKey: 'travel.common.all',
  },
];

const upsertRecord = (records, record) => {
  const safeRecords = Array.isArray(records) ? records : [];

  if (!record?._id) {
    return safeRecords;
  }

  const index = safeRecords.findIndex((item) => String(item?._id) === String(record._id));

  if (index === -1) {
    return [record, ...safeRecords];
  }

  const nextRecords = [...safeRecords];

  nextRecords[index] = {
    ...nextRecords[index],
    ...record,
  };

  return nextRecords;
};

const TravelHotelsPage = () => {
  const [hotels, setHotels] = useState(() => getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.HOTELS));

  const [vendors, setVendors] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.VENDORS)
  );

  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [hotelModalOpen, setHotelModalOpen] = useState(false);
  const [quickHotelOpen, setQuickHotelOpen] = useState(false);

  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [quickVendorOpen, setQuickVendorOpen] = useState(false);

  const [editingHotel, setEditingHotel] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);

  const [hotelValues, setHotelValues] = useState({
    ...emptyHotelForm,
  });

  const [quickHotelValues, setQuickHotelValues] = useState({
    ...emptyQuickHotel,
  });

  const [vendorValues, setVendorValues] = useState({
    ...emptyVendorForm,
  });

  const [vendorCreateTarget, setVendorCreateTarget] = useState('');

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const canView = hasPermission('travel.hotels.view');
  const canManage = hasPermission('travel.hotels.manage');

  const canManageVendors = hasPermission('travel.vendors.manage');

  const { state: pageMemory, updateField } = usePageMemory(
    'travel_hotels_page_state',
    PAGE_MEMORY_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const setSearch = useCallback((value) => updateField('search', value), [updateField]);

  const setStatus = useCallback((value) => updateField('status', value), [updateField]);

  const setCity = useCallback((value) => updateField('city', value), [updateField]);

  const setSelectedId = useCallback(
    (value) => updateField('selectedId', value || ''),
    [updateField]
  );

  const loadData = useCallback(
    async (options = {}) => {
      if (!canView) {
        return;
      }

      try {
        setLoading(true);
        setPageError('');

        const [hotelData, vendorData] = await Promise.all([
          fetchTravelHotels({}, options),
          fetchTravelVendors({}, options),
        ]);

        setHotels(Array.isArray(hotelData) ? hotelData : []);

        setVendors(Array.isArray(vendorData) ? vendorData : []);
      } catch (error) {
        console.error('Travel hotels load failed:', error);

        setPageError(t('travel.alerts.hotelsLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeVendors = useMemo(
    () => vendors.filter((vendor) => vendor?.isDeleted !== true && vendor?.isActive !== false),
    [vendors]
  );

  const cityOptions = useMemo(() => {
    const cities = hotels
      .filter((hotel) => hotel?.isDeleted !== true)
      .map((hotel) => String(hotel?.city || '').trim())
      .filter(Boolean);

    return [...new Set(cities)].sort((a, b) => a.localeCompare(b));
  }, [hotels]);

  const getVendorName = useCallback(
    (vendorId) => {
      const cleanId = typeof vendorId === 'object' ? vendorId?._id : vendorId;

      const vendor = vendors.find((item) => String(item?._id) === String(cleanId));

      return vendor?.name || '-';
    },
    [vendors]
  );

  const visibleHotels = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return hotels
      .filter((hotel) => hotel?.isDeleted !== true)
      .filter((hotel) => {
        if (pageMemory.status === 'active') {
          return hotel?.isActive !== false;
        }

        if (pageMemory.status === 'inactive') {
          return hotel?.isActive === false;
        }

        return true;
      })
      .filter((hotel) => {
        if (!pageMemory.city) {
          return true;
        }

        return String(hotel?.city || '') === String(pageMemory.city);
      })
      .filter((hotel) => {
        if (!search) {
          return true;
        }

        return [
          hotel?.name,
          hotel?.city,
          hotel?.country,
          hotel?.contact,
          hotel?.phone,
          hotel?.address,
          getVendorName(hotel?.vendorId),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [getVendorName, hotels, pageMemory.city, pageMemory.search, pageMemory.status]);

  const categorySafeVendorId = useCallback((hotel) => getVendorId(hotel) || '', []);

  const openHotelDetails = (hotel = null, draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingHotel(hotel);

    setHotelValues(
      hotel
        ? {
            ...emptyHotelForm,
            ...hotel,

            currency: hotel.currency || DEFAULT_TRAVEL_CURRENCY,

            vendorId: categorySafeVendorId(hotel),
          }
        : {
            ...emptyHotelForm,
            name: draftName,
            currency: emptyHotelForm.currency || DEFAULT_TRAVEL_CURRENCY,
          }
    );

    setFormError('');
    setHotelModalOpen(true);
  };

  const openQuickHotel = (draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setQuickHotelValues({
      ...emptyQuickHotel,
      name: draftName,
    });

    setFormError('');
    setQuickHotelOpen(true);
  };

  const openVendorDetails = (vendor = null, draftName = '', target = 'hotelDetails') => {
    if (!canManageVendors) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingVendor(vendor);

    setVendorValues(
      vendor
        ? {
            ...emptyVendorForm,
            ...vendor,
          }
        : {
            ...emptyVendorForm,
            name: draftName,
          }
    );

    setVendorCreateTarget(target);

    setFormError('');
    setVendorModalOpen(true);
  };

  const openQuickVendor = (draftName = '', target = 'hotelDetails') => {
    if (!canManageVendors) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingVendor(null);

    setVendorValues({
      ...emptyVendorForm,
      name: draftName,
    });

    setVendorCreateTarget(target);

    setFormError('');
    setQuickVendorOpen(true);
  };

  const assignCreatedVendor = (vendor) => {
    if (!vendor?._id) {
      return;
    }

    if (vendorCreateTarget === 'hotelDetails') {
      setHotelValues((current) => ({
        ...current,
        vendorId: vendor._id,
      }));
    }
  };

  const handleHotelSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = editingHotel
        ? await updateTravelHotel(editingHotel._id, hotelValues)
        : await createTravelHotel(hotelValues);

      setHotels((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);

      setHotelModalOpen(false);
      setEditingHotel(null);

      setHotelValues({
        ...emptyHotelForm,
      });

      setFormError('');
    } catch (error) {
      console.error('Travel hotel save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickHotelSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await createTravelHotel(quickHotelValues);

      setHotels((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);

      setQuickHotelOpen(false);

      setQuickHotelValues({
        ...emptyQuickHotel,
      });

      setFormError('');
    } catch (error) {
      console.error('Travel hotel quick add failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.quickAddFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVendorSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = editingVendor
        ? await updateTravelVendor(editingVendor._id, vendorValues)
        : await createTravelVendor(vendorValues);

      setVendors((current) => upsertRecord(current, saved));

      assignCreatedVendor(saved);

      setVendorModalOpen(false);
      setQuickVendorOpen(false);

      setEditingVendor(null);
      setVendorCreateTarget('');

      setVendorValues({
        ...emptyVendorForm,
      });

      setFormError('');
    } catch (error) {
      console.error('Travel vendor save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleHotelStatus = async (hotel) => {
    if (!window.confirm(t('travel.confirm.toggleStatus'))) {
      return;
    }

    try {
      const saved = await updateTravelHotelStatus(hotel._id, hotel.isActive === false);

      setHotels((current) => upsertRecord(current, saved));
    } catch (error) {
      console.error('Hotel status update failed:', error);

      alert(error?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const handleDeleteHotel = async (hotel) => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    const confirmed = window.confirm(
      buildTravelConfirmMessage('travel.hotels.deleteConfirm', hotel?.name)
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(hotel._id);

      await deleteTravelHotel(hotel._id, {
        reason: 'Travel hotel archived by user',
      });

      setHotels((current) => current.filter((item) => String(item?._id) !== String(hotel._id)));

      if (String(pageMemory.selectedId) === String(hotel._id)) {
        setSelectedId('');
      }
    } catch (error) {
      console.error('Travel hotel delete failed:', error);

      alert(error?.response?.data?.message || t('travel.hotels.deleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setStatus('active');
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.hotels.title"
      actions={
        canManage ? (
          <>
            {getQuickAddAction(() => openQuickHotel(pageMemory.search))}

            {getAddAction(() => openHotelDetails(null, pageMemory.search), 'travel.hotels.add')}
          </>
        ) : null
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(300px,1fr)_minmax(170px,auto)_minmax(140px,auto)_auto_auto]">
          <TravelSearchInput
            value={pageMemory.search}
            onChange={setSearch}
            placeholderKey="travel.hotels.search"
          />

          <TravelFilterSelect
            value={pageMemory.city}
            onChange={setCity}
            placeholderKey="travel.common.allCities"
            options={cityOptions.map((city) => ({
              value: city,
              label: city,
            }))}
          />

          <TravelFilterSelect
            value={pageMemory.status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
          />

          <TravelActionButton
            icon={FaTimes}
            variant="secondary"
            onClick={clearFilters}
            title={t('travel.common.clear')}
          />

          <TravelActionButton
            icon={FaSyncAlt}
            variant="primary"
            onClick={() =>
              loadData({
                forceRefresh: true,
              })
            }
            disabled={loading}
            title={t('travel.common.refresh')}
          />
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm">
          {pageError}
        </div>
      )}

      <TravelHotelList
        hotels={visibleHotels}
        selectedId={pageMemory.selectedId}
        canManage={canManage}
        getVendorName={getVendorName}
        onSelect={setSelectedId}
        onEdit={openHotelDetails}
        onToggleStatus={toggleHotelStatus}
        onDelete={handleDeleteHotel}
        deletingId={deletingId}
      />

      <TravelHotelModals
        activeVendors={activeVendors}
        canManageVendors={canManageVendors}
        editingHotel={editingHotel}
        editingVendor={editingVendor}
        formError={formError}
        hotelModalOpen={hotelModalOpen}
        hotelValues={hotelValues}
        onHotelChange={(name, value) =>
          setHotelValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onHotelClose={() => {
          setHotelModalOpen(false);
          setEditingHotel(null);

          setHotelValues({
            ...emptyHotelForm,
          });

          setFormError('');
        }}
        onHotelSubmit={handleHotelSubmit}
        onOpenQuickVendor={openQuickVendor}
        onOpenVendorDetails={openVendorDetails}
        onQuickHotelChange={(name, value) =>
          setQuickHotelValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onQuickHotelClose={() => {
          setQuickHotelOpen(false);

          setQuickHotelValues({
            ...emptyQuickHotel,
          });

          setFormError('');
        }}
        onQuickHotelSubmit={handleQuickHotelSubmit}
        onVendorChange={(name, value) =>
          setVendorValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onVendorClose={() => {
          setVendorModalOpen(false);
          setQuickVendorOpen(false);

          setEditingVendor(null);
          setVendorCreateTarget('');

          setVendorValues({
            ...emptyVendorForm,
          });

          setFormError('');
        }}
        onVendorSubmit={handleVendorSubmit}
        quickHotelOpen={quickHotelOpen}
        quickHotelValues={quickHotelValues}
        quickVendorOpen={quickVendorOpen}
        submitting={submitting}
        vendorModalOpen={vendorModalOpen}
        vendorValues={vendorValues}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelHotelsPage;
