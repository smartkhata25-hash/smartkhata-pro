import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCalendarAlt,
  FaEye,
  FaPaperclip,
  FaPlus,
  FaSave,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  createTravelVendorReturn,
  deleteTravelVendorReturn,
  fetchTravelPaymentAccounts,
  fetchTravelVendorReturnInvoices,
  fetchTravelVendorReturns,
  fetchTravelVendors,
} from '../../services/travelMasterService';
import {
  formatDateWithOptionalTime,
  getLocalDateInputValue,
  getLocalTimeInputValue,
} from '../../utils/localDateTime';
import {
  TravelActionButton,
  TravelCardLine,
  TravelCompactAutocomplete,
  TravelFilterSelect,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';
import { hasPermission } from '../../utils/permissionHelper';

const MAX_ATTACHMENTS = 3;
const PAGE_SIZE = 50;

const FILTER_DEFAULTS = Object.freeze({
  search: '',
  fromDate: '',
  toDate: '',
  receivedStatus: '',
  page: '1',
});

const createInitialForm = () => ({
  vendorId: '',
  originalInvoiceId: '',
  originalInvoiceNumber: '',
  serviceLabel: '',
  originalCost: '',
  vendorReturnAmount: '',
  vendorPenaltyAmount: '',
  amountReceivedNow: '',
  accountId: '',
  paymentType: 'cash',
  returnDate: getLocalDateInputValue(),
  returnTime: getLocalTimeInputValue(),
  notes: '',
  attachments: [],
});

const paymentTypeOptions = [
  {
    value: 'cash',
    labelKey: 'travel.payments.paymentTypes.cash',
  },
  {
    value: 'online',
    labelKey: 'travel.payments.paymentTypes.online',
  },
  {
    value: 'cheque',
    labelKey: 'travel.payments.paymentTypes.cheque',
  },
];

const getVendorLabel = (vendor) => vendor?.name || '-';

const getVendorMeta = (vendor) =>
  [vendor?.phone, formatTravelMoney(vendor?.currentPayable)].filter(Boolean).join(' | ');

const getInvoiceLabel = (invoice) => invoice?.invoiceNumber || invoice?.bookingNumber || '-';

const getAccountLabel = (account) => [account?.name, account?.code].filter(Boolean).join(' - ');

const getVendorReturnVendorName = (record) =>
  typeof record?.vendorId === 'object' ? record.vendorId?.name || '-' : '-';

const getVendorReturnVendorPhone = (record) =>
  typeof record?.vendorId === 'object' ? record.vendorId?.phone || '' : '';

const getVendorReturnReference = (record) =>
  [record.originalInvoiceNumber, record.serviceLabel].filter(Boolean).join(' - ') || '-';

const getReturnReceivedStatus = (record) => {
  const received = Number(record.amountReceivedNow || 0);
  const total = Number(record.vendorReturnAmount || 0);

  if (total <= 0 || received >= total) {
    return 'received';
  }

  if (received > 0) {
    return 'partial';
  }

  return 'outstanding';
};

const getFiltersFromParams = (searchParams) =>
  Object.keys(FILTER_DEFAULTS).reduce(
    (filters, field) => ({
      ...filters,
      [field]: searchParams.get(field) || FILTER_DEFAULTS[field],
    }),
    {}
  );

const numberValue = (value) => {
  const numeric = Number(value || 0);

  return Number.isFinite(numeric) ? numeric : 0;
};

const SummaryBox = ({ labelKey, value, accent = 'text-slate-900' }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-[11px] font-extrabold uppercase tracking-normal text-slate-400">
      {t(labelKey)}
    </p>

    <p className={`mt-1 truncate text-sm font-black ${accent}`}>{value}</p>
  </div>
);

const IconButton = ({
  icon: Icon,
  title,
  variant = 'blue',
  disabled = false,
  loading = false,
  onClick,
}) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    amber: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    red: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',
    violet: 'from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon aria-hidden="true" className={loading ? 'animate-spin text-xs sm:text-sm' : 'text-xs sm:text-sm'} />
    </button>
  );
};

