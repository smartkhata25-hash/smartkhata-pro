import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaBook,
  FaEdit,
  FaExchangeAlt,
  FaMoneyBillWave,
  FaPlus,
  FaSyncAlt,
  FaTrash,
  FaUndo,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  createTravelParty,
  deleteTravelParty,
  fetchTravelParties,
  mergeTravelParties,
  restoreTravelParty,
  updateTravelParty,
} from '../../services/travelMasterService';
import { buildTravelRouteState } from '../../utils/travelContext';
import { hasPermission } from '../../utils/permissionHelper';
import {
  TravelActionButton,
  TravelCardLine,
  TravelFilterSelect,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelSegmentedControl,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
  formatTravelMoney,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

const PAGE_DEFAULTS = Object.freeze({
  search: '',
  role: '',
  balance: '',
  sort: 'name_asc',
});

const emptyPartyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  role: 'both',
  openingBalance: 0,
  moduleScope: 'travel',
  isActive: true,
};

const partyFields = [
  {
    name: 'name',
    labelKey: 'travel.parties.fields.name',
    placeholderKey: 'travel.parties.placeholders.name',
    required: true,
  },
  {
    name: 'phone',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
  {
    name: 'role',
    labelKey: 'travel.parties.fields.role',
    type: 'select',
    required: true,
    options: [
      { value: 'customer', labelKey: 'travel.parties.roles.customer' },
      { value: 'supplier', labelKey: 'travel.parties.roles.supplier' },
      { value: 'both', labelKey: 'travel.parties.roles.both' },
    ],
  },
  {
    name: 'openingBalance',
    labelKey: 'travel.parties.fields.openingBalance',
    type: 'number',
    step: '0.01',
  },
  {
    name: 'email',
    labelKey: 'travel.fields.email',
    placeholderKey: 'travel.placeholders.email',
    type: 'email',
  },
  {
    name: 'address',
    labelKey: 'travel.fields.address',
    placeholderKey: 'travel.fields.address',
    type: 'textarea',
  },
  {
    name: 'notes',
    labelKey: 'travel.fields.notes',
    placeholderKey: 'travel.fields.notes',
    type: 'textarea',
  },
  {
    name: 'isActive',
    labelKey: 'travel.common.active',
    type: 'checkbox',
  },
];

const getFiltersFromParams = (searchParams) => ({
  search: searchParams.get('search') || '',
  role: searchParams.get('role') || '',
  balance: searchParams.get('balance') || '',
  sort: searchParams.get('sort') || PAGE_DEFAULTS.sort,
});

const getPartyBalance = (party) => Number(party?.balance || 0);

const canRestoreHiddenParty = (party) => !party?.hiddenReason || party.hiddenReason === 'deleted';

const getHiddenReasonLabel = (record) =>
  t(`travel.hiddenReasons.${record?.hiddenReason || 'hidden'}`);

const getBalanceLabelKey = (balance) => {
  if (balance > 0) return 'travel.parties.receivable';
  if (balance < 0) return 'travel.parties.payable';
  return 'travel.parties.settled';
};

const getBalanceTextClass = (balance) => {
  if (balance > 0) return 'text-emerald-700';
  if (balance < 0) return 'text-rose-700';
  return 'text-slate-600';
};

const upsertParty = (records, record) => {
  const index = records.findIndex((item) => String(item?._id) === String(record?._id));

  const normalizedRecord = {
    ...record,
    balance: getPartyBalance(record),
  };

  if (index === -1) {
    return [normalizedRecord, ...records];
  }

  const nextRecords = [...records];
  nextRecords[index] = {
    ...nextRecords[index],
    ...normalizedRecord,
  };

  return nextRecords;
};

const IconActionButton = ({ icon: Icon, title, onClick, disabled = false, variant = 'blue' }) => {
  const variants = {
    blue: 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700',
    cyan: 'from-cyan-500 to-sky-600 hover:from-cyan-600 hover:to-sky-700',
    green: 'from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700',
    amber: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    rose: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon aria-hidden="true" className="text-xs sm:text-sm" />
    </button>
  );
};

const TravelPartiesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingParty, setEditingParty] = useState(null);
  const [partyValues, setPartyValues] = useState(emptyPartyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [restoringId, setRestoringId] = useState('');
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergingId, setMergingId] = useState('');
  const [activeTab, setActiveTab] = useState('active');

  const filters = useMemo(() => getFiltersFromParams(searchParams), [searchParams]);
  const isHiddenTab = activeTab === 'hidden';

  const canView =
    hasPermission('travel.parties.view') ||
    hasPermission('travel.parties.manage') ||
    hasPermission('travel.view');
  const canManage = hasPermission('travel.parties.manage');
  const canViewLedger = hasPermission('parties.view_ledger') || canView;

  const loadParties = useCallback(
    async (options = {}) => {
      if (!canView) return;

      const { status = activeTab, ...requestOptions } = options;

      try {
        setLoading(true);
        setPageError('');

        const data = await fetchTravelParties(
          {
            includeBalance: 'true',
            status,
          },
          {
            forceRefresh: true,
            ...requestOptions,
          }
        );

        setParties(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Travel parties load failed:', error);
        setPageError(t('travel.parties.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [activeTab, canView]
  );

  useEffect(() => {
    loadParties();
  }, [loadParties]);

  const updateFilter = useCallback(
    (field, value) => {
      const next = {
        ...filters,
        [field]: value,
      };
      const params = new URLSearchParams();

      Object.entries(next).forEach(([key, itemValue]) => {
        if (itemValue && itemValue !== PAGE_DEFAULTS[key]) {
          params.set(key, itemValue);
        }
      });

      setSearchParams(params, { replace: true });
    },
    [filters, setSearchParams]
  );

  const clearFilters = () => setSearchParams({}, { replace: true });

  const visibleParties = useMemo(() => {
    const cleanSearch = normalizeSearch(filters.search);

    return parties
      .filter((party) =>
        isHiddenTab ? party.isActive === false : party.isActive !== false
      )
      .filter((party) => {
        const roleMatch = !filters.role || party.role === filters.role;
        const balance = getPartyBalance(party);
        const balanceMatch =
          !filters.balance ||
          (filters.balance === 'receivable' && balance > 0) ||
          (filters.balance === 'payable' && balance < 0) ||
          (filters.balance === 'settled' && balance === 0);
        const searchMatch =
          !cleanSearch ||
          [party.name, party.phone, party.email, party.role]
            .filter(Boolean)
            .some((value) => normalizeSearch(value).includes(cleanSearch));

        return roleMatch && balanceMatch && searchMatch;
      })
      .sort((first, second) => {
        if (filters.sort === 'balance_desc') {
          return Math.abs(getPartyBalance(second)) - Math.abs(getPartyBalance(first));
        }

        return String(first.name || '').localeCompare(String(second.name || ''));
      });
  }, [filters, isHiddenTab, parties]);

  const openDetails = (party = null) => {
    setEditingParty(party);
    setPartyValues(
      party
        ? {
            ...emptyPartyForm,
            ...party,
            openingBalance: Number(party.openingBalance || 0),
            moduleScope: 'travel',
            isActive: party.isActive !== false,
          }
        : emptyPartyForm
    );
    setFormError('');
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    if (submitting) return;

    setDetailsOpen(false);
    setEditingParty(null);
    setPartyValues(emptyPartyForm);
    setFormError('');
  };

  const updatePartyField = (field, value) => {
    setPartyValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submitParty = async (event) => {
    event.preventDefault();

    if (!partyValues.name.trim()) {
      setFormError(t('travel.parties.nameRequired'));
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      const payload = {
        ...partyValues,
        openingBalance: Number(partyValues.openingBalance || 0),
        moduleScope: 'travel',
      };
      const saved = editingParty
        ? await updateTravelParty(editingParty._id, payload)
        : await createTravelParty(payload);

      setParties((current) => upsertParty(current, saved));
      await loadParties({ forceRefresh: true });
      setDetailsOpen(false);
      setEditingParty(null);
      setPartyValues(emptyPartyForm);
    } catch (error) {
      console.error('Travel party save failed:', error);
      setFormError(error?.response?.data?.message || t('travel.parties.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const archiveParty = async (party) => {
    if (!party?._id || !canManage) return;

    if (!window.confirm(buildTravelConfirmMessage('travel.parties.deleteConfirm', party.name))) {
      return;
    }

    try {
      setDeletingId(party._id);
      await deleteTravelParty(party._id);
      setParties((current) => current.filter((item) => String(item._id) !== String(party._id)));
      await loadParties({ forceRefresh: true });
    } catch (error) {
      console.error('Travel party archive failed:', error);
      alert(error?.response?.data?.message || t('travel.parties.deleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const restoreArchivedParty = async (party, event = null) => {
    event?.stopPropagation?.();

    if (!party?._id || !canManage) return;

    if (!canRestoreHiddenParty(party)) {
      alert(t('travel.common.notRestorable'));
      return;
    }

    try {
      setRestoringId(party._id);
      await restoreTravelParty(party._id);
      setActiveTab('active');
      await loadParties({
        forceRefresh: true,
        status: 'active',
      });
    } catch (error) {
      console.error('Travel party restore failed:', error);
      alert(error?.response?.data?.message || t('travel.parties.restoreFailed'));
    } finally {
      setRestoringId('');
    }
  };

  const openMergeParty = (party) => {
    if (!party?._id || !canManage) return;

    setMergeSource(party);
    setMergeTargetId('');
  };

  const closeMergeParty = () => {
    if (mergingId) return;

    setMergeSource(null);
    setMergeTargetId('');
  };

  const confirmMergeParty = async () => {
    if (!mergeSource?._id || !mergeTargetId || !canManage) {
      return;
    }

    try {
      setMergingId(mergeSource._id);
      await mergeTravelParties({
        sourcePartyId: mergeSource._id,
        targetPartyId: mergeTargetId,
      });
      setMergeSource(null);
      setMergeTargetId('');
      setActiveTab('active');
      await loadParties({
        forceRefresh: true,
        status: 'active',
      });
      alert(t('alerts.partiesMerged'));
    } catch (error) {
      console.error('Travel party merge failed:', error);
      alert(error?.response?.data?.message || t('alerts.mergeFailed'));
    } finally {
      setMergingId('');
    }
  };

  const openLedger = (party) => {
    if (!party?._id || !canViewLedger) return;

    navigate(`/party-ledger/${party._id}?moduleScope=travel`, {
      state: buildTravelRouteState('/travel/parties'),
    });
  };

  const openReceivePayment = (party) => {
    if (!party?._id) return;

    navigate(`/travel/payments/receive?customerType=party&customerPartyId=${party._id}`, {
      state: buildTravelRouteState('/travel/parties'),
    });
  };

  const openVendorPayment = (party) => {
    if (!party?._id) return;

    navigate(`/travel/vendor-payments/new?vendorType=party&vendorPartyId=${party._id}`, {
      state: buildTravelRouteState('/travel/parties'),
    });
  };

  const mergeTargetOptions = useMemo(
    () =>
      parties.filter(
        (party) =>
          party?.isActive !== false && String(party?._id) !== String(mergeSource?._id || '')
      ),
    [mergeSource, parties]
  );

  const columns = [
    {
      key: 'name',
      labelKey: 'travel.parties.columns.party',
      className: 'w-[22%]',
      render: (party) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-900">{party.name || '-'}</p>
          <p className="text-xs font-semibold text-slate-500">{party.phone || party.email || '-'}</p>
        </div>
      ),
    },
    {
      key: 'role',
      labelKey: 'travel.parties.columns.role',
      className: 'w-[12%]',
      render: (party) => t(`travel.parties.roles.${party.role || 'both'}`),
    },
    {
      key: 'balance',
      labelKey: 'travel.parties.columns.balance',
      className: 'w-[17%]',
      render: (party) => {
        const balance = getPartyBalance(party);

        return (
          <div className={`font-extrabold ${getBalanceTextClass(balance)}`}>
            {formatTravelMoney(Math.abs(balance))}
            <span className="ml-2 text-[11px] font-bold text-slate-500">
              {t(getBalanceLabelKey(balance))}
            </span>
          </div>
        );
      },
    },
    {
      key: 'openingBalance',
      labelKey: 'travel.parties.columns.openingBalance',
      className: 'w-[14%]',
      render: (party) => formatTravelMoney(party.openingBalance || 0),
    },
    {
      key: 'status',
      labelKey: 'travel.parties.columns.status',
      className: 'w-[10%]',
      render: (party) =>
        isHiddenTab ? getHiddenReasonLabel(party) : t('travel.common.active'),
    },
    {
      key: 'actions',
      labelKey: 'travel.common.actions',
      className: 'w-[25%]',
      cellClassName: 'whitespace-nowrap',
      render: (party) =>
        isHiddenTab ? (
          <div className="flex items-center justify-end gap-1.5">
            {canManage && canRestoreHiddenParty(party) ? (
              <IconActionButton
                icon={FaUndo}
                title={t('travel.common.restore')}
                onClick={(event) => restoreArchivedParty(party, event)}
                disabled={restoringId === party._id}
                variant="green"
              />
            ) : (
              <span className="text-xs font-bold text-slate-400">
                {t('travel.common.notRestorable')}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <IconActionButton
              icon={FaBook}
              title={t('travel.parties.actions.ledger')}
              onClick={() => openLedger(party)}
              disabled={!canViewLedger}
              variant="cyan"
            />
            {(party.role === 'customer' || party.role === 'both') && (
            <IconActionButton
              icon={FaMoneyBillWave}
              title={t('travel.parties.actions.receivePayment')}
              onClick={() => openReceivePayment(party)}
              variant="green"
            />
          )}
          {(party.role === 'supplier' || party.role === 'both') && (
            <IconActionButton
              icon={FaMoneyBillWave}
              title={t('travel.parties.actions.vendorPayment')}
              onClick={() => openVendorPayment(party)}
              variant="amber"
            />
          )}
          <IconActionButton
            icon={FaExchangeAlt}
            title={t('party.merge')}
            onClick={() => openMergeParty(party)}
            disabled={!canManage || mergingId === party._id}
            variant="amber"
          />
          <IconActionButton
            icon={FaEdit}
            title={t('travel.common.edit')}
            onClick={() => openDetails(party)}
            disabled={!canManage}
            variant="blue"
          />
          <IconActionButton
            icon={FaTrash}
            title={t('travel.common.delete')}
            onClick={() => archiveParty(party)}
            disabled={!canManage || deletingId === party._id}
            variant="rose"
          />
          </div>
        ),
    },
  ];

  const renderMobileCard = (party) => {
    const balance = getPartyBalance(party);

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-slate-950">{party.name || '-'}</p>
            <p className="text-xs font-semibold text-slate-500">
              {isHiddenTab ? getHiddenReasonLabel(party) : t(`travel.parties.roles.${party.role || 'both'}`)}
            </p>
          </div>
          <div className={`text-right text-sm font-extrabold ${getBalanceTextClass(balance)}`}>
            {formatTravelMoney(Math.abs(balance))}
            <p className="text-[11px] font-bold text-slate-500">{t(getBalanceLabelKey(balance))}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <TravelCardLine labelKey="travel.fields.mobile" value={party.phone || '-'} />
          <TravelCardLine
            labelKey="travel.parties.columns.openingBalance"
            value={formatTravelMoney(party.openingBalance || 0)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {isHiddenTab ? (
            canManage && canRestoreHiddenParty(party) ? (
              <IconActionButton
                icon={FaUndo}
                title={t('travel.common.restore')}
                onClick={(event) => restoreArchivedParty(party, event)}
                disabled={restoringId === party._id}
                variant="green"
              />
            ) : (
              <span className="text-xs font-bold text-slate-400">
                {t('travel.common.notRestorable')}
              </span>
            )
          ) : (
            <>
              <IconActionButton icon={FaBook} title={t('travel.parties.actions.ledger')} onClick={() => openLedger(party)} />
              {(party.role === 'customer' || party.role === 'both') && (
            <IconActionButton
              icon={FaMoneyBillWave}
              title={t('travel.parties.actions.receivePayment')}
              onClick={() => openReceivePayment(party)}
              variant="green"
            />
          )}
          {(party.role === 'supplier' || party.role === 'both') && (
            <IconActionButton
              icon={FaMoneyBillWave}
              title={t('travel.parties.actions.vendorPayment')}
              onClick={() => openVendorPayment(party)}
              variant="amber"
            />
          )}
          <IconActionButton
            icon={FaExchangeAlt}
            title={t('party.merge')}
            onClick={() => openMergeParty(party)}
            disabled={!canManage || mergingId === party._id}
            variant="amber"
          />
          <IconActionButton icon={FaEdit} title={t('travel.common.edit')} onClick={() => openDetails(party)} disabled={!canManage} />
          <IconActionButton
            icon={FaTrash}
            title={t('travel.common.delete')}
            onClick={() => archiveParty(party)}
            disabled={!canManage || deletingId === party._id}
            variant="rose"
          />
            </>
          )}
        </div>
      </div>
    );
  };

  if (!canView) {
    return (
      <TravelMasterPageFrame titleKey="travel.parties.title">
        <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {t('travel.alerts.permissionDenied')}
        </div>
      </TravelMasterPageFrame>
    );
  }

  return (
    <TravelMasterPageFrame
      titleKey="travel.parties.title"
      subtitleKey="travel.parties.subtitle"
      actions={
        canManage ? (
          <TravelActionButton icon={FaPlus} onClick={() => openDetails()}>
            {t('travel.parties.add')}
          </TravelActionButton>
        ) : null
      }
      filters={
        <TravelMasterToolbar>
          <TravelSegmentedControl
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'active', labelKey: 'travel.common.active' },
              { value: 'hidden', labelKey: 'travel.common.hidden' },
            ]}
          />
          <TravelSearchInput
            value={filters.search}
            onChange={(value) => updateFilter('search', value)}
            placeholderKey="travel.parties.search"
          />
          <TravelFilterSelect
            value={filters.role}
            onChange={(value) => updateFilter('role', value)}
            placeholderKey="travel.parties.filters.allRoles"
            options={[
              { value: 'customer', labelKey: 'travel.parties.roles.customer' },
              { value: 'supplier', labelKey: 'travel.parties.roles.supplier' },
              { value: 'both', labelKey: 'travel.parties.roles.both' },
            ]}
            className="w-full sm:w-44"
          />
          <TravelFilterSelect
            value={filters.balance}
            onChange={(value) => updateFilter('balance', value)}
            placeholderKey="travel.parties.filters.allBalances"
            options={[
              { value: 'receivable', labelKey: 'travel.parties.receivable' },
              { value: 'payable', labelKey: 'travel.parties.payable' },
              { value: 'settled', labelKey: 'travel.parties.settled' },
            ]}
            className="w-full sm:w-44"
          />
          <TravelFilterSelect
            value={filters.sort}
            onChange={(value) => updateFilter('sort', value)}
            options={[
              { value: 'name_asc', labelKey: 'travel.parties.sort.name' },
              { value: 'balance_desc', labelKey: 'travel.parties.sort.balance' },
            ]}
            className="w-full sm:w-44"
          />
          <TravelActionButton icon={FaSyncAlt} variant="secondary" onClick={() => loadParties({ forceRefresh: true })}>
            {t('travel.common.refresh')}
          </TravelActionButton>
          <TravelActionButton variant="secondary" onClick={clearFilters}>
            {t('common.clear')}
          </TravelActionButton>
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {pageError}
        </div>
      )}

      {loading && (
        <div className="mb-3 rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-700">
          {t('common.loading')}
        </div>
      )}

      <TravelMasterList
        columns={columns}
        records={visibleParties}
        emptyKey="travel.parties.empty"
        renderMobileCard={renderMobileCard}
      />

      <TravelFormModal
        open={detailsOpen}
        titleKey="travel.parties.formTitle"
        modeKey={editingParty ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={partyFields}
        values={partyValues}
        onChange={updatePartyField}
        onClose={closeDetails}
        onSubmit={submitParty}
        submitting={submitting}
        error={formError}
      />

      {mergeSource && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-950">{t('party.merge')}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{t('party.mergeDesc')}</p>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
              <strong>{t('party.mergeWarning')}</strong>
              <br />
              {t('party.mergeContinue')}
              <br />- {t('party.mergeMoveTransactions')}
              <br />- {t('party.mergeSourceHidden')}
            </div>

            <label className="mt-4 block text-xs font-extrabold uppercase text-slate-500">
              {t('party.selectMergeTarget')}
            </label>
            <select
              value={mergeTargetId}
              onChange={(event) => setMergeTargetId(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            >
              <option value="">{t('select')}</option>
              {mergeTargetOptions.map((party) => (
                <option key={party._id} value={party._id}>
                  {party.name} ({t(`travel.parties.roles.${party.role || 'both'}`)})
                </option>
              ))}
            </select>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMergeParty}
                disabled={Boolean(mergingId)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-extrabold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmMergeParty}
                disabled={!mergeTargetId || Boolean(mergingId)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('party.yesMerge')}
              </button>
            </div>
          </div>
        </div>
      )}
    </TravelMasterPageFrame>
  );
};

export default TravelPartiesPage;
