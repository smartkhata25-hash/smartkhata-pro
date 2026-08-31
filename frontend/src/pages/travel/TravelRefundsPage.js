import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCalendarAlt, FaEye, FaPlus, FaSyncAlt, FaTimes, FaTrash } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { deleteTravelRefund, fetchTravelRefunds } from '../../services/travelMasterService';
import { formatDateWithOptionalTime } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import {
  TravelActionButton,
  TravelCardLine,
  TravelFilterSelect,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
} from '../../components/travel/master/TravelMasterUI';
import {
  formatBookingMoney,
  getCustomerName,
} from '../../components/travel/bookings/travelBookingConfig';

const PAGE_SIZE = 50;

const FILTER_DEFAULTS = Object.freeze({
  search: '',
  fromDate: '',
  toDate: '',
  penaltyStatus: '',
  paymentStatus: '',
  page: '1',
});

const getRefundInvoiceNumber = (refund) =>
  refund.originalInvoiceNumber ||
  refund.originalInvoiceId?.invoiceNumber ||
  refund.originalInvoiceId?.bookingNumber ||
  '-';

const getFiltersFromParams = (searchParams) =>
  Object.keys(FILTER_DEFAULTS).reduce(
    (filters, field) => ({
      ...filters,
      [field]: searchParams.get(field) || FILTER_DEFAULTS[field],
    }),
    {}
  );

const getRefundPaymentStatus = (refund) => {
  const paidBack = Number(refund.paidBackAmount || 0);
  const customerRefund = Number(refund.customerRefundAmount || 0);

  if (customerRefund <= 0 || paidBack >= customerRefund) {
    return 'paid';
  }

  if (paidBack > 0) {
    return 'partial';
  }

  return 'outstanding';
};

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

const TravelRefundsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [refunds, setRefunds] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const filters = useMemo(() => getFiltersFromParams(searchParams), [searchParams]);

  const currentPage = Math.max(Number(filters.page || 1), 1);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const canView = hasPermission('travel.bookings.view');
  const canCreate = hasPermission('travel.bookings.edit');
  const canDelete = canCreate;

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

      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const loadRefunds = useCallback(async () => {
    if (!canView) {
      return;
    }

    try {
      setLoading(true);
      setPageError('');

      const response = await fetchTravelRefunds({
        search: filters.search,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        penaltyStatus: filters.penaltyStatus,
        paymentStatus: filters.paymentStatus,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      setRefunds(Array.isArray(response?.data) ? response.data : []);
      setTotal(Number(response?.total || 0));
    } catch (error) {
      console.error('Travel refunds load failed:', error);
      setPageError(t('travel.refund.alerts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    currentPage,
    filters.fromDate,
    filters.paymentStatus,
    filters.penaltyStatus,
    filters.search,
    filters.toDate,
  ]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      loadRefunds();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [loadRefunds]);

  const penaltyOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.refund.filters.allPenalties',
      },
      {
        value: 'with',
        labelKey: 'travel.refund.filters.withPenalty',
      },
      {
        value: 'without',
        labelKey: 'travel.refund.filters.withoutPenalty',
      },
    ],
    []
  );

  const paymentStatusOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.refund.filters.allPaymentStatuses',
      },
      {
        value: 'paid',
        labelKey: 'travel.paymentStatus.paid',
      },
      {
        value: 'partial',
        labelKey: 'travel.paymentStatus.partial',
      },
      {
        value: 'outstanding',
        labelKey: 'travel.paymentStatus.outstanding',
      },
      {
        value: 'credit',
        labelKey: 'travel.paymentStatus.credit',
      },
    ],
    []
  );

  const handleDeleteRefund = useCallback(
    async (refund, event = null) => {
      event?.stopPropagation?.();

      if (!canDelete) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      const label = refund.refundNumber || t('travel.common.thisRecord');

      if (
        !window.confirm(buildTravelConfirmMessage('travel.refund.actions.deleteConfirm', label))
      ) {
        return;
      }

      try {
        setDeletingId(refund._id);

        await deleteTravelRefund(refund._id, {
          reason: 'Travel refund reversed and archived by user',
        });

        setRefunds((current) => current.filter((item) => String(item._id) !== String(refund._id)));

        setTotal((current) => Math.max(Number(current || 0) - 1, 0));
      } catch (error) {
        console.error('Travel refund delete failed:', error);

        alert(error?.response?.data?.message || t('travel.refund.alerts.deleteFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [canDelete]
  );

  const columns = useMemo(
    () => [
      {
        key: 'refundNumber',
        labelKey: 'travel.refund.fields.refundNumber',
        className: 'w-[13%]',
        render: (refund) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/travel/refunds/${refund._id}`);
            }}
            className="text-left font-extrabold text-cyan-700 transition hover:text-cyan-900 hover:underline"
          >
            {refund.refundNumber || '-'}
          </button>
        ),
      },
      {
        key: 'originalInvoiceNumber',
        labelKey: 'travel.refund.fields.originalInvoice',
        className: 'w-[14%]',
        render: getRefundInvoiceNumber,
      },
      {
        key: 'customer',
        labelKey: 'travel.booking.fields.customer',
        className: 'w-[17%]',
        render: (refund) => (
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">
              {getCustomerName(refund.customerId)}
            </p>

            {refund.customerId?.phone && (
              <p className="truncate text-xs font-semibold text-slate-500">
                {refund.customerId.phone}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'grossRefundAmount',
        labelKey: 'travel.refund.fields.grossRefundAmount',
        className: 'w-[13%]',
        render: (refund) => (
          <span className="font-extrabold text-slate-900">
            {formatBookingMoney(refund.grossRefundAmount)}
          </span>
        ),
      },
      {
        key: 'penaltyAmount',
        labelKey: 'travel.refund.fields.penaltyAmount',
        className: 'w-[11%]',
        render: (refund) => (
          <span className="font-bold text-amber-700">
            {formatBookingMoney(refund.penaltyAmount)}
          </span>
        ),
      },
      {
        key: 'paidBackAmount',
        labelKey: 'travel.refund.fields.paidBackAmount',
        className: 'w-[12%]',
        render: (refund) => (
          <span className="font-extrabold text-emerald-700">
            {formatBookingMoney(refund.paidBackAmount)}
          </span>
        ),
      },
      {
        key: 'refundDate',
        labelKey: 'travel.refund.fields.refundDate',
        className: 'w-[12%]',
        render: (refund) => formatDateWithOptionalTime(refund.refundDate, refund.refundTime),
      },
      {
        key: 'actions',
        labelKey: 'travel.fields.actions',
        className: 'w-[10%]',
        cellClassName: '!px-1.5 !py-2',
        render: (refund) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-1.5">
            <IconButton
              icon={FaEye}
              variant="blue"
              title={t('travel.common.view')}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/travel/refunds/${refund._id}`);
              }}
            />

            {canDelete && (
              <IconButton
                icon={FaTrash}
                variant="red"
                title={t('travel.common.delete')}
                disabled={deletingId === refund._id}
                onClick={(event) => handleDeleteRefund(refund, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [canDelete, deletingId, handleDeleteRefund, navigate]
  );

  const renderMobileCard = useCallback(
    (refund) => (
      <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-cyan-700">
                {refund.refundNumber || '-'}
              </p>

              <p className="truncate text-xs font-semibold text-slate-500">
                {getRefundInvoiceNumber(refund)}
              </p>
            </div>

            <div className="flex shrink-0 gap-1.5">
              <IconButton
                icon={FaEye}
                variant="blue"
                title={t('travel.common.view')}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/travel/refunds/${refund._id}`);
                }}
              />

              {canDelete && (
                <IconButton
                  icon={FaTrash}
                  variant="red"
                  title={t('travel.common.delete')}
                  disabled={deletingId === refund._id}
                  onClick={(event) => handleDeleteRefund(refund, event)}
                />
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <TravelCardLine
              labelKey="travel.booking.fields.customer"
              value={getCustomerName(refund.customerId)}
            />

            <TravelCardLine
              labelKey="travel.refund.fields.refundDate"
              value={formatDateWithOptionalTime(refund.refundDate, refund.refundTime)}
            />

            <TravelCardLine
              labelKey="travel.fields.status"
              value={t(`travel.paymentStatus.${getRefundPaymentStatus(refund)}`)}
            />

            <TravelCardLine
              labelKey="travel.refund.fields.grossRefundAmount"
              value={formatBookingMoney(refund.grossRefundAmount)}
            />

            <TravelCardLine
              labelKey="travel.refund.fields.penaltyAmount"
              value={formatBookingMoney(refund.penaltyAmount)}
            />

            <TravelCardLine
              labelKey="travel.refund.fields.paidBackAmount"
              value={formatBookingMoney(refund.paidBackAmount)}
            />
          </div>
        </div>
      </article>
    ),
    [canDelete, deletingId, handleDeleteRefund, navigate]
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.refund.list.title"
      actions={
        canCreate && (
          <TravelActionButton icon={FaPlus} onClick={() => navigate('/travel/refunds/new')}>
            {t('travel.refund.actions.new')}
          </TravelActionButton>
        )
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(300px,1.8fr)_minmax(145px,auto)_minmax(155px,auto)_44px_44px_44px_44px]">
          <TravelSearchInput
            value={filters.search}
            onChange={(value) => updateFilter('search', value)}
            placeholderKey="travel.refund.filters.search"
          />

          <TravelFilterSelect
            value={filters.penaltyStatus}
            onChange={(value) => updateFilter('penaltyStatus', value)}
            options={penaltyOptions}
          />

          <TravelFilterSelect
            value={filters.paymentStatus}
            onChange={(value) => updateFilter('paymentStatus', value)}
            options={paymentStatusOptions}
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
            onClick={loadRefunds}
          />
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      <div className="mb-2 flex items-center gap-3 text-xs font-bold text-slate-500">
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
        records={refunds}
        onRowClick={(refund) => navigate(`/travel/refunds/${refund._id}`)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.refund.list.empty"
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
    </TravelMasterPageFrame>
  );
};

export default TravelRefundsPage;
