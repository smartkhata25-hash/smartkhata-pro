import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaBook,
  FaEdit,
  FaMoneyBillWave,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaUserPlus,
  FaWhatsapp,
} from 'react-icons/fa';

import { getCurrentLanguage, t } from '../../i18n/i18n';
import {
  createTravelCustomer,
  deleteTravelCustomer,
  fetchTravelCustomers,
  updateTravelCustomer,
} from '../../services/travelMasterService';
import { fetchWhatsAppTemplate } from '../../services/whatsAppTemplateService';
import { buildTravelRouteState } from '../../utils/travelContext';
import { hasPermission } from '../../utils/permissionHelper';
import { sendWhatsAppReminder } from '../../utils/whatsapp';
import {
  TravelActionButton,
  TravelFilterSelect,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
  formatTravelMoney,
  getAddAction,
  getQuickAddAction,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

const PAGE_DEFAULTS = Object.freeze({
  search: '',
  balance: '',
  sort: 'name_asc',
});

const emptyCustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  moduleScope: 'travel',
};

const quickCustomerFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.customerName',
    placeholderKey: 'travel.placeholders.customerName',
    required: true,
  },
  {
    name: 'phone',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
];

const customerFields = [
  ...quickCustomerFields,
  {
    name: 'moduleScope',
    labelKey: 'travel.booking.fields.moduleScope',
    type: 'select',
    options: [
      {
        value: 'travel',
        labelKey: 'travel.booking.moduleScope.travel',
      },
      {
        value: 'both',
        labelKey: 'travel.booking.moduleScope.both',
      },
    ],
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
    placeholderKey: 'travel.placeholders.address',
    type: 'textarea',
  },
];

const getFiltersFromParams = (searchParams) => ({
  search: searchParams.get('search') || '',
  balance: searchParams.get('balance') || '',
  sort: searchParams.get('sort') || PAGE_DEFAULTS.sort,
});

const getCustomerBalance = (customer) => {
  const directBalance = Number(customer?.balance);

  if (Number.isFinite(directBalance)) {
    return directBalance;
  }

  return Number(customer?.currentReceivable || 0) - Number(customer?.customerCredit || 0);
};

