import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { FaCheck, FaEdit, FaEyeSlash, FaSyncAlt, FaTimes, FaTrash, FaUser } from 'react-icons/fa';

import {
  createTraveler,
  deleteTraveler,
  fetchTravelers,
  updateTraveler,
  updateTravelerStatus,
} from '../../services/travelMasterService';

import { getCachedTravelRecords, TRAVEL_CACHE_DOMAINS } from '../../utils/travelMasterCache';

import { hasPermission } from '../../utils/permissionHelper';
import { t } from '../../i18n/i18n';
import usePageMemory from '../../hooks/usePageMemory';

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
  getQuickAddAction,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

const PAGE_MEMORY_DEFAULTS = {
  search: '',
  status: 'active',
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

const emptyTravelerForm = {
  fullName: '',
  fatherOrHusbandName: '',
  gender: '',
  dateOfBirth: '',
  nationality: '',
  cnic: '',
  passportNumber: '',
  passportIssueDate: '',
  passportExpiryDate: '',
  passportCountry: '',
  mobile: '',
  email: '',
  notes: '',
  isActive: true,
};

const emptyQuickTraveler = {
  fullName: '',
  passportNumber: '',
  mobile: '',
};

const normalizeDateForInput = (value) => {
  if (!value) {
    return '';
  }

  return String(value).slice(0, 10);
};

const prepareTravelerForm = (traveler = null) => ({
  ...emptyTravelerForm,
  ...traveler,

  dateOfBirth: normalizeDateForInput(traveler?.dateOfBirth),

  passportIssueDate: normalizeDateForInput(traveler?.passportIssueDate),

  passportExpiryDate: normalizeDateForInput(traveler?.passportExpiryDate),

  isActive: traveler?.isActive !== false,
});

const cleanTravelerPayload = (values) => ({
  ...values,

  dateOfBirth: values.dateOfBirth || null,

  passportIssueDate: values.passportIssueDate || null,

  passportExpiryDate: values.passportExpiryDate || null,
});

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

const travelerFields = [
  {
    name: 'fullName',
    labelKey: 'travel.fields.fullName',
    placeholderKey: 'travel.placeholders.fullName',
    required: true,
  },

  {
    name: 'fatherOrHusbandName',
    labelKey: 'travel.fields.fatherOrHusbandName',
    placeholderKey: 'travel.placeholders.fatherOrHusbandName',
  },

  {
    name: 'gender',
    labelKey: 'travel.fields.gender',
    type: 'select',
    placeholderKey: 'travel.placeholders.gender',
    options: [
      {
        value: 'male',
        labelKey: 'travel.gender.male',
      },
      {
        value: 'female',
        labelKey: 'travel.gender.female',
      },
      {
        value: 'other',
        labelKey: 'travel.gender.other',
      },
    ],
  },

  {
    name: 'dateOfBirth',
    labelKey: 'travel.fields.dateOfBirth',
    type: 'date',
  },

  {
    name: 'nationality',
    labelKey: 'travel.fields.nationality',
    placeholderKey: 'travel.placeholders.nationality',
  },

  {
    name: 'cnic',
    labelKey: 'travel.fields.cnic',
    placeholderKey: 'travel.placeholders.cnic',
  },

  {
    name: 'passportNumber',
    labelKey: 'travel.fields.passportNumber',
    placeholderKey: 'travel.placeholders.passportNumber',
  },

  {
    name: 'passportCountry',
    labelKey: 'travel.fields.passportCountry',
    placeholderKey: 'travel.placeholders.passportCountry',
  },

  {
    name: 'passportIssueDate',
    labelKey: 'travel.fields.passportIssueDate',
    type: 'date',
  },

  {
    name: 'passportExpiryDate',
    labelKey: 'travel.fields.passportExpiryDate',
    type: 'date',
  },

  {
    name: 'mobile',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },

  {
    name: 'email',
    labelKey: 'travel.fields.email',
    placeholderKey: 'travel.placeholders.email',
    type: 'email',
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

const quickTravelerFields = [
  {
    name: 'fullName',
    labelKey: 'travel.fields.fullName',
    placeholderKey: 'travel.placeholders.fullName',
    required: true,
  },

  {
    name: 'passportNumber',
    labelKey: 'travel.fields.passportNumber',
    placeholderKey: 'travel.placeholders.passportNumber',
  },

  {
    name: 'mobile',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
];

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

const TravelersPage = () => {
  const [travelers, setTravelers] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.TRAVELERS)
  );

  const [loading, setLoading] = useState(false);

  const [pageError, setPageError] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);

  const [quickOpen, setQuickOpen] = useState(false);

  const [editingTraveler, setEditingTraveler] = useState(null);

  const [formValues, setFormValues] = useState({
    ...emptyTravelerForm,
  });

  const [quickValues, setQuickValues] = useState({
    ...emptyQuickTraveler,
  });

  const [formError, setFormError] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState('');

  const canView = hasPermission('travel.travelers.view');

  const canManage = hasPermission('travel.travelers.manage');

  const { state: pageMemory, updateField } = usePageMemory(
    'travel_travelers_page_state',
    PAGE_MEMORY_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const setSearch = useCallback((value) => updateField('search', value), [updateField]);

  const setStatus = useCallback((value) => updateField('status', value), [updateField]);

  const setSelectedId = useCallback(
    (value) => updateField('selectedId', value || ''),
    [updateField]
  );

  const loadTravelers = useCallback(
    async (options = {}) => {
      if (!canView) {
        return;
      }

      try {
        setLoading(true);
        setPageError('');

        const data = await fetchTravelers({}, options);

        setTravelers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Travelers load failed:', error);

        setPageError(t('travel.alerts.travelersLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    loadTravelers();
  }, [loadTravelers]);

  const visibleTravelers = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return travelers
      .filter((traveler) => traveler?.isDeleted !== true)
      .filter((traveler) => {
        if (pageMemory.status === 'active') {
          return traveler?.isActive !== false;
        }

        if (pageMemory.status === 'inactive') {
          return traveler?.isActive === false;
        }

        return true;
      })
      .filter((traveler) => {
        if (!search) {
          return true;
        }

        return [
          traveler?.fullName,
          traveler?.fatherOrHusbandName,
          traveler?.passportNumber,
          traveler?.cnic,
          traveler?.mobile,
          traveler?.email,
          traveler?.nationality,
          traveler?.passportCountry,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [pageMemory.search, pageMemory.status, travelers]);

  const openDetails = (traveler = null, draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingTraveler(traveler);

    setFormValues(
      traveler
        ? prepareTravelerForm(traveler)
        : {
            ...emptyTravelerForm,
            fullName: draftName,
          }
    );

    setFormError('');
    setDetailsOpen(true);
  };

  const openQuickAdd = (draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setQuickValues({
      ...emptyQuickTraveler,
      fullName: draftName,
    });

    setFormError('');
    setQuickOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setEditingTraveler(null);

    setFormValues({
      ...emptyTravelerForm,
    });

    setFormError('');
  };

  const closeQuickAdd = () => {
    setQuickOpen(false);

    setQuickValues({
      ...emptyQuickTraveler,
    });

    setFormError('');
  };

  const handleFormChange = (name, value) => {
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleQuickChange = (name, value) => {
    setQuickValues((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleDetailsSubmit = async (event) => {
    event.preventDefault();

    if (!canManage) {
      setFormError(t('travel.alerts.permissionDenied'));
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      const payload = cleanTravelerPayload(formValues);

      const saved = editingTraveler
        ? await updateTraveler(editingTraveler._id, payload)
        : await createTraveler(payload);

      setTravelers((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
      closeDetails();
    } catch (error) {
      console.error('Traveler save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSubmit = async (event) => {
    event.preventDefault();

    if (!canManage) {
      setFormError(t('travel.alerts.permissionDenied'));
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await createTraveler(quickValues);

      setTravelers((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
      closeQuickAdd();
    } catch (error) {
      console.error('Traveler quick add failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.quickAddFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (traveler) => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    if (!window.confirm(t('travel.confirm.toggleStatus'))) {
      return;
    }

    const nextStatus = traveler?.isActive === false;

    try {
      const saved = await updateTravelerStatus(traveler._id, nextStatus);

      setTravelers((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
    } catch (error) {
      console.error('Traveler status update failed:', error);

      alert(error?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const handleDeleteTraveler = async (traveler, event = null) => {
    event?.stopPropagation?.();

    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    const confirmed = window.confirm(
      buildTravelConfirmMessage('travel.travelers.deleteConfirm', traveler?.fullName)
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(traveler._id);

      await deleteTraveler(traveler._id, {
        reason: 'Travel traveler archived by user',
      });

      setTravelers((current) =>
        current.filter((item) => String(item?._id) !== String(traveler._id))
      );

      if (String(pageMemory.selectedId) === String(traveler._id)) {
        setSelectedId('');
      }
    } catch (error) {
      console.error('Traveler delete failed:', error);

      alert(error?.response?.data?.message || t('travel.travelers.deleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('active');
  };

  const renderActions = (traveler) => {
    if (!canManage) {
      return null;
    }

    const inactive = traveler?.isActive === false;

    const deleting = String(deletingId || '') === String(traveler?._id || '');

    return (
      <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
        <IconActionButton
          icon={FaEdit}
          title={t('travel.common.edit')}
          variant="edit"
          onClick={(event) => {
            event.stopPropagation();
            openDetails(traveler);
          }}
        />

        <IconActionButton
          icon={inactive ? FaCheck : FaEyeSlash}
          title={inactive ? t('travel.common.activate') : t('travel.common.deactivate')}
          variant={inactive ? 'activate' : 'deactivate'}
          onClick={(event) => {
            event.stopPropagation();
            toggleStatus(traveler);
          }}
        />

        <IconActionButton
          icon={FaTrash}
          title={deleting ? t('travel.common.deleting') : t('travel.common.delete')}
          variant="delete"
          disabled={deleting}
          onClick={(event) => handleDeleteTraveler(traveler, event)}
        />
      </div>
    );
  };

  const columns = [
    {
      key: 'traveler',
      labelKey: 'travel.fields.traveler',
      className: 'w-[26%]',
      render: (traveler) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">{traveler?.fullName || '-'}</p>

          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {traveler?.fatherOrHusbandName || traveler?.nationality || '-'}
          </p>
        </div>
      ),
    },

    {
      key: 'passportNumber',
      labelKey: 'travel.fields.passportNumber',
      className: 'w-[18%]',
      render: (traveler) => (
        <span className="font-bold text-slate-700">{traveler?.passportNumber || '-'}</span>
      ),
    },

    {
      key: 'cnic',
      labelKey: 'travel.fields.cnic',
      className: 'w-[18%]',
      render: (traveler) => traveler?.cnic || '-',
    },

    {
      key: 'mobile',
      labelKey: 'travel.fields.mobile',
      className: 'w-[16%]',
      render: (traveler) => traveler?.mobile || '-',
    },

    {
      key: 'status',
      labelKey: 'travel.fields.status',
      className: 'w-[10%]',
      render: (traveler) => <TravelStatusBadge active={traveler?.isActive !== false} />,
    },

    {
      key: 'actions',
      labelKey: 'travel.fields.actions',
      className: 'w-[12%]',
      cellClassName: '!px-2 !py-2',
      render: renderActions,
    },
  ];

  const renderMobileCard = (traveler) => {
    const selected = String(pageMemory.selectedId || '') === String(traveler?._id || '');

    return (
      <article
        onClick={() => setSelectedId(traveler._id)}
        className={`rounded-xl border bg-white p-3 shadow-sm transition ${
          selected ? 'border-cyan-300 ring-1 ring-cyan-100' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
                <FaUser className="text-xs" />
              </span>

              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-slate-950">
                  {traveler?.fullName || '-'}
                </p>

                <p className="truncate text-xs font-semibold text-slate-500">
                  {traveler?.fatherOrHusbandName || traveler?.nationality || '-'}
                </p>
              </div>
            </div>
          </div>

          <TravelStatusBadge active={traveler?.isActive !== false} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50/80 p-3">
          <TravelCardLine
            labelKey="travel.fields.passportNumber"
            value={traveler?.passportNumber}
          />

          <TravelCardLine labelKey="travel.fields.cnic" value={traveler?.cnic} />

          <TravelCardLine labelKey="travel.fields.mobile" value={traveler?.mobile} />

          <TravelCardLine labelKey="travel.fields.nationality" value={traveler?.nationality} />
        </div>

        {canManage && (
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
            {renderActions(traveler)}
          </div>
        )}
      </article>
    );
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.travelers.title"
      actions={
        canManage ? (
          <>
            {getQuickAddAction(() => openQuickAdd(pageMemory.search))}

            {getAddAction(() => openDetails(null, pageMemory.search), 'travel.travelers.add')}
          </>
        ) : null
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(320px,1fr)_minmax(140px,auto)_auto_auto]">
          <TravelSearchInput
            value={pageMemory.search}
            onChange={setSearch}
            placeholderKey="travel.travelers.search"
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
              loadTravelers({
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

      <TravelMasterList
        columns={columns}
        records={visibleTravelers}
        selectedId={pageMemory.selectedId}
        onRowClick={(traveler) => setSelectedId(traveler._id)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.travelers.empty"
      />

      <TravelFormModal
        open={detailsOpen}
        titleKey="travel.travelers.formTitle"
        modeKey={editingTraveler ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={travelerFields}
        values={formValues}
        onChange={handleFormChange}
        onClose={closeDetails}
        onSubmit={handleDetailsSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaUser}
      />

      <TravelFormModal
        open={quickOpen}
        titleKey="travel.travelers.quickTitle"
        modeKey="travel.common.quickAdd"
        fields={quickTravelerFields}
        values={quickValues}
        onChange={handleQuickChange}
        onClose={closeQuickAdd}
        onSubmit={handleQuickSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaUser}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelersPage;
