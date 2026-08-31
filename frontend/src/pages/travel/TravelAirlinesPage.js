import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheck,
  FaEdit,
  FaEyeSlash,
  FaPlane,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

import {
  createTravelAirline,
  deleteTravelAirline,
  fetchTravelAirlines,
  updateTravelAirline,
  updateTravelAirlineStatus,
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
  selectedId: '',
};

const STATUS_OPTIONS = [
  { value: 'active', labelKey: 'travel.common.active' },
  { value: 'inactive', labelKey: 'travel.common.inactive' },
  { value: 'all', labelKey: 'travel.common.all' },
];

const emptyAirlineForm = {
  name: '',
  iataCode: '',
  icaoCode: '',
  country: '',
  aliases: '',
  notes: '',
  isActive: true,
};

const airlineFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.airlineName',
    placeholderKey: 'travel.placeholders.airlineName',
    required: true,
  },
  {
    name: 'iataCode',
    labelKey: 'travel.fields.iataCode',
    placeholderKey: 'travel.placeholders.iataCode',
  },
  {
    name: 'icaoCode',
    labelKey: 'travel.fields.icaoCode',
    placeholderKey: 'travel.placeholders.icaoCode',
  },
  {
    name: 'country',
    labelKey: 'travel.fields.country',
    placeholderKey: 'travel.placeholders.country',
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

const formatCode = (...parts) => parts.filter(Boolean).join(' / ') || '-';

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

const AirlineActionGroup = ({
  airline,
  canManage,
  deletingId,
  onEdit,
  onToggleStatus,
  onDelete,
}) => {
  if (!canManage) {
    return null;
  }

  const inactive = airline?.isActive === false;
  const deleting = String(deletingId || '') === String(airline?._id || '');

  return (
    <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
      <IconActionButton
        icon={FaEdit}
        title={t('travel.common.edit')}
        onClick={(event) => {
          event.stopPropagation();
          onEdit(airline);
        }}
      />
      <IconActionButton
        icon={inactive ? FaCheck : FaEyeSlash}
        title={inactive ? t('travel.common.activate') : t('travel.common.deactivate')}
        variant={inactive ? 'activate' : 'deactivate'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleStatus(airline);
        }}
      />
      <IconActionButton
        icon={FaTrash}
        title={deleting ? t('travel.common.deleting') : t('travel.common.delete')}
        variant="delete"
        disabled={deleting}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(airline);
        }}
      />
    </div>
  );
};

