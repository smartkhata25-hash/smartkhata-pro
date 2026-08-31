import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheck,
  FaEdit,
  FaEyeSlash,
  FaMapMarkerAlt,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

import {
  createTravelAirport,
  deleteTravelAirport,
  fetchTravelAirports,
  updateTravelAirport,
  updateTravelAirportStatus,
} from '../../services/travelMasterService';
import { getCachedTravelRecords, TRAVEL_CACHE_DOMAINS } from '../../utils/travelMasterCache';
import usePageMemory from '../../hooks/usePageMemory';
import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';
import {
  TravelActionButton,
  TravelCardLine,
  TravelFilterSelect,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  TravelStatusBadge,
  buildTravelConfirmMessage,
  getAddAction,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

const PAGE_MEMORY_DEFAULTS = {
  search: '',
  status: 'active',
  country: '',
  city: '',
  selectedId: '',
};

const STATUS_OPTIONS = [
  { value: 'active', labelKey: 'travel.common.active' },
  { value: 'inactive', labelKey: 'travel.common.inactive' },
  { value: 'all', labelKey: 'travel.common.all' },
];

const emptyAirportForm = {
  name: '',
  iataCode: '',
  icaoCode: '',
  city: '',
  country: '',
  countryCode: '',
  aliases: '',
  notes: '',
  isActive: true,
};

const airportFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.airportName',
    placeholderKey: 'travel.placeholders.airportName',
    required: true,
  },
  {
    name: 'iataCode',
    labelKey: 'travel.fields.iataCode',
    placeholderKey: 'travel.placeholders.iataCode',
    required: true,
  },
  {
    name: 'icaoCode',
    labelKey: 'travel.fields.icaoCode',
    placeholderKey: 'travel.placeholders.icaoCode',
  },
  {
    name: 'city',
    labelKey: 'travel.fields.city',
    placeholderKey: 'travel.placeholders.city',
  },
  {
    name: 'country',
    labelKey: 'travel.fields.country',
    placeholderKey: 'travel.placeholders.country',
  },
  {
    name: 'countryCode',
    labelKey: 'travel.fields.countryCode',
    placeholderKey: 'travel.placeholders.countryCode',
  },
  {
    name: 'aliases',
    labelKey: 'travel.fields.aliases',
    placeholderKey: 'travel.placeholders.aliases',
    type: 'textarea',
    fullWidth: true,
  },
  {
    name: 'notes',
    labelKey: 'travel.fields.notes',
    placeholderKey: 'travel.placeholders.notes',
    type: 'textarea',
    fullWidth: true,
  },
  {
    name: 'isActive',
    labelKey: 'travel.fields.isActive',
    type: 'checkbox',
    fullWidth: true,
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

const aliasesToText = (aliases) => (Array.isArray(aliases) ? aliases.join(', ') : aliases || '');

const textToAliases = (value) =>
  String(value || '')
    .split(/[\n,]+/)
    .map((alias) => alias.trim())
    .filter(Boolean);

const formatAirportLocation = (airport) =>
  [airport?.city, airport?.country].filter(Boolean).join(', ') || '-';

const formatAirportCode = (airport) =>
  [airport?.iataCode, airport?.icaoCode].filter(Boolean).join(' / ') || '-';

const IconActionButton = ({ icon: Icon, title, variant = 'edit', disabled = false, onClick }) => {
  const variants = {
    edit: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    activate: 'from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700',
    deactivate: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    delete: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
        variants[variant] || variants.edit
      }`}
    >
      <Icon aria-hidden="true" className="text-[11px]" />
    </button>
  );
};

const AirportActionGroup = ({
  airport,
  canManage,
  deletingId,
  onEdit,
  onToggleStatus,
  onDelete,
}) => {
  if (!canManage) {
    return null;
  }

  const inactive = airport?.isActive === false;
  const deleting = String(deletingId || '') === String(airport?._id || '');

  return (
    <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
      <IconActionButton
        icon={FaEdit}
        title={t('travel.common.edit')}
        onClick={(event) => {
          event.stopPropagation();
          onEdit(airport);
        }}
      />
      <IconActionButton
        icon={inactive ? FaCheck : FaEyeSlash}
        title={inactive ? t('travel.common.activate') : t('travel.common.deactivate')}
        variant={inactive ? 'activate' : 'deactivate'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleStatus(airport);
        }}
      />
      <IconActionButton
        icon={FaTrash}
        title={deleting ? t('travel.common.deleting') : t('travel.common.delete')}
        variant="delete"
        disabled={deleting}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(airport);
        }}
      />
    </div>
  );
};

const TravelAirportsPage = () => {
  const [airports, setAirports] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.AIRPORTS)
  );
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAirport, setEditingAirport] = useState(null);
  const [values, setValues] = useState({ ...emptyAirportForm });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const canView = hasPermission('travel.airports.view');
  const canManage = hasPermission('travel.airports.manage');

  const { state: pageMemory, updateField } = usePageMemory(
    'travel_airports_page_state',
    PAGE_MEMORY_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const setSearch = useCallback((value) => updateField('search', value), [updateField]);
  const setStatus = useCallback((value) => updateField('status', value), [updateField]);
  const setCountry = useCallback((value) => updateField('country', value), [updateField]);
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

        const data = await fetchTravelAirports({}, options);
        setAirports(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Travel airports load failed:', error);
        setPageError(t('travel.alerts.airportsLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const countryOptions = useMemo(() => {
    const countries = airports
      .filter((airport) => airport?.isDeleted !== true)
      .map((airport) => String(airport?.country || '').trim())
      .filter(Boolean);

    return [...new Set(countries)].sort((a, b) => a.localeCompare(b));
  }, [airports]);

  const cityOptions = useMemo(() => {
    const cities = airports
      .filter((airport) => airport?.isDeleted !== true)
      .filter((airport) => !pageMemory.country || airport?.country === pageMemory.country)
      .map((airport) => String(airport?.city || '').trim())
      .filter(Boolean);

    return [...new Set(cities)].sort((a, b) => a.localeCompare(b));
  }, [airports, pageMemory.country]);

  const visibleAirports = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return airports
      .filter((airport) => airport?.isDeleted !== true)
      .filter((airport) => {
        if (pageMemory.status === 'active') {
          return airport?.isActive !== false;
        }

        if (pageMemory.status === 'inactive') {
          return airport?.isActive === false;
        }

        return true;
      })
      .filter((airport) => {
        if (pageMemory.country && String(airport?.country || '') !== String(pageMemory.country)) {
          return false;
        }

        if (pageMemory.city && String(airport?.city || '') !== String(pageMemory.city)) {
          return false;
        }

        return true;
      })
      .filter((airport) => {
        if (!search) {
          return true;
        }

        return [
          airport?.name,
          airport?.iataCode,
          airport?.icaoCode,
          airport?.city,
          airport?.country,
          airport?.countryCode,
          ...(Array.isArray(airport?.aliases) ? airport.aliases : []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [airports, pageMemory.city, pageMemory.country, pageMemory.search, pageMemory.status]);

  const openDetails = (airport = null, draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingAirport(airport);
    setValues(
      airport
        ? {
            ...emptyAirportForm,
            ...airport,
            aliases: aliasesToText(airport.aliases),
          }
        : {
            ...emptyAirportForm,
            name: draftName,
          }
    );
    setFormError('');
    setModalOpen(true);
  };

  const closeDetails = () => {
    setModalOpen(false);
    setEditingAirport(null);
    setValues({ ...emptyAirportForm });
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const payload = {
        ...values,
        aliases: textToAliases(values.aliases),
      };

      const saved = editingAirport
        ? await updateTravelAirport(editingAirport._id, payload)
        : await createTravelAirport(payload);

      setAirports((current) => upsertRecord(current, saved));
      setSelectedId(saved._id);
      closeDetails();
    } catch (error) {
      console.error('Travel airport save failed:', error);
      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (airport) => {
    if (!window.confirm(t('travel.confirm.toggleStatus'))) {
      return;
    }

    try {
      const saved = await updateTravelAirportStatus(airport._id, airport.isActive === false);
      setAirports((current) => upsertRecord(current, saved));
    } catch (error) {
      console.error('Travel airport status update failed:', error);
      alert(error?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const handleDelete = async (airport) => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    const confirmed = window.confirm(
      buildTravelConfirmMessage('travel.airports.deleteConfirm', airport?.name)
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(airport._id);

      await deleteTravelAirport(airport._id, {
        reason: 'Travel airport archived by user',
      });

      setAirports((current) => current.filter((item) => String(item?._id) !== String(airport._id)));

      if (String(pageMemory.selectedId) === String(airport._id)) {
        setSelectedId('');
      }
    } catch (error) {
      console.error('Travel airport delete failed:', error);
      alert(error?.response?.data?.message || t('travel.airports.deleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCountry('');
    setCity('');
    setStatus('active');
  };

  const columns = [
    {
      key: 'name',
      labelKey: 'travel.fields.airport',
      className: 'w-[28%]',
      render: (airport) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">{airport?.name || '-'}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {formatAirportCode(airport)}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      labelKey: 'travel.fields.location',
      className: 'w-[22%]',
      render: (airport) => (
        <span className="font-semibold text-slate-700">{formatAirportLocation(airport)}</span>
      ),
    },
    {
      key: 'aliases',
      labelKey: 'travel.fields.aliases',
      className: 'w-[22%]',
      render: (airport) => (
        <span className="line-clamp-2 text-sm font-semibold text-slate-600">
          {aliasesToText(airport?.aliases) || '-'}
        </span>
      ),
    },
    {
      key: 'status',
      labelKey: 'travel.fields.status',
      className: 'w-[10%]',
      render: (airport) => <TravelStatusBadge active={airport?.isActive !== false} />,
    },
    {
      key: 'actions',
      labelKey: 'travel.fields.actions',
      className: 'w-[18%]',
      cellClassName: '!px-2 !py-2',
      render: (airport) => (
        <AirportActionGroup
          airport={airport}
          canManage={canManage}
          deletingId={deletingId}
          onEdit={openDetails}
          onToggleStatus={toggleStatus}
          onDelete={handleDelete}
        />
      ),
    },
  ];

  const renderMobileCard = (airport) => {
    const selected = String(pageMemory.selectedId || '') === String(airport?._id || '');

    return (
      <article
        onClick={() => setSelectedId(airport._id)}
        className={`rounded-xl border bg-white p-3 shadow-sm transition ${
          selected ? 'border-cyan-300 ring-1 ring-cyan-100' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-950">
              {airport?.name || '-'}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {formatAirportCode(airport)}
            </p>
          </div>
          <TravelStatusBadge active={airport?.isActive !== false} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50/80 p-3">
          <TravelCardLine labelKey="travel.fields.city" value={airport?.city} />
          <TravelCardLine labelKey="travel.fields.country" value={airport?.country} />
          <TravelCardLine labelKey="travel.fields.countryCode" value={airport?.countryCode} />
          <TravelCardLine labelKey="travel.fields.aliases" value={aliasesToText(airport?.aliases)} />
        </div>

        {canManage && (
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
            <AirportActionGroup
              airport={airport}
              canManage={canManage}
              deletingId={deletingId}
              onEdit={openDetails}
              onToggleStatus={toggleStatus}
              onDelete={handleDelete}
            />
          </div>
        )}
      </article>
    );
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.airports.title"
      subtitleKey="travel.airports.subtitle"
      actions={
        canManage
          ? getAddAction(() => openDetails(null, pageMemory.search), 'travel.airports.add')
          : null
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(260px,1fr)_minmax(150px,auto)_minmax(150px,auto)_minmax(130px,auto)_auto_auto]">
          <TravelSearchInput
            value={pageMemory.search}
            onChange={setSearch}
            placeholderKey="travel.airports.search"
          />
          <TravelFilterSelect
            value={pageMemory.country}
            onChange={(value) => {
              setCountry(value);
              setCity('');
            }}
            placeholderKey="travel.common.allCountries"
            options={countryOptions.map((country) => ({
              value: country,
              label: country,
            }))}
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
          <TravelFilterSelect value={pageMemory.status} onChange={setStatus} options={STATUS_OPTIONS} />
          <TravelActionButton
            icon={FaTimes}
            variant="secondary"
            onClick={clearFilters}
            title={t('travel.common.clear')}
          />
          <TravelActionButton
            icon={FaSyncAlt}
            variant="primary"
            onClick={() => loadData({ forceRefresh: true })}
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

      <TravelMasterList
        columns={columns}
        records={visibleAirports}
        selectedId={pageMemory.selectedId}
        onRowClick={(airport) => setSelectedId(airport._id)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.airports.empty"
      />

      <TravelFormModal
        open={modalOpen}
        titleKey="travel.airports.formTitle"
        modeKey={editingAirport ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={airportFields}
        values={values}
        onChange={(name, value) =>
          setValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onClose={closeDetails}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaMapMarkerAlt}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelAirportsPage;
