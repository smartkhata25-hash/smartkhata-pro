import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaCheckCircle,
  FaEye,
  FaSyncAlt,
  FaTimes,
  FaUndoAlt,
  FaWallet,
} from 'react-icons/fa';

import {
  TravelCardLine,
  TravelErrorModal,
  TravelFilterSelect,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
} from '../../components/travel/master/TravelMasterUI';
import {
  bookingServiceTypeOptions,
  formatBookingMoney,
  formatDate,
} from '../../components/travel/bookings/travelBookingConfig';
import { t } from '../../i18n/i18n';
import { fetchTravelPurchaseInvoices } from '../../services/travelMasterService';
import { hasPermission } from '../../utils/permissionHelper';

const PAGE_SIZE = 50;

const FILTER_DEFAULTS = Object.freeze({
  search: '',
  serviceType: '',
  fromDate: '',
  toDate: '',
  paymentStatus: '',
  page: '1',
});

const getFiltersFromParams = (searchParams) =>
  Object.keys(FILTER_DEFAULTS).reduce(
    (filters, field) => ({
      ...filters,
      [field]: searchParams.get(field) || FILTER_DEFAULTS[field],
    }),
    {}
  );

const getServiceLabel = (record) => {
  const labels = Array.isArray(record?.serviceLabels) ? record.serviceLabels.filter(Boolean) : [];

  if (labels.length > 0) {
    return labels.join(', ');
  }

  const types = Array.isArray(record?.serviceTypes) ? record.serviceTypes.filter(Boolean) : [];

  return types.map((type) => t(`travel.booking.itemTypes.${type}`)).join(', ') || '-';
};

const IconButton = ({ icon: Icon, title, variant = 'blue', disabled = false, onClick }) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    amber: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    violet: 'from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon
        aria-hidden="true"
        className={disabled && Icon === FaSyncAlt ? 'animate-spin text-[11px]' : 'text-[11px]'}
      />
    </button>
  );
};

