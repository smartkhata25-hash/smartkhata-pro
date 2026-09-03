import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaCheckCircle,
  FaEdit,
  FaEye,
  FaPlus,
  FaShareAlt,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaWallet,
} from 'react-icons/fa';

import {
  deleteTravelBooking,
  fetchTravelBookings,
  getTravelBookingPdfUrl,
} from '../../services/travelMasterService';
import { t } from '../../i18n/i18n';
import usePageMemory from '../../hooks/usePageMemory';
import { hasPermission } from '../../utils/permissionHelper';
import { sharePdfDocument } from '../../utils/documentShare';
import {
  TravelCardLine,
  TravelFilterSelect,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
} from '../../components/travel/master/TravelMasterUI';
import {
  bookingServiceTypeOptions,
  formatBookingMoney,
  formatDate,
  getCustomerName,
} from '../../components/travel/bookings/travelBookingConfig';

const PAGE_DEFAULTS = {
  search: '',
  serviceType: '',
  fromDate: '',
  toDate: '',
  balance: '',
  datePreset: '',
  page: '1',
  selectedId: '',
};

const URL_FILTER_FIELDS = [
  'search',
  'serviceType',
  'fromDate',
  'toDate',
  'balance',
  'datePreset',
  'page',
];

const PAGE_SIZE = 50;

const SERVICE_TYPE_ALIASES = Object.freeze({
  visa: 'visit_visa',
  visas: 'visit_visa',
  ticket: 'air_ticket',
  tickets: 'air_ticket',
  hotel: 'hotel',
  hotels: 'hotel',
  umrah: 'umrah_package',
});

const normalizeServiceTypeFilter = (value = '') => {
  const clean = String(value || '')
    .trim()
    .toLowerCase();

  return SERVICE_TYPE_ALIASES[clean] || clean;
};

const getBookingServices = (booking) => {
  const itemTypes = [
    ...new Set((booking.bookingItems || []).map((item) => item.itemType).filter(Boolean)),
  ];

  if (itemTypes.length === 0) {
    return t(`travel.booking.serviceTypes.${booking.serviceType || 'mixed'}`);
  }

  return itemTypes.map((type) => t(`travel.booking.itemTypes.${type}`)).join(', ');
};

const getVendorName = (vendor) => {
  if (!vendor) {
    return '';
  }

  if (typeof vendor === 'string') {
    return '';
  }

  return vendor.name || '';
};

const getBookingCustomer = (booking) => booking?.customer || booking?.customerPartyId || booking?.customerId;

const getBookingCustomerName = (booking) => getCustomerName(getBookingCustomer(booking));

const getBookingCustomerPhone = (booking) => {
  const customer = getBookingCustomer(booking);

  return typeof customer === 'object' ? customer?.phone || '' : '';
};

const getItemVendor = (item) => item?.vendor || item?.vendorPartyId || item?.vendorId;

const getBookingVendors = (booking) => {
  const vendorMap = new Map();

  (booking.bookingItems || []).forEach((item) => {
    const directVendor = getItemVendor(item);
    const directVendorName = getVendorName(directVendor);
    const directVendorId =
      typeof directVendor === 'object'
        ? String(directVendor?._id || directVendor?.id || '')
        : String(directVendor || '');

    if (directVendorName) {
      vendorMap.set(directVendorId || `vendor-${directVendorName}`, directVendorName);
    }

    (item?.umrahDetails?.components || []).forEach((component) => {
      const componentVendor = getItemVendor(component);
      const componentVendorName = getVendorName(componentVendor);
      const componentVendorId =
        typeof componentVendor === 'object'
          ? String(componentVendor?._id || componentVendor?.id || '')
          : String(componentVendor || '');

      if (componentVendorName) {
        vendorMap.set(componentVendorId || `vendor-${componentVendorName}`, componentVendorName);
      }
    });
  });

  return [...vendorMap.values()];
};

const VendorDisplay = ({ booking }) => {
  const vendors = getBookingVendors(booking);

  if (vendors.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-bold text-slate-800">{vendors[0]}</span>

      {vendors.length > 1 && (
        <span className="inline-flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 px-1.5 text-[10px] font-extrabold text-white shadow-sm">
          +{vendors.length - 1}
        </span>
      )}
    </div>
  );
};

