import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaBookOpen,
  FaEye,
  FaFileAlt,
  FaFilePdf,
  FaPrint,
  FaShareAlt,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  deleteTravelReceivePayment,
  deleteTravelVendorPayment,
  fetchTravelCustomers,
  fetchTravelPaymentAccounts,
  fetchTravelReceivePayments,
  fetchTravelVendorPayments,
  fetchTravelVendors,
  getTravelReceivePaymentPdfUrl,
  getTravelReceivePaymentPreviewUrl,
  getTravelReceivePaymentPrintUrl,
  getTravelVendorPaymentPdfUrl,
  getTravelVendorPaymentPreviewUrl,
  getTravelVendorPaymentPrintUrl,
} from '../../services/travelMasterService';
import { formatDateWithOptionalTime } from '../../utils/localDateTime';
import { buildTravelRouteState } from '../../utils/travelContext';
import { sharePdfDocument } from '../../utils/documentShare';
import {
  TravelCardLine,
  TravelFilterSelect,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';
import { hasPermission } from '../../utils/permissionHelper';

const PAGE_SIZE = 50;

const TRAVEL_RECEIVE_PAYMENT_ORIGIN = 'travel_receive_payment';
const TRAVEL_VENDOR_PAYMENT_ORIGIN = 'travel_vendor_payment';

const FILTER_DEFAULTS = Object.freeze({
  search: '',
  customerId: '',
  vendorId: '',
  fromDate: '',
  toDate: '',
  paymentType: '',
  accountId: '',
  page: '1',
});

const paymentTypeOptions = [
  {
    value: '',
    labelKey: 'travel.payments.filters.allPaymentMethods',
  },
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

const getDisplayDate = (date) => formatDateWithOptionalTime(date, '').replace(/\s+$/, '') || '-';

const getPartyName = (party) => party?.name || '-';

const getPartyContact = (party) => party?.phone || party?.email || '-';

const getAccountLabel = (account) =>
  [account?.name, account?.code].filter(Boolean).join(' - ') || '-';

const getPaymentMethodLabel = (method) =>
  method ? t(`travel.payments.paymentTypes.${method}`) : '-';

const getPaymentDocumentId = (record) => record?.journalEntryId || record?._id || '';

const getPaymentDocumentNumber = (record) =>
  record?.referenceNo || record?.receiptNumber || record?.paymentNumber || record?._id || 'payment';

const openDocumentUrl = (url) => {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');

  if (!opened) {
    alert(t('alerts.printWindowBlocked'));
  }
};

const getFiltersFromParams = (searchParams, isVendorMode) => ({
  search: searchParams.get('search') || FILTER_DEFAULTS.search,

  customerId: isVendorMode
    ? FILTER_DEFAULTS.customerId
    : searchParams.get('customerId') || FILTER_DEFAULTS.customerId,

  vendorId: isVendorMode
    ? searchParams.get('vendorId') || FILTER_DEFAULTS.vendorId
    : FILTER_DEFAULTS.vendorId,

  fromDate: searchParams.get('fromDate') || FILTER_DEFAULTS.fromDate,

  toDate: searchParams.get('toDate') || FILTER_DEFAULTS.toDate,

  paymentType: searchParams.get('paymentType') || FILTER_DEFAULTS.paymentType,

  accountId: searchParams.get('accountId') || FILTER_DEFAULTS.accountId,

  page: searchParams.get('page') || FILTER_DEFAULTS.page,
});

const buildSelectOptions = (records, allKey) => [
  {
    value: '',
    labelKey: allKey,
  },
  ...records.map((record) => ({
    value: record._id,
    label: [record.name, record.phone].filter(Boolean).join(' - ') || record.name || '-',
  })),
];

const IconButton = ({
  icon: Icon,
  title,
  variant = 'blue',
  disabled = false,
  compact = false,
  onClick,
}) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    orange: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    red: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',
    slate: 'from-slate-500 to-slate-700 hover:from-slate-600 hover:to-slate-800',
    emerald: 'from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? 'h-[30px] w-[30px]' : 'h-8 w-8 sm:h-9 sm:w-9'
      } ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon
        aria-hidden="true"
        className={
          disabled && Icon === FaSyncAlt
            ? `${compact ? 'text-[11px]' : 'text-xs sm:text-sm'} animate-spin`
            : compact
              ? 'text-[11px]'
              : 'text-xs sm:text-sm'
        }
      />
    </button>
  );
};

const TravelPaymentHistoryPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  const isVendorMode = location.pathname.includes('/payments/vendors');

  const [records, setRecords] = useState([]);
  const [parties, setParties] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState('');
  const [sharingId, setSharingId] = useState('');

  const canDeletePayment = isVendorMode
    ? hasPermission('travel.vendors.manage') || hasPermission('travel.payments')
    : hasPermission('travel.bookings.edit') || hasPermission('travel.payments');

  const filters = useMemo(
    () => getFiltersFromParams(searchParams, isVendorMode),
    [isVendorMode, searchParams]
  );

  const currentPage = Math.max(Number(filters.page || 1), 1);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const recordsRequestRef = useRef(0);
  const [searchInput, setSearchInput] = useState(filters.search || '');

  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

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
    setSearchInput('');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (searchInput === (filters.search || '')) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      updateFilter('search', searchInput);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [filters.search, searchInput, updateFilter]);

  const loadReferences = useCallback(async () => {
    try {
      const [partyData, accountData] = await Promise.all([
        isVendorMode ? fetchTravelVendors() : fetchTravelCustomers(),

        fetchTravelPaymentAccounts(),
      ]);

      setParties(Array.isArray(partyData) ? partyData : []);

      setPaymentAccounts(Array.isArray(accountData) ? accountData : []);
    } catch (error) {
      console.error('Travel payment history references failed:', error);
    }
  }, [isVendorMode]);

  const loadRecords = useCallback(async () => {
    const requestId = recordsRequestRef.current + 1;
    recordsRequestRef.current = requestId;

    try {
      setLoading(true);
      setPageError('');

      const fetcher = isVendorMode ? fetchTravelVendorPayments : fetchTravelReceivePayments;

      const payload = await fetcher({
        ...filters,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      if (requestId !== recordsRequestRef.current) {
        return;
      }

      setRecords(Array.isArray(payload?.data) ? payload.data : []);

      setTotal(Number(payload?.total || 0));
    } catch (error) {
      if (requestId !== recordsRequestRef.current) {
        return;
      }

      console.error('Travel payment history load failed:', error);

      setPageError(
        isVendorMode
          ? t('travel.payments.vendorHistory.loadFailed')
          : t('travel.payments.receivedHistory.loadFailed')
      );
    } finally {
      if (requestId === recordsRequestRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, filters, isVendorMode]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const partyOptions = useMemo(
    () =>
      buildSelectOptions(
        parties,
        isVendorMode ? 'travel.payments.filters.allVendors' : 'travel.payments.filters.allCustomers'
      ),
    [isVendorMode, parties]
  );

  const accountOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.payments.filters.allAccounts',
      },

      ...paymentAccounts.map((account) => ({
        value: account._id,
        label: getAccountLabel(account),
      })),
    ],
    [paymentAccounts]
  );

  const openRow = useCallback(
    (record) => {
      if (record?.invoiceId) {
        navigate(`/travel/bookings/${record.invoiceId}`);

        return;
      }

      const party = isVendorMode ? record?.vendor : record?.customer;

      if (!party?._id) {
        return;
      }

      navigate(
        isVendorMode
          ? `/supplier-ledger/${party._id}?moduleScope=travel`
          : `/customer-ledger/${party._id}?moduleScope=travel`,
        {
          state: buildTravelRouteState(`${location.pathname}${location.search}`),
        }
      );
    },
    [isVendorMode, location.pathname, location.search, navigate]
  );

  const canDeleteRecord = useCallback(
    (record) => {
      if (!canDeletePayment || !record?.sourceRecordId) {
        return false;
      }

      return isVendorMode
        ? record.originModule === TRAVEL_VENDOR_PAYMENT_ORIGIN
        : record.originModule === TRAVEL_RECEIVE_PAYMENT_ORIGIN;
    },
    [canDeletePayment, isVendorMode]
  );

  const getPrintUrl = useCallback(
    (id) =>
      isVendorMode ? getTravelVendorPaymentPrintUrl(id) : getTravelReceivePaymentPrintUrl(id),
    [isVendorMode]
  );

  const getPreviewUrl = useCallback(
    (id) =>
      isVendorMode ? getTravelVendorPaymentPreviewUrl(id) : getTravelReceivePaymentPreviewUrl(id),
    [isVendorMode]
  );

  const getPdfUrl = useCallback(
    (id) => (isVendorMode ? getTravelVendorPaymentPdfUrl(id) : getTravelReceivePaymentPdfUrl(id)),
    [isVendorMode]
  );

  const handleOpenPaymentPreview = useCallback(
    (record, event = null) => {
      event?.stopPropagation?.();

      const documentId = getPaymentDocumentId(record);

      if (!documentId) {
        return;
      }

      openDocumentUrl(getPreviewUrl(documentId));
    },
    [getPreviewUrl]
  );

  const handleOpenPaymentPrint = useCallback(
    (record, event = null) => {
      event?.stopPropagation?.();

      const documentId = getPaymentDocumentId(record);

      if (!documentId) {
        return;
      }

      openDocumentUrl(getPrintUrl(documentId));
    },
    [getPrintUrl]
  );

  const handleOpenPaymentPdf = useCallback(
    (record, event = null) => {
      event?.stopPropagation?.();

      const documentId = getPaymentDocumentId(record);

      if (!documentId) {
        return;
      }

      openDocumentUrl(getPdfUrl(documentId));
    },
    [getPdfUrl]
  );

  const handleSharePaymentPdf = useCallback(
    async (record, event = null) => {
      event?.stopPropagation?.();

      const documentId = getPaymentDocumentId(record);

      if (!documentId) {
        return;
      }

      const documentNumber = getPaymentDocumentNumber(record);
      const fileName = `${
        isVendorMode ? 'TravelVendorPaymentReceipt' : 'TravelReceivePaymentReceipt'
      }-${documentNumber}.pdf`;

      try {
        setSharingId(documentId);

        await sharePdfDocument({
          pdfUrl: getPdfUrl(documentId),
          token: localStorage.getItem('token'),
          fileName,
          title: fileName,
          text: fileName,
        });
      } catch (error) {
        console.error('Travel payment receipt share failed:', error);

        alert(t('pdf.shareFailed'));
      } finally {
        setSharingId('');
      }
    },
    [getPdfUrl, isVendorMode]
  );

  const handleDeletePayment = useCallback(
    async (record, event = null) => {
      event?.stopPropagation?.();

      if (!canDeleteRecord(record)) {
        return;
      }

      const label = record.referenceNo || record.paymentNumber || t('travel.common.thisRecord');

      const confirmKey = isVendorMode
        ? 'travel.payments.vendorHistory.deleteConfirm'
        : 'travel.payments.receivedHistory.deleteConfirm';

      if (!window.confirm(buildTravelConfirmMessage(confirmKey, label))) {
        return;
      }

      try {
        setDeletingId(record._id);

        const deleteFn = isVendorMode ? deleteTravelVendorPayment : deleteTravelReceivePayment;

        await deleteFn(record.sourceRecordId, {
          reason: isVendorMode
            ? 'Travel vendor payment reversed and archived by user'
            : 'Travel receive payment reversed and archived by user',
        });

        await loadRecords();
      } catch (error) {
        console.error('Travel payment delete failed:', error);

        alert(
          error?.response?.data?.message ||
            (isVendorMode
              ? t('travel.payments.vendorHistory.deleteFailed')
              : t('travel.payments.receivedHistory.deleteFailed'))
        );
      } finally {
        setDeletingId('');
      }
    },
    [canDeleteRecord, isVendorMode, loadRecords]
  );

  const contextualReferenceColumn = useMemo(
    () =>
      isVendorMode
        ? {
            key: 'reference',

            labelKey: 'travel.fields.reference',

            className: 'w-[12%]',

            render: (record) => (
              <span className="line-clamp-2 text-slate-700">{record.notes || '-'}</span>
            ),
          }
        : {
            key: 'invoiceNo',

            labelKey: 'travel.booking.fields.invoiceNumber',

            className: 'w-[12%]',

            render: (record) => (
              <span className="font-semibold text-slate-700">{record.invoiceNo || '-'}</span>
            ),
          },
    [isVendorMode]
  );

  const columns = useMemo(
    () => [
      {
        key: 'date',
        labelKey: 'travel.fields.date',
        className: 'w-[8%]',
        render: (record) => getDisplayDate(record.date),
      },

      {
        key: 'time',
        labelKey: 'travel.fields.time',
        className: 'w-[6%]',
        render: (record) => record.time || '-',
      },

      {
        key: 'referenceNo',

        labelKey: isVendorMode
          ? 'travel.payments.fields.paymentNumber'
          : 'travel.payments.fields.receiptNumber',

        className: 'w-[12%]',

        render: (record) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openRow(record);
            }}
            className="font-extrabold text-cyan-700 transition hover:text-cyan-900 hover:underline"
          >
            {record.referenceNo || '-'}
          </button>
        ),
      },

      {
        key: 'party',

        labelKey: isVendorMode ? 'travel.fields.vendor' : 'travel.fields.customer',

        className: 'w-[13%]',

        render: (record) => {
          const party = isVendorMode ? record.vendor : record.customer;

          return (
            <div className="min-w-0">
              <p className="truncate font-extrabold text-slate-900">{getPartyName(party)}</p>

              <p className="truncate text-xs font-semibold text-slate-500">
                {getPartyContact(party)}
              </p>
            </div>
          );
        },
      },

      contextualReferenceColumn,

      {
        key: 'paymentMethod',

        labelKey: 'travel.fields.paymentType',

        className: 'w-[8%]',

        render: (record) => (
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
            {getPaymentMethodLabel(record.paymentMethod)}
          </span>
        ),
      },

      {
        key: 'paymentAccount',

        labelKey: 'travel.fields.paymentAccount',

        className: 'w-[12%]',

        render: (record) => (
          <span className="font-semibold text-slate-700">
            {getAccountLabel(record.paymentAccount)}
          </span>
        ),
      },

      {
        key: 'amount',

        labelKey: 'travel.fields.amount',

        className: 'w-[8%]',

        render: (record) => (
          <span className={`font-black ${isVendorMode ? 'text-rose-700' : 'text-emerald-700'}`}>
            {formatTravelMoney(record.amount)}
          </span>
        ),
      },

      {
        key: 'actions',

        labelKey: 'travel.fields.actions',

        className: 'w-[21%]',
        cellClassName: '!px-1 !py-2',

        render: (record) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
            {getPaymentDocumentId(record) && (
              <>
                <IconButton
                  icon={FaFileAlt}
                  variant="blue"
                  title={t('common.preview')}
                  compact
                  onClick={(event) => handleOpenPaymentPreview(record, event)}
                />

                <IconButton
                  icon={FaPrint}
                  variant="slate"
                  title={t('common.print')}
                  compact
                  onClick={(event) => handleOpenPaymentPrint(record, event)}
                />

                <IconButton
                  icon={FaFilePdf}
                  variant="orange"
                  title={t('pdf.download')}
                  compact
                  onClick={(event) => handleOpenPaymentPdf(record, event)}
                />

                <IconButton
                  icon={FaShareAlt}
                  variant="emerald"
                  title={t('pdf.share')}
                  disabled={sharingId === getPaymentDocumentId(record)}
                  compact
                  onClick={(event) => handleSharePaymentPdf(record, event)}
                />
              </>
            )}

            <IconButton
              icon={record.invoiceId ? FaEye : FaBookOpen}
              variant={record.invoiceId ? 'blue' : 'emerald'}
              title={record.invoiceId ? t('travel.common.view') : t('travel.common.viewLedger')}
              compact
              onClick={(event) => {
                event.stopPropagation();
                openRow(record);
              }}
            />

            {canDeleteRecord(record) && (
              <IconButton
                icon={FaTrash}
                variant="red"
                title={t('travel.common.delete')}
                disabled={deletingId === record._id}
                compact
                onClick={(event) => handleDeletePayment(record, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [
      canDeleteRecord,
      contextualReferenceColumn,
      deletingId,
      handleDeletePayment,
      handleOpenPaymentPdf,
      handleOpenPaymentPreview,
      handleOpenPaymentPrint,
      handleSharePaymentPdf,
      isVendorMode,
      openRow,
      sharingId,
    ]
  );

  const renderMobileCard = useCallback(
    (record) => {
      const party = isVendorMode ? record.vendor : record.customer;

      return (
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div
            className={`h-1 ${
              isVendorMode
                ? 'bg-gradient-to-r from-rose-500 to-orange-400'
                : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
            }`}
          />

          <div className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-slate-950">
                  {getPartyName(party)}
                </p>

                <p className="truncate text-xs font-semibold text-cyan-700">
                  {record.referenceNo || '-'}
                </p>
              </div>

              <p
                className={`shrink-0 text-sm font-black ${
                  isVendorMode ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatTravelMoney(record.amount)}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <TravelCardLine labelKey="travel.fields.date" value={getDisplayDate(record.date)} />

              <TravelCardLine labelKey="travel.fields.time" value={record.time || '-'} />

              <TravelCardLine
                labelKey="travel.fields.paymentType"
                value={getPaymentMethodLabel(record.paymentMethod)}
              />

              <TravelCardLine
                labelKey="travel.fields.paymentAccount"
                value={getAccountLabel(record.paymentAccount)}
              />

              <TravelCardLine
                labelKey={
                  isVendorMode ? 'travel.fields.reference' : 'travel.booking.fields.invoiceNumber'
                }
                value={isVendorMode ? record.notes || '-' : record.invoiceNo || '-'}
              />

              {!isVendorMode && (
                <TravelCardLine labelKey="travel.fields.notes" value={record.notes || '-'} />
              )}
            </div>

            <div className="mt-4 flex flex-nowrap justify-end gap-[3px] border-t border-slate-100 pt-3">
              {getPaymentDocumentId(record) && (
                <>
                  <IconButton
                    icon={FaFileAlt}
                    variant="blue"
                    title={t('common.preview')}
                    compact
                    onClick={(event) => handleOpenPaymentPreview(record, event)}
                  />

                  <IconButton
                    icon={FaPrint}
                    variant="slate"
                    title={t('common.print')}
                    compact
                    onClick={(event) => handleOpenPaymentPrint(record, event)}
                  />

                  <IconButton
                    icon={FaFilePdf}
                    variant="orange"
                    title={t('pdf.download')}
                    compact
                    onClick={(event) => handleOpenPaymentPdf(record, event)}
                  />

                  <IconButton
                    icon={FaShareAlt}
                    variant="emerald"
                    title={t('pdf.share')}
                    disabled={sharingId === getPaymentDocumentId(record)}
                    compact
                    onClick={(event) => handleSharePaymentPdf(record, event)}
                  />
                </>
              )}

              <IconButton
              icon={record.invoiceId ? FaEye : FaBookOpen}
              variant={record.invoiceId ? 'blue' : 'emerald'}
              title={record.invoiceId ? t('travel.common.view') : t('travel.common.viewLedger')}
              compact
              onClick={(event) => {
                event.stopPropagation();
                openRow(record);
                }}
              />

              {canDeleteRecord(record) && (
                <IconButton
                  icon={FaTrash}
                  variant="red"
                  title={t('travel.common.delete')}
                  disabled={deletingId === record._id}
                  compact
                  onClick={(event) => handleDeletePayment(record, event)}
                />
              )}
            </div>
          </div>
        </article>
      );
    },
    [
      canDeleteRecord,
      deletingId,
      handleDeletePayment,
      handleOpenPaymentPdf,
      handleOpenPaymentPreview,
      handleOpenPaymentPrint,
      handleSharePaymentPdf,
      isVendorMode,
      openRow,
      sharingId,
    ]
  );

  return (
    <TravelMasterPageFrame
      titleKey={
        isVendorMode
          ? 'travel.payments.vendorHistory.title'
          : 'travel.payments.receivedHistory.title'
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(190px,1fr)_minmax(150px,auto)_minmax(130px,auto)_minmax(130px,auto)_minmax(145px,auto)_minmax(160px,auto)_44px_44px]">
          <TravelSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholderKey="travel.payments.filters.search"
          />

          <TravelFilterSelect
            value={isVendorMode ? filters.vendorId : filters.customerId}
            onChange={(value) => updateFilter(isVendorMode ? 'vendorId' : 'customerId', value)}
            options={partyOptions}
          />

          <input
            type="date"
            value={filters.fromDate}
            onChange={(event) => updateFilter('fromDate', event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            aria-label={t('travel.booking.filters.fromDate')}
          />

          <input
            type="date"
            value={filters.toDate}
            onChange={(event) => updateFilter('toDate', event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            aria-label={t('travel.booking.filters.toDate')}
          />

          <TravelFilterSelect
            value={filters.paymentType}
            onChange={(value) => updateFilter('paymentType', value)}
            options={paymentTypeOptions}
          />

          <TravelFilterSelect
            value={filters.accountId}
            onChange={(value) => updateFilter('accountId', value)}
            options={accountOptions}
          />

          <IconButton
            icon={FaTimes}
            variant="orange"
            title={t('travel.common.clearFilters')}
            onClick={clearFilters}
          />

          <IconButton
            icon={FaSyncAlt}
            variant="blue"
            title={t('travel.common.refresh')}
            onClick={loadRecords}
            disabled={loading}
          />
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

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
        records={records}
        onRowClick={openRow}
        renderMobileCard={renderMobileCard}
        emptyKey={
          isVendorMode
            ? 'travel.payments.vendorHistory.empty'
            : 'travel.payments.receivedHistory.empty'
        }
      />

      <div className="mt-4 flex items-center justify-end gap-2">
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

export default TravelPaymentHistoryPage;