const TravelAirlinesPage = () => {
  const [airlines, setAirlines] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.AIRLINES)
  );
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAirline, setEditingAirline] = useState(null);
  const [values, setValues] = useState({ ...emptyAirlineForm });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const canView = hasPermission('travel.airlines.view');
  const canManage = hasPermission('travel.airlines.manage');

  const { state: pageMemory, updateField } = usePageMemory(
    'travel_airlines_page_state',
    PAGE_MEMORY_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const setSearch = useCallback((value) => updateField('search', value), [updateField]);
  const setStatus = useCallback((value) => updateField('status', value), [updateField]);
  const setCountry = useCallback((value) => updateField('country', value), [updateField]);
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

        const data = await fetchTravelAirlines({}, options);
        setAirlines(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Travel airlines load failed:', error);
        setPageError(t('travel.alerts.airlinesLoadFailed'));
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
    const countries = airlines
      .filter((airline) => airline?.isDeleted !== true)
      .map((airline) => String(airline?.country || '').trim())
      .filter(Boolean);

    return [...new Set(countries)].sort((a, b) => a.localeCompare(b));
  }, [airlines]);

  const visibleAirlines = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return airlines
      .filter((airline) => airline?.isDeleted !== true)
      .filter((airline) => {
        if (pageMemory.status === 'active') {
          return airline?.isActive !== false;
        }

        if (pageMemory.status === 'inactive') {
          return airline?.isActive === false;
        }

        return true;
      })
      .filter((airline) => {
        if (!pageMemory.country) {
          return true;
        }

        return String(airline?.country || '') === String(pageMemory.country);
      })
      .filter((airline) => {
        if (!search) {
          return true;
        }

        return [
          airline?.name,
          airline?.iataCode,
          airline?.icaoCode,
          airline?.country,
          ...(Array.isArray(airline?.aliases) ? airline.aliases : []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [airlines, pageMemory.country, pageMemory.search, pageMemory.status]);

  const openDetails = (airline = null, draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingAirline(airline);
    setValues(
      airline
        ? {
            ...emptyAirlineForm,
            ...airline,
            aliases: aliasesToText(airline.aliases),
          }
        : {
            ...emptyAirlineForm,
            name: draftName,
          }
    );
    setFormError('');
    setModalOpen(true);
  };

  const closeDetails = () => {
    setModalOpen(false);
    setEditingAirline(null);
    setValues({ ...emptyAirlineForm });
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

      const saved = editingAirline
        ? await updateTravelAirline(editingAirline._id, payload)
        : await createTravelAirline(payload);

      setAirlines((current) => upsertRecord(current, saved));
      setSelectedId(saved._id);
      closeDetails();
    } catch (error) {
      console.error('Travel airline save failed:', error);
      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (airline) => {
    if (!window.confirm(t('travel.confirm.toggleStatus'))) {
      return;
    }

    try {
      const saved = await updateTravelAirlineStatus(airline._id, airline.isActive === false);
      setAirlines((current) => upsertRecord(current, saved));
    } catch (error) {
      console.error('Travel airline status update failed:', error);
      alert(error?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const handleDelete = async (airline) => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    const confirmed = window.confirm(
      buildTravelConfirmMessage('travel.airlines.deleteConfirm', airline?.name)
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(airline._id);

      await deleteTravelAirline(airline._id, {
        reason: 'Travel airline archived by user',
      });

      setAirlines((current) => current.filter((item) => String(item?._id) !== String(airline._id)));

      if (String(pageMemory.selectedId) === String(airline._id)) {
        setSelectedId('');
      }
    } catch (error) {
      console.error('Travel airline delete failed:', error);
      alert(error?.response?.data?.message || t('travel.airlines.deleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCountry('');
    setStatus('active');
  };

  const columns = [
    {
      key: 'name',
      labelKey: 'travel.fields.airline',
      className: 'w-[28%]',
      render: (airline) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">{airline?.name || '-'}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {formatCode(airline?.iataCode, airline?.icaoCode)}
          </p>
        </div>
      ),
    },
    {
      key: 'country',
      labelKey: 'travel.fields.country',
      className: 'w-[18%]',
      render: (airline) => <span className="font-semibold text-slate-700">{airline?.country || '-'}</span>,
    },
    {
      key: 'aliases',
      labelKey: 'travel.fields.aliases',
      className: 'w-[26%]',
      render: (airline) => (
        <span className="line-clamp-2 text-sm font-semibold text-slate-600">
          {aliasesToText(airline?.aliases) || '-'}
        </span>
      ),
    },
    {
      key: 'status',
      labelKey: 'travel.fields.status',
      className: 'w-[10%]',
      render: (airline) => <TravelStatusBadge active={airline?.isActive !== false} />,
    },
    {
      key: 'actions',
      labelKey: 'travel.fields.actions',
      className: 'w-[18%]',
      cellClassName: '!px-2 !py-2',
      render: (airline) => (
        <AirlineActionGroup
          airline={airline}
          canManage={canManage}
          deletingId={deletingId}
          onEdit={openDetails}
          onToggleStatus={toggleStatus}
          onDelete={handleDelete}
        />
      ),
    },
  ];

  const renderMobileCard = (airline) => {
    const selected = String(pageMemory.selectedId || '') === String(airline?._id || '');

    return (
      <article
        onClick={() => setSelectedId(airline._id)}
        className={`rounded-xl border bg-white p-3 shadow-sm transition ${
          selected ? 'border-cyan-300 ring-1 ring-cyan-100' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-950">
              {airline?.name || '-'}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {formatCode(airline?.iataCode, airline?.icaoCode)}
            </p>
          </div>
          <TravelStatusBadge active={airline?.isActive !== false} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50/80 p-3">
          <TravelCardLine labelKey="travel.fields.country" value={airline?.country} />
          <TravelCardLine labelKey="travel.fields.aliases" value={aliasesToText(airline?.aliases)} />
        </div>

        {canManage && (
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
            <AirlineActionGroup
              airline={airline}
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
      titleKey="travel.airlines.title"
      subtitleKey="travel.airlines.subtitle"
      actions={
        canManage
          ? getAddAction(() => openDetails(null, pageMemory.search), 'travel.airlines.add')
          : null
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(300px,1fr)_minmax(170px,auto)_minmax(140px,auto)_auto_auto]">
          <TravelSearchInput
            value={pageMemory.search}
            onChange={setSearch}
            placeholderKey="travel.airlines.search"
          />
          <TravelFilterSelect
            value={pageMemory.country}
            onChange={setCountry}
            placeholderKey="travel.common.allCountries"
            options={countryOptions.map((country) => ({
              value: country,
              label: country,
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
        records={visibleAirlines}
        selectedId={pageMemory.selectedId}
        onRowClick={(airline) => setSelectedId(airline._id)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.airlines.empty"
      />

      <TravelFormModal
        open={modalOpen}
        titleKey="travel.airlines.formTitle"
        modeKey={editingAirline ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={airlineFields}
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
        submitIcon={FaPlane}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelAirlinesPage;