const getPaymentState = (booking) => {
  const grossSale = Number(booking.sellingTotal || 0);
  const discount = Number(booking.discountAmount || 0);

  const netSale = Number(booking.netSale ?? Math.max(grossSale - discount, 0));

  const receivedAmount = Number(booking.receivedAmount || 0);

  const customerDue = Number(booking.customerDue ?? Math.max(netSale - receivedAmount, 0));

  const customerCredit = Number(booking.customerCredit || 0);

  if (customerCredit > 0 || customerDue < 0) {
    return 'credit';
  }

  if (netSale > 0 && customerDue <= 0) {
    return 'paid';
  }

  if (receivedAmount > 0 && customerDue > 0) {
    return 'partial';
  }

  return 'due';
};

const PaymentBadge = ({ booking }) => {
  const state = getPaymentState(booking);

  const config = {
    paid: {
      label: t('travel.booking.filters.paid'),
      icon: FaCheckCircle,
      className: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700',
    },

    partial: {
      label: t('travel.booking.filters.partial'),
      icon: FaWallet,
      className: 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700',
    },

    due: {
      label: t('travel.booking.filters.due'),
      icon: FaWallet,
      className: 'border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 text-rose-700',
    },

    credit: {
      label: t('travel.booking.filters.credit'),
      icon: FaWallet,
      className: 'border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700',
    },
  };

  const selected = config[state] || config.due;
  const Icon = selected.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${selected.className}`}
    >
      <Icon aria-hidden="true" className="text-[10px]" />
      {selected.label}
    </span>
  );
};

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

    amber: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',

    red: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',

    slate: 'from-slate-500 to-slate-700 hover:from-slate-600 hover:to-slate-800',

    emerald: 'from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700',
  };

  const sizeClass = compact ? 'h-[30px] w-[30px]' : 'h-8 w-8 sm:h-9 sm:w-9';
  const iconClass = compact ? 'text-[11px]' : 'text-xs sm:text-sm';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex ${sizeClass} flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon
        aria-hidden="true"
        className={disabled && Icon === FaSyncAlt ? `animate-spin ${iconClass}` : iconClass}
      />
    </button>
  );
};

const TravelBookingsPage = () => {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState('');
  const [sharingId, setSharingId] = useState('');

  const canView = hasPermission('travel.bookings.view');
  const canCreate = hasPermission('travel.bookings.create');
  const canEdit = hasPermission('travel.bookings.edit');
  const canDelete = canEdit;

  const {
    state: pageMemory,
    updateField,
    updateFields,
  } = usePageMemory('travel_bookings_page_state', PAGE_DEFAULTS, {
    expiryHours: 24,
    delay: 350,
  });

  const currentPage = Math.max(Number(pageMemory.page || 1), 1);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const bookingsRequestRef = useRef(0);
  const [searchInput, setSearchInput] = useState(pageMemory.search || '');

  useEffect(() => {
    setSearchInput(pageMemory.search || '');
  }, [pageMemory.search]);

  useEffect(() => {
    const nextFields = {};

    URL_FILTER_FIELDS.forEach((field) => {
      const paramValue = searchParams.get(field);

      const value =
        field === 'serviceType'
          ? normalizeServiceTypeFilter(paramValue || PAGE_DEFAULTS[field])
          : (paramValue ?? PAGE_DEFAULTS[field]);

      if ((pageMemory[field] || '') !== (value || '')) {
        nextFields[field] = value;
      }
    });

    if (Object.keys(nextFields).length > 0) {
      updateFields(nextFields);
    }
  }, [pageMemory, searchParams, updateFields]);

  const loadBookings = useCallback(
    async (options = {}) => {
      if (!canView) {
        return;
      }

      const requestId = bookingsRequestRef.current + 1;
      bookingsRequestRef.current = requestId;

      try {
        setLoading(true);
        setPageError('');

        const response = await fetchTravelBookings(
          {
            search: pageMemory.search,
            serviceType: pageMemory.serviceType,
            fromDate: pageMemory.fromDate,
            toDate: pageMemory.toDate,
            balance: pageMemory.balance,
            datePreset: pageMemory.datePreset,
            page: currentPage,
            limit: PAGE_SIZE,
          },
          options
        );

        if (requestId !== bookingsRequestRef.current) {
          return;
        }

        setBookings(Array.isArray(response?.data) ? response.data : []);

        setTotal(Number(response?.total || 0));
      } catch (error) {
        if (requestId !== bookingsRequestRef.current) {
          return;
        }

        console.error('Travel bookings load failed:', error);

        setPageError(t('travel.booking.alerts.loadFailed'));
      } finally {
        if (requestId === bookingsRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [
      canView,
      currentPage,
      pageMemory.balance,
      pageMemory.datePreset,
      pageMemory.fromDate,
      pageMemory.search,
      pageMemory.serviceType,
      pageMemory.toDate,
    ]
  );

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const serviceOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.booking.filters.allServiceTypes',
      },
      ...bookingServiceTypeOptions,
    ],
    []
  );

  const balanceOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.booking.filters.allPaymentStates',
      },
      {
        value: 'paid',
        labelKey: 'travel.booking.filters.paid',
      },
      {
        value: 'partial',
        labelKey: 'travel.booking.filters.partial',
      },
      {
        value: 'due',
        labelKey: 'travel.booking.filters.due',
      },
    ],
    []
  );

  const syncUrlFilters = useCallback(
    (nextState) => {
      const nextParams = new URLSearchParams();

      URL_FILTER_FIELDS.forEach((field) => {
        const value = nextState[field];

        if (value) {
          nextParams.set(field, value);
        }
      });

      setSearchParams(nextParams, {
        replace: true,
      });
    },
    [setSearchParams]
  );

  const updateFilter = useCallback(
    (field, value) => {
      const nextValue = field === 'serviceType' ? normalizeServiceTypeFilter(value) : value;

      const nextState = {
        ...pageMemory,
        [field]: nextValue,
        page: field === 'page' ? nextValue : '1',
      };

      if (field === 'page') {
        updateField(field, nextValue);
      } else {
        updateFields({
          [field]: nextValue,
          page: '1',
        });
      }

      syncUrlFilters(nextState);
    },
    [pageMemory, syncUrlFilters, updateField, updateFields]
  );

  const clearFilters = useCallback(() => {
    setSearchInput('');
    updateFields(PAGE_DEFAULTS);

    setSearchParams(
      {},
      {
        replace: true,
      }
    );
  }, [setSearchParams, updateFields]);

  useEffect(() => {
    if (searchInput === (pageMemory.search || '')) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      updateFilter('search', searchInput);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [pageMemory.search, searchInput, updateFilter]);

  const handleDeleteBooking = useCallback(
    async (booking, event = null) => {
      event?.stopPropagation?.();

      if (!canDelete) {
        alert(t('travel.alerts.permissionDenied'));

        return;
      }

      const label = booking.invoiceNumber || booking.bookingNumber || t('travel.common.thisRecord');

      const confirmKey = booking.accountingPosted
        ? 'travel.booking.actions.voidConfirm'
        : 'travel.booking.actions.deleteConfirm';

      if (!window.confirm(buildTravelConfirmMessage(confirmKey, label))) {
        return;
      }

      try {
        setDeletingId(booking._id);

        await deleteTravelBooking(booking._id, {
          reason: booking.accountingPosted
            ? 'Travel invoice voided by user'
            : 'Travel booking archived by user',
        });

        setBookings((current) =>
          current.filter((item) => String(item._id) !== String(booking._id))
        );

        setTotal((current) => Math.max(Number(current || 0) - 1, 0));
      } catch (error) {
        console.error('Travel booking delete failed:', error);

        alert(error?.response?.data?.message || t('travel.booking.alerts.deleteFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [canDelete]
  );

  const handleShareBookingPdf = useCallback(async (booking, event = null) => {
    event?.stopPropagation?.();

    const bookingId = booking?._id;

    if (!bookingId) {
      return;
    }

    try {
      setSharingId(bookingId);

      const invoiceNumber = booking.invoiceNumber || booking.bookingNumber || bookingId;
      const fileName = `TravelInvoice-${invoiceNumber}.pdf`;

      await sharePdfDocument({
        pdfUrl: getTravelBookingPdfUrl(bookingId),
        token: localStorage.getItem('token'),
        fileName,
        title: fileName,
        text: fileName,
      });
    } catch (error) {
      console.error('Travel booking PDF share failed:', error);

      alert(t('pdf.shareFailed'));
    } finally {
      setSharingId('');
    }
  }, []);

  const columns = useMemo(
    () => [
      {
        key: 'bookingNumber',

        labelKey: 'travel.booking.fields.bookingNumber',

        className: 'w-[13%]',

        render: (booking) => (
          <button
            type="button"
            className="text-left font-extrabold text-cyan-700 transition hover:text-cyan-900 hover:underline"
            onClick={(event) => {
              event.stopPropagation();

              navigate(`/travel/bookings/${booking._id}`);
            }}
          >
            {booking.invoiceNumber || booking.bookingNumber || '-'}
          </button>
        ),
      },

      {
        key: 'customer',

        labelKey: 'travel.booking.fields.customer',

        className: 'w-[16%]',

        render: (booking) => (
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">
              {getBookingCustomerName(booking)}
            </p>

            <p className="truncate text-xs font-semibold text-slate-500">
              {getBookingCustomerPhone(booking) || '-'}
            </p>
          </div>
        ),
      },

      {
        key: 'vendor',

        labelKey: 'travel.fields.vendorName',

        className: 'w-[15%]',

        render: (booking) => <VendorDisplay booking={booking} />,
      },

      {
        key: 'services',

        labelKey: 'travel.booking.fields.services',

        className: 'w-[14%]',

        render: (booking) => (
          <span className="line-clamp-2 font-semibold text-slate-700">
            {getBookingServices(booking)}
          </span>
        ),
      },

      {
        key: 'total',

        labelKey: 'travel.booking.fields.total',

        className: 'w-[11%]',

        render: (booking) => (
          <span className="font-black text-slate-900">
            {formatBookingMoney(booking.netSale ?? booking.sellingTotal, booking.baseCurrency)}
          </span>
        ),
      },

      {
        key: 'payment',

        labelKey: 'travel.booking.fields.paymentStatus',

        className: 'w-[11%]',

        render: (booking) => <PaymentBadge booking={booking} />,
      },

      {
        key: 'travelDate',

        labelKey: 'travel.booking.fields.travelDate',

        className: 'w-[10%]',

        render: (booking) => formatDate(booking.travelStartDate),
      },

      {
        key: 'actions',

        labelKey: 'travel.fields.actions',

        className: 'w-[15%]',
        cellClassName: '!px-1 !py-2',

        render: (booking) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
            <IconButton
              icon={FaEye}
              variant="blue"
              title={t('travel.common.view')}
              compact
              onClick={(event) => {
                event.stopPropagation();

                navigate(`/travel/bookings/${booking._id}`);
              }}
            />

            <IconButton
              icon={FaShareAlt}
              variant="emerald"
              title={t('pdf.share')}
              disabled={sharingId === booking._id}
              compact
              onClick={(event) => handleShareBookingPdf(booking, event)}
            />

            {canEdit && booking.status !== 'cancelled' && (
              <IconButton
                icon={FaEdit}
                variant="amber"
                title={t('travel.common.edit')}
                compact
                onClick={(event) => {
                  event.stopPropagation();

                  navigate(`/travel/bookings/${booking._id}/edit`);
                }}
              />
            )}

            {canDelete && booking.status !== 'cancelled' && (
              <IconButton
                icon={FaTrash}
                variant="red"
                title={t('travel.common.delete')}
                disabled={deletingId === booking._id}
                compact
                onClick={(event) => handleDeleteBooking(booking, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [
      canDelete,
      canEdit,
      deletingId,
      handleDeleteBooking,
      handleShareBookingPdf,
      navigate,
      sharingId,
    ]
  );

  const renderMobileCard = useCallback(
    (booking) => {
      const vendors = getBookingVendors(booking);

      const vendorText =
        vendors.length === 0
          ? '-'
          : vendors.length === 1
            ? vendors[0]
            : `${vendors[0]} +${vendors.length - 1}`;

      return (
        <article
          className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
            String(pageMemory.selectedId) === String(booking._id)
              ? 'border-cyan-400 ring-1 ring-cyan-100'
              : 'border-slate-200'
          }`}
          onClick={() => updateField('selectedId', booking._id)}
        >
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

          <div className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-cyan-700">
                  {booking.invoiceNumber || booking.bookingNumber || '-'}
                </p>

                <p className="truncate text-xs font-semibold text-slate-600">
                  {getBookingCustomerName(booking)}
                </p>

                {getBookingCustomerPhone(booking) && (
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                    {getBookingCustomerPhone(booking)}
                  </p>
                )}
              </div>

              <PaymentBadge booking={booking} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <TravelCardLine labelKey="travel.fields.vendorName" value={vendorText} />

              <TravelCardLine
                labelKey="travel.booking.fields.services"
                value={getBookingServices(booking)}
              />

              <TravelCardLine
                labelKey="travel.booking.fields.total"
                value={formatBookingMoney(
                  booking.netSale ?? booking.sellingTotal,
                  booking.baseCurrency
                )}
              />

              <TravelCardLine
                labelKey="travel.booking.fields.travelDate"
                value={formatDate(booking.travelStartDate)}
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-[3px] border-t border-slate-100 pt-3">
              <IconButton
                icon={FaEye}
                variant="blue"
                title={t('travel.common.view')}
                compact
                onClick={(event) => {
                  event.stopPropagation();

                  navigate(`/travel/bookings/${booking._id}`);
                }}
              />

              <IconButton
                icon={FaShareAlt}
                variant="emerald"
                title={t('pdf.share')}
                disabled={sharingId === booking._id}
                compact
                onClick={(event) => handleShareBookingPdf(booking, event)}
              />

              {canEdit && booking.status !== 'cancelled' && (
                <IconButton
                  icon={FaEdit}
                  variant="amber"
                  title={t('travel.common.edit')}
                  compact
                  onClick={(event) => {
                    event.stopPropagation();

                    navigate(`/travel/bookings/${booking._id}/edit`);
                  }}
                />
              )}

              {canDelete && booking.status !== 'cancelled' && (
                <IconButton
                  icon={FaTrash}
                  variant="red"
                  title={t('travel.common.delete')}
                  disabled={deletingId === booking._id}
                  compact
                  onClick={(event) => handleDeleteBooking(booking, event)}
                />
              )}
            </div>
          </div>
        </article>
      );
    },
    [
      canDelete,
      canEdit,
      deletingId,
      handleDeleteBooking,
      handleShareBookingPdf,
      navigate,
      pageMemory.selectedId,
      sharingId,
      updateField,
    ]
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.booking.list.title"
      actions={
        canCreate && (
          <button
            type="button"
            onClick={() => navigate('/travel/bookings/new')}
            title={t('travel.booking.actions.new')}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:from-cyan-700 hover:to-blue-700 hover:shadow-md"
          >
            <FaPlus aria-hidden="true" className="text-xs" />

            {t('travel.booking.actions.new')}
          </button>
        )
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(280px,1.7fr)_minmax(160px,auto)_minmax(135px,auto)_minmax(135px,auto)_minmax(155px,auto)_44px_44px]">
          <TravelSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholderKey="travel.booking.filters.search"
          />

          <TravelFilterSelect
            value={pageMemory.serviceType}
            onChange={(value) => updateFilter('serviceType', value)}
            options={serviceOptions}
          />

          <input
            type="date"
            value={pageMemory.fromDate}
            onChange={(event) => updateFilter('fromDate', event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            aria-label={t('travel.booking.filters.fromDate')}
          />

          <input
            type="date"
            value={pageMemory.toDate}
            onChange={(event) => updateFilter('toDate', event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            aria-label={t('travel.booking.filters.toDate')}
          />

          <TravelFilterSelect
            value={pageMemory.balance}
            onChange={(value) => updateFilter('balance', value)}
            options={balanceOptions}
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
            onClick={() =>
              loadBookings({
                forceRefresh: true,
              })
            }
          />
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

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
        records={bookings}
        selectedId={pageMemory.selectedId}
        onRowClick={(booking) => updateField('selectedId', booking._id)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.booking.list.empty"
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

export default TravelBookingsPage;