const PaymentBadge = ({ record }) => {
  const config = {
    paid: {
      label: t('travel.booking.filters.paid'),
      icon: FaCheckCircle,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    partial: {
      label: t('travel.booking.filters.partial'),
      icon: FaWallet,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    due: {
      label: t('travel.booking.filters.due'),
      icon: FaWallet,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
  };
  const selected = config[record?.paymentStatus] || config.due;
  const Icon = selected.icon;

  return (
    <div className="min-w-0">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${selected.className}`}
      >
        <Icon aria-hidden="true" className="text-[10px]" />
        {selected.label}
      </span>
      <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
        {t('travel.purchaseInvoices.fields.payable')}:{' '}
        {formatBookingMoney(record?.payableAmount, record?.baseCurrency)}
      </p>
    </div>
  );
};

const PurchaseDetailModal = ({ record, onClose }) => {
  useEffect(() => {
    if (!record) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, record]);

  if (!record) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="travel-purchase-detail-title"
    >
      <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-200">
              {record.sourceInvoice}
            </p>
            <h2 id="travel-purchase-detail-title" className="mt-1 text-lg font-extrabold">
              {t('travel.purchaseInvoices.detailTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('travel.common.close')}
            aria-label={t('travel.common.close')}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 hover:bg-white/20"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.sourceInvoice"
            value={record.sourceInvoice}
          />
          <TravelCardLine labelKey="travel.fields.vendorName" value={record.vendorName} />
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.service"
            value={getServiceLabel(record)}
          />
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.purchaseAmount"
            value={formatBookingMoney(record.purchaseAmount, record.baseCurrency)}
          />
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.paidAmount"
            value={formatBookingMoney(record.paidAmount, record.baseCurrency)}
          />
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.payable"
            value={formatBookingMoney(record.payableAmount, record.baseCurrency)}
          />
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.previouslyReturned"
            value={formatBookingMoney(
              Number(record.priorVendorReturns || 0) + Number(record.priorRefundRecovery || 0),
              record.baseCurrency
            )}
          />
          <TravelCardLine
            labelKey="travel.purchaseInvoices.fields.remainingReturn"
            value={formatBookingMoney(record.remainingReturnAmount, record.baseCurrency)}
          />
          <TravelCardLine
            labelKey="travel.booking.fields.invoiceDate"
            value={formatDate(record.invoiceDate)}
          />
          <TravelCardLine
            labelKey="travel.booking.fields.travelDate"
            value={formatDate(record.travelDate)}
          />
        </div>
      </section>
    </div>
  );
};

const TravelPurchaseInvoicesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => getFiltersFromParams(searchParams), [searchParams]);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const requestRef = useRef(0);
  const canCreateReturn = hasPermission('travel.vendors.manage');
  const currentPage = Math.max(Number(filters.page || 1), 1);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

  const loadRecords = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      setLoading(true);
      setPageError('');

      const response = await fetchTravelPurchaseInvoices({
        search: filters.search,
        serviceType: filters.serviceType,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        paymentStatus: filters.paymentStatus,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      if (requestId !== requestRef.current) return;

      setRecords(Array.isArray(response?.data) ? response.data : []);
      setTotal(Number(response?.total || 0));
    } catch (error) {
      if (requestId !== requestRef.current) return;

      console.error('Travel purchase invoices load failed:', error);
      setPageError(error?.response?.data?.message || t('travel.purchaseInvoices.loadFailed'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [
    currentPage,
    filters.fromDate,
    filters.paymentStatus,
    filters.search,
    filters.serviceType,
    filters.toDate,
  ]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const updateFilter = useCallback(
    (field, value) => {
      const nextParams = new URLSearchParams(searchParams);

      if (value) nextParams.set(field, value);
      else nextParams.delete(field);

      if (field !== 'page') nextParams.delete('page');

      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    if (searchInput === (filters.search || '')) return undefined;

    const timer = window.setTimeout(() => updateFilter('search', searchInput), 350);
    return () => window.clearTimeout(timer);
  }, [filters.search, searchInput, updateFilter]);

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const openReturn = useCallback(
    (record, event = null) => {
      event?.stopPropagation?.();

      if (!canCreateReturn || !record?.canReturn) return;

      const params = new URLSearchParams({
        invoiceId: String(record.bookingId),
        vendorType: record.vendorType === 'party' ? 'party' : 'vendor',
      });

      if (record.vendorType === 'party') {
        params.set('vendorPartyId', String(record.vendorPartyId));
      } else {
        params.set('vendorId', String(record.vendorId));
      }

      navigate(`/travel/vendor-returns/new?${params.toString()}`);
    },
    [canCreateReturn, navigate]
  );

  const getReturnTitle = useCallback((record) => {
    if (record?.canReturn) return t('travel.purchaseInvoices.purchaseReturn');
    if (record?.returnDisabledReason === 'fully_returned') {
      return t('travel.purchaseInvoices.returnFullyUsed');
    }
    return t('travel.purchaseInvoices.returnVendorUnavailable');
  }, []);

  const serviceOptions = useMemo(
    () => [
      { value: '', labelKey: 'travel.booking.filters.allServiceTypes' },
      ...bookingServiceTypeOptions,
    ],
    []
  );

  const paymentOptions = useMemo(
    () => [
      { value: '', labelKey: 'travel.booking.filters.allPaymentStates' },
      { value: 'paid', labelKey: 'travel.booking.filters.paid' },
      { value: 'partial', labelKey: 'travel.booking.filters.partial' },
      { value: 'due', labelKey: 'travel.booking.filters.due' },
    ],
    []
  );

  const columns = useMemo(
    () => [
      {
        key: 'sourceInvoice',
        labelKey: 'travel.purchaseInvoices.fields.sourceInvoice',
        className: 'w-[14%]',
        render: (record) => (
          <button
            type="button"
            className="text-left font-extrabold text-cyan-700 transition hover:text-cyan-900 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedRecord(record);
            }}
          >
            {record.sourceInvoice || '-'}
          </button>
        ),
      },
      {
        key: 'vendor',
        labelKey: 'travel.fields.vendorName',
        className: 'w-[17%]',
        render: (record) => (
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">{record.vendorName || '-'}</p>
            {record.vendorPhone && (
              <p className="truncate text-xs font-semibold text-slate-500">{record.vendorPhone}</p>
            )}
          </div>
        ),
      },
      {
        key: 'service',
        labelKey: 'travel.purchaseInvoices.fields.service',
        className: 'w-[19%]',
        render: (record) => (
          <span className="line-clamp-2 font-semibold text-slate-700">{getServiceLabel(record)}</span>
        ),
      },
      {
        key: 'purchaseAmount',
        labelKey: 'travel.purchaseInvoices.fields.purchaseAmount',
        className: 'w-[13%]',
        render: (record) => (
          <span className="font-black text-slate-900">
            {formatBookingMoney(record.purchaseAmount, record.baseCurrency)}
          </span>
        ),
      },
      {
        key: 'paymentStatus',
        labelKey: 'travel.booking.fields.paymentStatus',
        className: 'w-[15%]',
        render: (record) => <PaymentBadge record={record} />,
      },
      {
        key: 'date',
        labelKey: 'travel.purchaseInvoices.fields.invoiceTravelDate',
        className: 'w-[12%]',
        render: (record) => (
          <div>
            <p className="font-bold text-slate-700">{formatDate(record.invoiceDate)}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              {formatDate(record.travelDate)}
            </p>
          </div>
        ),
      },
      {
        key: 'actions',
        labelKey: 'travel.fields.actions',
        className: 'w-[10%]',
        cellClassName: '!px-1 !py-2',
        render: (record) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
            <IconButton
              icon={FaEye}
              title={t('travel.common.view')}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedRecord(record);
              }}
            />
            {canCreateReturn && (
              <IconButton
                icon={FaUndoAlt}
                variant="violet"
                title={getReturnTitle(record)}
                disabled={!record.canReturn}
                onClick={(event) => openReturn(record, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [canCreateReturn, getReturnTitle, openReturn]
  );

  const renderMobileCard = useCallback(
    (record) => (
      <article
        className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
          String(selectedId) === String(record._id)
            ? 'border-cyan-400 ring-1 ring-cyan-100'
            : 'border-slate-200'
        }`}
        onClick={() => setSelectedId(record._id)}
      >
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-cyan-700">
                {record.sourceInvoice || '-'}
              </p>
              <p className="truncate text-xs font-semibold text-slate-600">
                {record.vendorName || '-'}
              </p>
            </div>
            <PaymentBadge record={record} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <TravelCardLine
              labelKey="travel.purchaseInvoices.fields.service"
              value={getServiceLabel(record)}
            />
            <TravelCardLine
              labelKey="travel.purchaseInvoices.fields.purchaseAmount"
              value={formatBookingMoney(record.purchaseAmount, record.baseCurrency)}
            />
            <TravelCardLine
              labelKey="travel.purchaseInvoices.fields.remainingReturn"
              value={formatBookingMoney(record.remainingReturnAmount, record.baseCurrency)}
            />
            <TravelCardLine
              labelKey="travel.purchaseInvoices.fields.invoiceTravelDate"
              value={`${formatDate(record.invoiceDate)} / ${formatDate(record.travelDate)}`}
            />
          </div>

          <div className="mt-4 flex justify-end gap-[3px] border-t border-slate-100 pt-3">
            <IconButton
              icon={FaEye}
              title={t('travel.common.view')}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedRecord(record);
              }}
            />
            {canCreateReturn && (
              <IconButton
                icon={FaUndoAlt}
                variant="violet"
                title={getReturnTitle(record)}
                disabled={!record.canReturn}
                onClick={(event) => openReturn(record, event)}
              />
            )}
          </div>
        </div>
      </article>
    ),
    [canCreateReturn, getReturnTitle, openReturn, selectedId]
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.purchaseInvoices.title"
      subtitleKey="travel.purchaseInvoices.subtitle"
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(280px,1.7fr)_minmax(160px,auto)_minmax(135px,auto)_minmax(135px,auto)_minmax(155px,auto)_44px_44px]">
          <TravelSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholderKey="travel.purchaseInvoices.search"
          />
          <TravelFilterSelect
            value={filters.serviceType}
            onChange={(value) => updateFilter('serviceType', value)}
            options={serviceOptions}
          />
          <input
            type="date"
            value={filters.fromDate}
            onChange={(event) => updateFilter('fromDate', event.target.value)}
            aria-label={t('travel.booking.filters.fromDate')}
            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
          <input
            type="date"
            value={filters.toDate}
            onChange={(event) => updateFilter('toDate', event.target.value)}
            aria-label={t('travel.booking.filters.toDate')}
            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
          <TravelFilterSelect
            value={filters.paymentStatus}
            onChange={(value) => updateFilter('paymentStatus', value)}
            options={paymentOptions}
          />
          <IconButton
            icon={FaTimes}
            variant="amber"
            title={t('travel.common.clearFilters')}
            onClick={clearFilters}
          />
          <IconButton
            icon={FaSyncAlt}
            title={t('travel.common.refresh')}
            disabled={loading}
            onClick={loadRecords}
          />
        </TravelMasterToolbar>
      }
    >
      <TravelErrorModal
        open={Boolean(pageError)}
        message={pageError}
        onClose={() => setPageError('')}
      />
      <PurchaseDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />

      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
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
        records={records}
        selectedId={selectedId}
        onRowClick={(record) => setSelectedId(record._id)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.purchaseInvoices.empty"
      />

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => updateFilter('page', String(Math.max(currentPage - 1, 1)))}
          disabled={loading || currentPage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('travel.common.previous')}
        </button>
        <button
          type="button"
          onClick={() => updateFilter('page', String(currentPage + 1))}
          disabled={loading || currentPage >= totalPages}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('travel.common.next')}
        </button>
      </div>
    </TravelMasterPageFrame>
  );
};

export default TravelPurchaseInvoicesPage;