const CompactDateFilter = ({ value, onChange, title, variant = 'blue' }) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 ring-cyan-100',
    violet: 'from-violet-500 to-purple-600 ring-violet-100',
  };

  return (
    <label
      title={title}
      className={`relative inline-flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ring-2 transition hover:-translate-y-0.5 hover:shadow-md sm:h-9 sm:w-9 ${
        variants[variant] || variants.blue
      }`}
    >
      <FaCalendarAlt aria-hidden="true" className="text-xs sm:text-sm" />

      {value && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-white shadow" />}

      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={title}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
};

const TravelVendorReturnsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams, setSearchParams] = useSearchParams();

  const formVisible = location.pathname.endsWith('/new');

  const [returns, setReturns] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);

  const [formState, setFormState] = useState(createInitialForm);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState('');

  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [total, setTotal] = useState(0);

  const filters = useMemo(() => getFiltersFromParams(searchParams), [searchParams]);

  const currentPage = Math.max(Number(filters.page || 1), 1);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const canManage = hasPermission('travel.vendors.manage');

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => String(vendor._id) === String(formState.vendorId)) || null,
    [formState.vendorId, vendors]
  );

  const selectedInvoice = useMemo(
    () =>
      invoices.find((invoice) => String(invoice._id) === String(formState.originalInvoiceId)) ||
      null,
    [formState.originalInvoiceId, invoices]
  );

  const amountReceivedNow = numberValue(formState.amountReceivedNow);

  const computedPenalty = Math.max(
    numberValue(formState.originalCost) - numberValue(formState.vendorReturnAmount),
    0
  );

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');

      const response = await fetchTravelVendorReturns({
        search: filters.search,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        receivedStatus: filters.receivedStatus,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      setReturns(Array.isArray(response?.data) ? response.data : []);

      setTotal(Number(response?.total || 0));
    } catch (error) {
      console.error('Travel vendor returns load failed:', error);

      setPageError(t('travel.vendorReturns.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, filters.fromDate, filters.receivedStatus, filters.search, filters.toDate]);

  const loadReferences = useCallback(async () => {
    try {
      setFormError('');

      const [vendorData, accountData] = await Promise.all([
        fetchTravelVendors({ includeBalance: 'true' }, { forceRefresh: true }),
        fetchTravelPaymentAccounts(),
      ]);

      const safeVendors = Array.isArray(vendorData) ? vendorData : [];

      const safeAccounts = Array.isArray(accountData) ? accountData : [];

      setVendors(safeVendors);
      setPaymentAccounts(safeAccounts);

      setFormState((current) => ({
        ...current,
        accountId: current.accountId || safeAccounts[0]?._id || '',
      }));
    } catch (error) {
      console.error('Travel vendor return references failed:', error);

      setFormError(t('travel.vendorReturns.referencesFailed'));
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!formVisible) {
      return;
    }

    loadReferences();
  }, [formVisible, loadReferences]);

  useEffect(() => {
    if (!formVisible || !formState.vendorId) {
      setInvoices([]);
      return undefined;
    }

    let active = true;

    const loadInvoices = async () => {
      try {
        const rows = await fetchTravelVendorReturnInvoices({
          vendorId: formState.vendorId,
          limit: 100,
        });

        if (active) {
          setInvoices(Array.isArray(rows) ? rows : []);
        }
      } catch (error) {
        console.error('Travel vendor return invoices failed:', error);

        if (active) {
          setInvoices([]);

          setFormError(t('travel.vendorReturns.referencesFailed'));
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [formState.vendorId, formVisible]);

  const updateField = useCallback((field, value) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));

    setSuccessMessage('');
  }, []);

  const selectVendor = useCallback((id) => {
    setFormState((current) => ({
      ...current,
      vendorId: id,
      originalInvoiceId: '',
      originalInvoiceNumber: '',
      serviceLabel: '',
      originalCost: '',
    }));

    setInvoices([]);
  }, []);

  const selectInvoice = useCallback(
    (event) => {
      const invoiceId = event.target.value;

      const invoice = invoices.find((row) => String(row._id) === String(invoiceId)) || null;

      setFormState((current) => ({
        ...current,
        originalInvoiceId: invoice?._id || '',
        originalInvoiceNumber: invoice ? getInvoiceLabel(invoice) : '',
        serviceLabel: invoice?.serviceLabel || '',
        originalCost:
          invoice?.eligibleCost !== undefined && invoice?.eligibleCost !== null
            ? String(invoice.eligibleCost)
            : current.originalCost,
      }));
    },
    [invoices]
  );

  const handleAttachmentChange = useCallback((event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    setFormState((current) => ({
      ...current,
      attachments: [...(current.attachments || []), ...files].slice(0, MAX_ATTACHMENTS),
    }));

    event.target.value = '';
  }, []);

  const removeAttachment = useCallback((index) => {
    setFormState((current) => ({
      ...current,
      attachments: (current.attachments || []).filter((_, fileIndex) => fileIndex !== index),
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      try {
        setSaving(true);
        setFormError('');
        setSuccessMessage('');

        await createTravelVendorReturn({
          ...formState,
          vendorPenaltyAmount: formState.vendorPenaltyAmount || computedPenalty,
        });

        setFormState((current) => ({
          ...createInitialForm(),
          accountId: current.accountId,
          paymentType: current.paymentType,
        }));

        setSuccessMessage(t('travel.vendorReturns.saveSuccess'));

        await loadList();

        navigate('/travel/vendor-returns');
      } catch (error) {
        console.error('Travel vendor return save failed:', error);

        setFormError(error?.response?.data?.message || t('travel.vendorReturns.saveFailed'));
      } finally {
        setSaving(false);
      }
    },
    [computedPenalty, formState, loadList, navigate]
  );

  const updateFilter = useCallback(
    (field, value) => {
      const nextParams = new URLSearchParams(searchParams);

      if (value) {
        nextParams.set(field, value);
      } else {
        nextParams.delete(field);
      }

      if (field !== 'page') {
        nextParams.delete('page');
      }

      setSearchParams(nextParams, {
        replace: true,
      });
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const handleDeleteVendorReturn = useCallback(
    async (record, event = null) => {
      event?.stopPropagation?.();

      if (!canManage) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      const label = record.returnNumber || t('travel.common.thisRecord');

      if (!window.confirm(buildTravelConfirmMessage('travel.vendorReturns.deleteConfirm', label))) {
        return;
      }

      try {
        setDeletingId(record._id);

        await deleteTravelVendorReturn(record._id, {
          reason: 'Travel vendor return reversed and archived by user',
        });

        setReturns((current) => current.filter((item) => String(item._id) !== String(record._id)));

        setTotal((current) => Math.max(Number(current || 0) - 1, 0));
      } catch (error) {
        console.error('Travel vendor return delete failed:', error);

        alert(error?.response?.data?.message || t('travel.vendorReturns.deleteFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [canManage]
  );

  const receivedStatusOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.vendorReturns.filters.allReceivedStatuses',
      },
      {
        value: 'received',
        labelKey: 'travel.receivedStatus.received',
      },
      {
        value: 'partial',
        labelKey: 'travel.receivedStatus.partial',
      },
      {
        value: 'outstanding',
        labelKey: 'travel.receivedStatus.outstanding',
      },
      {
        value: 'credit',
        labelKey: 'travel.receivedStatus.credit',
      },
    ],
    []
  );

  const columns = useMemo(
    () => [
      {
        key: 'returnNumber',
        labelKey: 'travel.vendorReturns.fields.returnNumber',
        className: 'w-[13%]',
        render: (record) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();

              navigate(`/travel/vendor-returns/${record._id}`);
            }}
            className="text-left font-extrabold text-cyan-700 transition hover:text-cyan-900 hover:underline"
          >
            {record.returnNumber || '-'}
          </button>
        ),
      },
      {
        key: 'vendor',
        labelKey: 'travel.fields.vendor',
        className: 'w-[18%]',
        render: (record) => (
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">
              {getVendorReturnVendorName(record)}
            </p>

            {getVendorReturnVendorPhone(record) && (
              <p className="truncate text-xs font-semibold text-slate-500">
                {getVendorReturnVendorPhone(record)}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'reference',
        labelKey: 'travel.fields.reference',
        className: 'w-[20%]',
        render: (record) => (
          <span className="line-clamp-2 font-semibold text-slate-700">
            {getVendorReturnReference(record)}
          </span>
        ),
      },
      {
        key: 'vendorReturnAmount',
        labelKey: 'travel.vendorReturns.fields.vendorReturnAmount',
        className: 'w-[14%]',
        render: (record) => (
          <span className="font-extrabold text-slate-900">
            {formatTravelMoney(record.vendorReturnAmount)}
          </span>
        ),
      },
      {
        key: 'amountReceivedNow',
        labelKey: 'travel.vendorReturns.fields.amountReceivedNow',
        className: 'w-[14%]',
        render: (record) => (
          <span className="font-extrabold text-emerald-700">
            {formatTravelMoney(record.amountReceivedNow)}
          </span>
        ),
      },
      {
        key: 'returnDate',
        labelKey: 'travel.vendorReturns.fields.returnDate',
        className: 'w-[13%]',
        render: (record) => formatDateWithOptionalTime(record.returnDate, record.returnTime),
      },
      {
        key: 'actions',
        labelKey: 'travel.fields.actions',
        className: 'w-[10%]',
        cellClassName: '!px-1.5 !py-2',
        render: (record) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-1.5">
            <IconButton
              icon={FaEye}
              variant="blue"
              title={t('travel.common.view')}
              onClick={(event) => {
                event.stopPropagation();

                navigate(`/travel/vendor-returns/${record._id}`);
              }}
            />

            {canManage && (
              <IconButton
                icon={FaTrash}
                variant="red"
                title={t('travel.common.delete')}
                disabled={deletingId === record._id}
                onClick={(event) => handleDeleteVendorReturn(record, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [canManage, deletingId, handleDeleteVendorReturn, navigate]
  );

  const renderMobileCard = useCallback(
    (record) => (
      <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-cyan-700">
                {record.returnNumber || '-'}
              </p>

              <p className="truncate text-xs font-semibold text-slate-500">
                {getVendorReturnVendorName(record)}
              </p>
            </div>

            <div className="flex shrink-0 gap-1.5">
              <IconButton
                icon={FaEye}
                variant="blue"
                title={t('travel.common.view')}
                onClick={(event) => {
                  event.stopPropagation();

                  navigate(`/travel/vendor-returns/${record._id}`);
                }}
              />

              {canManage && (
                <IconButton
                  icon={FaTrash}
                  variant="red"
                  title={t('travel.common.delete')}
                  disabled={deletingId === record._id}
                  onClick={(event) => handleDeleteVendorReturn(record, event)}
                />
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <TravelCardLine
              labelKey="travel.vendorReturns.fields.originalInvoice"
              value={record.originalInvoiceNumber || '-'}
            />

            <TravelCardLine
              labelKey="travel.vendorReturns.fields.returnDate"
              value={formatDateWithOptionalTime(record.returnDate, record.returnTime)}
            />

            <TravelCardLine
              labelKey="travel.vendorReturns.fields.vendorReturnAmount"
              value={formatTravelMoney(record.vendorReturnAmount)}
            />

            <TravelCardLine
              labelKey="travel.vendorReturns.fields.vendorPenaltyAmount"
              value={formatTravelMoney(record.vendorPenaltyAmount)}
            />

            <TravelCardLine
              labelKey="travel.vendorReturns.fields.amountReceivedNow"
              value={formatTravelMoney(record.amountReceivedNow)}
            />

            <TravelCardLine
              labelKey="travel.fields.status"
              value={t(`travel.receivedStatus.${getReturnReceivedStatus(record)}`)}
            />
          </div>
        </div>
      </article>
    ),
    [canManage, deletingId, handleDeleteVendorReturn, navigate]
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.vendorReturns.title"
      actions={
        formVisible ? (
          <IconButton
            icon={FaArrowLeft}
            variant="blue"
            title={t('travel.vendorReturns.backToList')}
            onClick={() => navigate('/travel/vendor-returns')}
          />
        ) : (
          <IconButton
            icon={FaPlus}
            variant="blue"
            title={t('travel.vendorReturns.add')}
            onClick={() => navigate('/travel/vendor-returns/new')}
          />
        )
      }
      filters={
        !formVisible && (
          <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(320px,1.8fr)_minmax(170px,auto)_44px_44px_44px_44px]">
            <TravelSearchInput
              value={filters.search}
              onChange={(value) => updateFilter('search', value)}
              placeholderKey="travel.vendorReturns.search"
            />

            <TravelFilterSelect
              value={filters.receivedStatus}
              onChange={(value) => updateFilter('receivedStatus', value)}
              options={receivedStatusOptions}
            />

            <CompactDateFilter
              value={filters.fromDate}
              onChange={(value) => updateFilter('fromDate', value)}
              title={t('travel.booking.filters.fromDate')}
              variant="blue"
            />

            <CompactDateFilter
              value={filters.toDate}
              onChange={(value) => updateFilter('toDate', value)}
              title={t('travel.booking.filters.toDate')}
              variant="violet"
            />

            <IconButton
              icon={FaTimes}
              variant="amber"
              title={t('travel.common.clearFilters')}
              onClick={clearFilters}
            />

            <IconButton
              icon={FaSyncAlt}
              variant="blue"
              title={t('travel.common.refresh')}
              disabled={loading}
              loading={loading}
              onClick={loadList}
            />
          </TravelMasterToolbar>
        )
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      {formVisible && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {formError}
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TravelCompactAutocomplete
              labelKey="travel.fields.vendor"
              value={formState.vendorId}
              onChange={selectVendor}
              records={vendors}
              getLabel={getVendorLabel}
              getMeta={getVendorMeta}
              placeholderKey="travel.payments.vendorPlaceholder"
              emptyKey="travel.payments.emptyVendors"
            />

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.originalInvoice')}
              </span>

              <select
                value={formState.originalInvoiceId}
                onChange={selectInvoice}
                disabled={!formState.vendorId}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">{t('travel.vendorReturns.noInvoice')}</option>

                {invoices.map((invoice) => (
                  <option key={invoice._id} value={invoice._id}>
                    {getInvoiceLabel(invoice)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.serviceLabel')}
              </span>

              <input
                type="text"
                value={formState.serviceLabel}
                onChange={(event) => updateField('serviceLabel', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.originalCost')}
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.originalCost}
                onChange={(event) => updateField('originalCost', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.vendorReturnAmount')}
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formState.vendorReturnAmount}
                onChange={(event) => updateField('vendorReturnAmount', event.target.value)}
                required
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.vendorPenaltyAmount')}
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.vendorPenaltyAmount}
                onChange={(event) => updateField('vendorPenaltyAmount', event.target.value)}
                placeholder={String(computedPenalty)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.amountReceivedNow')}
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.amountReceivedNow}
                onChange={(event) => updateField('amountReceivedNow', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.paymentType')}
              </span>

              <select
                value={formState.paymentType}
                onChange={(event) => updateField('paymentType', event.target.value)}
                disabled={amountReceivedNow <= 0}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-500"
              >
                {paymentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.paymentAccount')}
              </span>

              <select
                value={formState.accountId}
                onChange={(event) => updateField('accountId', event.target.value)}
                required={amountReceivedNow > 0}
                disabled={amountReceivedNow <= 0}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">{t('travel.payments.accountPlaceholder')}</option>

                {paymentAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.vendorReturns.fields.returnDate')}
              </span>

              <input
                type="date"
                value={formState.returnDate}
                onChange={(event) => updateField('returnDate', event.target.value)}
                required
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.time')}
              </span>

              <input
                type="time"
                value={formState.returnTime}
                onChange={(event) => updateField('returnTime', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="min-w-0 md:col-span-2">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.notes')}
              </span>

              <textarea
                rows={3}
                value={formState.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryBox
              labelKey="travel.fields.currentPayable"
              value={formatTravelMoney(selectedVendor?.currentPayable)}
              accent="text-rose-700"
            />

            <SummaryBox
              labelKey="travel.vendorReturns.fields.availableInvoiceCost"
              value={formatTravelMoney(selectedInvoice?.eligibleCost)}
              accent="text-slate-900"
            />

            <SummaryBox
              labelKey="travel.vendorReturns.fields.calculatedPenalty"
              value={formatTravelMoney(formState.vendorPenaltyAmount || computedPenalty)}
              accent="text-amber-700"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-slate-600">
                {t('travel.vendorReturns.fields.attachments')}
              </p>

              <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50">
                <FaPaperclip aria-hidden="true" className="text-[11px]" />

                {t('travel.booking.actions.attachFiles')}

                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleAttachmentChange}
                  disabled={(formState.attachments || []).length >= MAX_ATTACHMENTS}
                />
              </label>
            </div>

            {(formState.attachments || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {formState.attachments.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600"
                  >
                    <span className="truncate">{file.name}</span>

                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      title={t('travel.booking.actions.removeAttachment')}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                    >
                      <FaTimes aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <TravelActionButton type="submit" icon={FaSave} disabled={saving}>
              {saving ? t('travel.common.saving') : t('travel.vendorReturns.createAction')}
            </TravelActionButton>
          </div>
        </form>
      )}

      {!formVisible && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
            <span>
              {t('travel.booking.list.totalRecords')}: {total.toLocaleString('en-GB')}
            </span>

            <span>
              {t('travel.common.page')} {currentPage.toLocaleString('en-GB')} /{' '}
              {totalPages.toLocaleString('en-GB')}
            </span>
          </div>

          <TravelMasterList
            columns={columns}
            records={returns}
            onRowClick={(record) => navigate(`/travel/vendor-returns/${record._id}`)}
            renderMobileCard={renderMobileCard}
            emptyKey="travel.vendorReturns.empty"
          />

          <div className="mt-3 flex justify-end gap-1.5 sm:gap-2">
            <TravelActionButton
              variant="secondary"
              onClick={() => updateFilter('page', String(Math.max(currentPage - 1, 1)))}
              disabled={loading || currentPage <= 1}
            >
              {t('travel.common.previous')}
            </TravelActionButton>

            <TravelActionButton
              variant="secondary"
              onClick={() => updateFilter('page', String(currentPage + 1))}
              disabled={loading || currentPage >= totalPages}
            >
              {t('travel.common.next')}
            </TravelActionButton>
          </div>
        </>
      )}
    </TravelMasterPageFrame>
  );
};

export default TravelVendorReturnsPage;