const upsertCustomer = (records, record) => {
  const index = records.findIndex((item) => String(item?._id) === String(record?._id));

  const normalizedRecord = {
    ...record,
    balance: getCustomerBalance(record),
    currentReceivable: Number(record?.currentReceivable || 0),
    customerCredit: Number(record?.customerCredit || 0),
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

const TravelCustomersPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerValues, setCustomerValues] = useState(emptyCustomerForm);

  const [quickValues, setQuickValues] = useState({
    name: '',
    phone: '',
  });

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [whatsAppTemplate, setWhatsAppTemplate] = useState(null);

  const filters = useMemo(() => getFiltersFromParams(searchParams), [searchParams]);

  const createMode = searchParams.get('new') || '';

  const canView =
    hasPermission('travel.bookings.view') ||
    hasPermission('travel.customers') ||
    hasPermission('travel.payments');

  const canViewLedger = hasPermission('customers.view_ledger');

  const canCreateCustomer = hasPermission('travel.bookings.create');

  const canEditCustomer = canCreateCustomer || hasPermission('travel.customers');

  const canDeleteCustomer = canEditCustomer;

  const canReceivePayment =
    hasPermission('travel.bookings.view') ||
    hasPermission('travel.bookings.edit') ||
    hasPermission('travel.payments');

  const loadCustomers = useCallback(
    async (options = {}) => {
      if (!canView) {
        return;
      }

      try {
        setLoading(true);
        setPageError('');

        const data = await fetchTravelCustomers(
          {
            includeBalance: 'true',
          },
          {
            forceRefresh: true,
            ...options,
          }
        );

        setCustomers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Travel customers load failed:', error);
        setPageError(t('travel.customers.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    fetchWhatsAppTemplate('travel').then(setWhatsAppTemplate).catch(() => {
      setWhatsAppTemplate(null);
    });
  }, []);

  const businessName = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}')?.businessName || '';
    } catch (_) {
      return '';
    }
  }, []);

  const updateFilter = useCallback(
    (field, value) => {
      const nextParams = new URLSearchParams(searchParams);

      if (value && value !== PAGE_DEFAULTS[field]) {
        nextParams.set(field, value);
      } else {
        nextParams.delete(field);
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

  const visibleCustomers = useMemo(() => {
    const cleanSearch = normalizeSearch(filters.search);

    return customers
      .filter((customer) => customer.isActive !== false)
      .filter((customer) => {
        if (!cleanSearch) {
          return true;
        }

        return [customer.name, customer.phone, customer.email, customer.address]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(cleanSearch));
      })
      .filter((customer) => {
        const balance = getCustomerBalance(customer);

        if (filters.balance === 'due') {
          return balance > 0;
        }

        if (filters.balance === 'credit') {
          return balance < 0;
        }

        if (filters.balance === 'settled') {
          return balance === 0;
        }

        return true;
      })
      .sort((left, right) => {
        const leftBalance = Math.abs(getCustomerBalance(left));
        const rightBalance = Math.abs(getCustomerBalance(right));

        if (filters.sort === 'balance_desc') {
          return rightBalance - leftBalance;
        }

        if (filters.sort === 'balance_asc') {
          return leftBalance - rightBalance;
        }

        return String(left.name || '').localeCompare(String(right.name || ''));
      });
  }, [customers, filters.balance, filters.search, filters.sort]);

  const balanceOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.customers.filters.allBalances',
      },
      {
        value: 'due',
        labelKey: 'travel.customers.filters.due',
      },
      {
        value: 'credit',
        labelKey: 'travel.customers.filters.credit',
      },
      {
        value: 'settled',
        labelKey: 'travel.customers.filters.settled',
      },
    ],
    []
  );

  const sortOptions = useMemo(
    () => [
      {
        value: 'name_asc',
        labelKey: 'travel.common.sortName',
      },
      {
        value: 'balance_desc',
        labelKey: 'travel.common.sortBalanceHigh',
      },
      {
        value: 'balance_asc',
        labelKey: 'travel.common.sortBalanceLow',
      },
    ],
    []
  );

  const openLedger = useCallback(
    (customer) => {
      if (!customer?._id || !canViewLedger) {
        return;
      }

      navigate(`/customer-ledger/${customer._id}?moduleScope=travel`, {
        state: buildTravelRouteState('/travel/customers'),
      });
    },
    [canViewLedger, navigate]
  );

  const openReceivePayment = useCallback(
    (customer) => {
      if (!customer?._id || !canReceivePayment) {
        return;
      }

      navigate(`/travel/payments/receive?customerId=${customer._id}`);
    },
    [canReceivePayment, navigate]
  );

  const sendTravelReminder = useCallback(
    (customer, event = null) => {
      event?.stopPropagation?.();

      sendWhatsAppReminder({
        phone: customer?.phone,
        customerName: customer?.name,
        balance: getCustomerBalance(customer).toFixed(2),
        businessName,
        lang: getCurrentLanguage(),
        template: whatsAppTemplate,
      });
    },
    [businessName, whatsAppTemplate]
  );

  const openDetails = useCallback(
    (customer = null, draftName = '') => {
      const isEditing = customer && typeof customer === 'object';

      if ((isEditing && !canEditCustomer) || (!isEditing && !canCreateCustomer)) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      setEditingCustomer(isEditing ? customer : null);
      setCustomerValues({
        ...emptyCustomerForm,
        ...(isEditing
          ? {
              ...customer,
              moduleScope: customer.moduleScope === 'both' ? 'both' : 'travel',
            }
          : {
              name: typeof customer === 'string' ? customer : draftName,
            }),
      });

      setFormError('');
      setDetailsOpen(true);
    },
    [canCreateCustomer, canEditCustomer]
  );

  const openQuickAdd = useCallback(
    (draftName = '') => {
      if (!canCreateCustomer) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      setQuickValues({
        name: draftName,
        phone: '',
      });

      setFormError('');
      setQuickOpen(true);
    },
    [canCreateCustomer]
  );

  useEffect(() => {
    if (!canCreateCustomer || !createMode) {
      return;
    }

    if (createMode === 'quick') {
      setQuickValues({
        name: filters.search,
        phone: '',
      });

      setFormError('');
      setQuickOpen(true);
    } else if (createMode === 'details' || createMode === 'true') {
      setEditingCustomer(null);
      setCustomerValues({
        ...emptyCustomerForm,
        name: filters.search,
      });

      setFormError('');
      setDetailsOpen(true);
    }

    const nextParams = new URLSearchParams(searchParams);

    nextParams.delete('new');

    setSearchParams(nextParams, {
      replace: true,
    });
  }, [canCreateCustomer, createMode, filters.search, searchParams, setSearchParams]);

  const saveCustomer = async (values, customerId = '') => {
    const payload = {
      ...values,
      moduleScope: values.moduleScope || 'travel',
    };

    const saved = customerId
      ? await updateTravelCustomer(customerId, payload)
      : await createTravelCustomer(payload);

    if (saved?.duplicate) {
      throw new Error(t('travel.booking.alerts.customerDuplicate'));
    }

    return saved;
  };

  const handleDetailsSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await saveCustomer(customerValues, editingCustomer?._id || '');

      if (editingCustomer) {
        await loadCustomers({
          forceRefresh: true,
        });
      } else {
        setCustomers((current) => upsertCustomer(current, saved));
      }

      setDetailsOpen(false);
      setEditingCustomer(null);
      setCustomerValues(emptyCustomerForm);
    } catch (error) {
      console.error('Travel customer save failed:', error);

      setFormError(
        error?.response?.data?.message || error.message || t('travel.alerts.saveFailed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await saveCustomer({
        ...quickValues,
        moduleScope: 'travel',
      });

      setCustomers((current) => upsertCustomer(current, saved));

      setQuickOpen(false);

      setQuickValues({
        name: '',
        phone: '',
      });
    } catch (error) {
      console.error('Travel customer quick add failed:', error);

      setFormError(
        error?.response?.data?.message || error.message || t('travel.alerts.quickAddFailed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustomer = useCallback(
    async (customer, event = null) => {
      event?.stopPropagation?.();

      if (!canDeleteCustomer) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      const confirmed = window.confirm(
        buildTravelConfirmMessage('travel.customers.deleteConfirm', customer.name)
      );

      if (!confirmed) {
        return;
      }

      try {
        setDeletingId(customer._id);

        await deleteTravelCustomer(customer._id, {
          reason: 'Travel customer archived by user',
        });

        setCustomers((current) =>
          current.filter((item) => String(item._id) !== String(customer._id))
        );
      } catch (error) {
        console.error('Travel customer delete failed:', error);

        alert(error?.response?.data?.message || t('travel.customers.deleteFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [canDeleteCustomer]
  );

  const columns = useMemo(
    () => [
      {
        key: 'name',
        labelKey: 'travel.fields.customerName',
        className: 'w-[35%]',
        render: (customer) => (
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">{customer.name}</p>

            {customer.email && (
              <p className="truncate text-xs font-semibold text-slate-500">{customer.email}</p>
            )}
          </div>
        ),
      },
      {
        key: 'mobile',
        labelKey: 'travel.fields.mobile',
        className: 'w-[20%]',
        render: (customer) => customer.phone || '-',
      },
      {
        key: 'balance',
        labelKey: 'travel.fields.balance',
        className: 'w-[20%]',
        render: (customer) => {
          const balance = getCustomerBalance(customer);

          return (
            <span
              className={`font-extrabold ${
                balance > 0 ? 'text-amber-700' : balance < 0 ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              {formatTravelMoney(balance)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        labelKey: 'travel.fields.actions',
        className: 'w-[25%]',
        cellClassName: '!px-2 !py-2',
        render: (customer) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-1.5">
            {canViewLedger && (
              <IconActionButton
                icon={FaBook}
                title={t('travel.common.viewLedger')}
                variant="blue"
                onClick={(event) => {
                  event.stopPropagation();
                  openLedger(customer);
                }}
              />
            )}

            {canReceivePayment && (
              <IconActionButton
                icon={FaMoneyBillWave}
                title={t('travel.payments.receiveAction')}
                variant="cyan"
                onClick={(event) => {
                  event.stopPropagation();
                  openReceivePayment(customer);
                }}
              />
            )}

            {customer.phone && (
              <IconActionButton
                icon={FaWhatsapp}
                title={t('whatsappSettings.sendReminder')}
                variant="green"
                onClick={(event) => sendTravelReminder(customer, event)}
              />
            )}

            {canEditCustomer && (
              <IconActionButton
                icon={FaEdit}
                title={t('travel.common.edit')}
                variant="amber"
                onClick={(event) => {
                  event.stopPropagation();
                  openDetails(customer);
                }}
              />
            )}

            {canDeleteCustomer && (
              <IconActionButton
                icon={FaTrash}
                title={t('travel.common.delete')}
                variant="rose"
                disabled={deletingId === customer._id}
                onClick={(event) => handleDeleteCustomer(customer, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [
      canDeleteCustomer,
      canEditCustomer,
      canReceivePayment,
      canViewLedger,
      deletingId,
      handleDeleteCustomer,
      openDetails,
      openLedger,
      openReceivePayment,
      sendTravelReminder,
    ]
  );

  const renderMobileCard = useCallback(
    (customer) => {
      const balance = getCustomerBalance(customer);

      return (
        <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-slate-950">{customer.name}</p>

              <p className="truncate text-xs font-semibold text-slate-500">
                {customer.phone || '-'}
              </p>
            </div>

            <span
              className={`shrink-0 text-sm font-extrabold ${
                balance > 0 ? 'text-amber-700' : balance < 0 ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              {formatTravelMoney(balance)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-1.5">
            {canViewLedger && (
              <IconActionButton
                icon={FaBook}
                title={t('travel.common.viewLedger')}
                variant="blue"
                onClick={() => openLedger(customer)}
              />
            )}

            {canReceivePayment && (
              <IconActionButton
                icon={FaMoneyBillWave}
                title={t('travel.payments.receiveAction')}
                variant="cyan"
                onClick={() => openReceivePayment(customer)}
              />
            )}

            {customer.phone && (
              <IconActionButton
                icon={FaWhatsapp}
                title={t('whatsappSettings.sendReminder')}
                variant="green"
                onClick={() => sendTravelReminder(customer)}
              />
            )}

            {canEditCustomer && (
              <IconActionButton
                icon={FaEdit}
                title={t('travel.common.edit')}
                variant="amber"
                onClick={() => openDetails(customer)}
              />
            )}

            {canDeleteCustomer && (
              <IconActionButton
                icon={FaTrash}
                title={t('travel.common.delete')}
                variant="rose"
                disabled={deletingId === customer._id}
                onClick={(event) => handleDeleteCustomer(customer, event)}
              />
            )}
          </div>
        </article>
      );
    },
    [
      canDeleteCustomer,
      canEditCustomer,
      canReceivePayment,
      canViewLedger,
      deletingId,
      handleDeleteCustomer,
      openDetails,
      openLedger,
      openReceivePayment,
      sendTravelReminder,
    ]
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.customers.title"
      actions={
        canCreateCustomer && (
          <>
            {getQuickAddAction(() => openQuickAdd(filters.search))}

            {getAddAction(() => openDetails(filters.search), 'travel.customers.add')}
          </>
        )
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(220px,1fr)_minmax(150px,auto)_minmax(170px,auto)_auto_auto]">
          <TravelSearchInput
            value={filters.search}
            onChange={(value) => updateFilter('search', value)}
            placeholderKey="travel.customers.search"
          />

          <TravelFilterSelect
            value={filters.balance}
            onChange={(value) => updateFilter('balance', value)}
            options={balanceOptions}
          />

          <TravelFilterSelect
            value={filters.sort}
            onChange={(value) => updateFilter('sort', value)}
            options={sortOptions}
          />

          <TravelActionButton icon={FaTimes} variant="secondary" onClick={clearFilters}>
            {t('travel.common.clearFilters')}
          </TravelActionButton>

          <TravelActionButton
            icon={FaSyncAlt}
            variant="secondary"
            onClick={() =>
              loadCustomers({
                forceRefresh: true,
              })
            }
            disabled={loading}
          >
            {loading ? t('travel.common.loading') : t('travel.common.refresh')}
          </TravelActionButton>
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      <TravelMasterList
        columns={columns}
        records={visibleCustomers}
        onRowClick={openLedger}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.customers.empty"
      />

      <TravelFormModal
        open={detailsOpen}
        titleKey="travel.customers.formTitle"
        modeKey={editingCustomer ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={customerFields}
        values={customerValues}
        onChange={(name, value) =>
          setCustomerValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onClose={() => {
          setDetailsOpen(false);
          setEditingCustomer(null);
        }}
        onSubmit={handleDetailsSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={editingCustomer ? FaEdit : FaUserPlus}
      />

      <TravelFormModal
        open={quickOpen}
        titleKey="travel.customers.quickTitle"
        modeKey="travel.common.quickAdd"
        fields={quickCustomerFields}
        values={quickValues}
        onChange={(name, value) =>
          setQuickValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onClose={() => setQuickOpen(false)}
        onSubmit={handleQuickSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaUserPlus}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelCustomersPage;
