import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaBookOpen,
  FaBolt,
  FaEdit,
  FaMoneyBillWave,
  FaPlus,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaWhatsapp,
} from 'react-icons/fa';

import {
  createTravelVendor,
  deleteTravelVendor,
  fetchTravelServiceCategories,
  fetchTravelVendors,
  updateTravelVendor,
} from '../../services/travelMasterService';
import { fetchWhatsAppTemplate } from '../../services/whatsAppTemplateService';
import { getCachedTravelRecords, TRAVEL_CACHE_DOMAINS } from '../../utils/travelMasterCache';
import { hasPermission } from '../../utils/permissionHelper';
import { buildTravelRouteState } from '../../utils/travelContext';
import { getCurrentLanguage, t } from '../../i18n/i18n';
import { sendWhatsAppReminder } from '../../utils/whatsapp';
import usePageMemory from '../../hooks/usePageMemory';
import {
  TravelCardLine,
  TravelFilterSelect,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  buildTravelConfirmMessage,
  formatTravelMoney,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';
import {
  createEmptyQuickVendorForm,
  emptyVendorForm,
  normalizeCategoryIds,
  quickVendorFields,
  vendorFields,
} from '../../components/travel/vendors/travelVendorConfig';

const PAGE_MEMORY_DEFAULTS = {
  search: '',
  balance: '',
  sort: 'name_asc',
  selectedId: '',
};

const URL_FILTER_FIELDS = ['search', 'balance', 'sort'];

const upsertRecord = (records, record) => {
  const index = records.findIndex((item) => String(item?._id) === String(record?._id));

  if (index === -1) {
    return [record, ...records];
  }

  const nextRecords = [...records];

  nextRecords[index] = {
    ...nextRecords[index],
    ...record,
  };

  return nextRecords;
};

const getVendorBalance = (vendor) => {
  const payable = Number(vendor?.currentPayable || 0);
  const credit = Number(vendor?.vendorCredit || 0);

  return payable - credit;
};

const getVendorOpeningDirection = (openingBalance = 0) =>
  Number(openingBalance || 0) < 0 ? 'advance' : 'payable';

const getOpeningBalanceAmount = (openingBalance = 0) => {
  const amount = Math.abs(Number(openingBalance || 0));
  return amount || '';
};

const withVendorOpeningFormValues = (vendor = {}) => ({
  ...vendor,
  openingBalanceAmount: getOpeningBalanceAmount(vendor.openingBalance),
  openingBalanceDirection: getVendorOpeningDirection(vendor.openingBalance),
});

const buildVendorOpeningPayload = (values = {}) => {
  const amount = Math.abs(Number(values.openingBalanceAmount || 0));
  const direction = values.openingBalanceDirection || 'payable';

  return {
    ...values,
    openingBalance: direction === 'advance' ? -amount : amount,
    openingBalanceAmount: amount,
    openingBalanceDirection: direction,
  };
};

const getBalanceTextClass = (balance) => {
  if (balance > 0) {
    return 'text-rose-700';
  }

  if (balance < 0) {
    return 'text-emerald-700';
  }

  return 'text-slate-700';
};

const IconActionButton = ({ icon: Icon, title, onClick, disabled = false, variant = 'blue' }) => {
  const variants = {
    blue: 'from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700',
    cyan: 'from-cyan-500 to-sky-600 text-white hover:from-cyan-600 hover:to-sky-700',
    green: 'from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700',
    amber: 'from-amber-400 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600',
    rose: 'from-rose-500 to-red-600 text-white hover:from-rose-600 hover:to-red-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon aria-hidden="true" className="text-xs sm:text-sm" />
    </button>
  );
};

const HeaderActionButton = ({ icon: Icon, title, onClick, variant = 'cyan' }) => {
  const variants = {
    cyan: 'from-cyan-500 to-sky-600 hover:from-cyan-600 hover:to-sky-700',
    blue: 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 sm:h-10 sm:w-10 ${
        variants[variant] || variants.cyan
      }`}
    >
      <Icon aria-hidden="true" className="text-sm sm:text-base" />
    </button>
  );
};

const TravelVendorsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [vendors, setVendors] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.VENDORS)
  );

  const [categories, setCategories] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES)
  );

  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const [editingVendor, setEditingVendor] = useState(null);

  const [vendorValues, setVendorValues] = useState(emptyVendorForm);
  const [quickValues, setQuickValues] = useState(createEmptyQuickVendorForm());

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [whatsAppTemplate, setWhatsAppTemplate] = useState(null);

  const createMode = searchParams.get('new') || '';

  const canView = hasPermission('travel.vendors.view');
  const canManage = hasPermission('travel.vendors.manage');
  const canViewLedger = hasPermission('suppliers.view_ledger');

  const canPayVendor =
    hasPermission('travel.vendors.view') ||
    hasPermission('travel.vendors.manage') ||
    hasPermission('travel.payments');

  const {
    state: pageMemory,
    updateField,
    updateFields,
  } = usePageMemory('travel_vendors_page_state', PAGE_MEMORY_DEFAULTS, {
    expiryHours: 24,
    delay: 350,
  });

  useEffect(() => {
    const nextFields = {};

    URL_FILTER_FIELDS.forEach((field) => {
      const value = searchParams.get(field) ?? PAGE_MEMORY_DEFAULTS[field];

      if ((pageMemory[field] || '') !== (value || '')) {
        nextFields[field] = value;
      }
    });

    if (Object.keys(nextFields).length > 0) {
      updateFields(nextFields);
    }
  }, [pageMemory, searchParams, updateFields]);

  const syncUrlFilters = useCallback(
    (nextState) => {
      const nextParams = new URLSearchParams();

      URL_FILTER_FIELDS.forEach((field) => {
        const value = nextState[field];

        if (value && value !== PAGE_MEMORY_DEFAULTS[field]) {
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
      const nextState = {
        ...pageMemory,
        [field]: value,
      };

      updateField(field, value);
      syncUrlFilters(nextState);
    },
    [pageMemory, syncUrlFilters, updateField]
  );

  const clearFilters = useCallback(() => {
    updateFields(PAGE_MEMORY_DEFAULTS);

    setSearchParams(
      {},
      {
        replace: true,
      }
    );
  }, [setSearchParams, updateFields]);

  const setSearch = useCallback((value) => updateFilter('search', value), [updateFilter]);

  const setBalance = useCallback((value) => updateFilter('balance', value), [updateFilter]);

  const setSort = useCallback((value) => updateFilter('sort', value), [updateFilter]);

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

        const [vendorData, categoryData] = await Promise.all([
          fetchTravelVendors(
            {
              includeBalance: 'true',
            },
            options
          ),
          fetchTravelServiceCategories({}, options),
        ]);

        setVendors(Array.isArray(vendorData) ? vendorData : []);

        setCategories(Array.isArray(categoryData) ? categoryData : []);
      } catch (error) {
        console.error('Travel vendors load failed:', error);
        setPageError(t('travel.alerts.vendorsLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const visibleVendors = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return vendors
      .filter((vendor) => vendor.isDeleted !== true)
      .filter((vendor) => {
        if (!search) {
          return true;
        }

        return [vendor.name, vendor.phone, vendor.email, vendor.contactPerson]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .filter((vendor) => {
        const balance = getVendorBalance(vendor);

        if (pageMemory.balance === 'payable') {
          return balance > 0;
        }

        if (pageMemory.balance === 'credit') {
          return balance < 0;
        }

        if (pageMemory.balance === 'settled') {
          return balance === 0;
        }

        return true;
      })
      .sort((left, right) => {
        const leftBalance = getVendorBalance(left);
        const rightBalance = getVendorBalance(right);

        if (pageMemory.sort === 'balance_desc') {
          return rightBalance - leftBalance;
        }

        if (pageMemory.sort === 'balance_asc') {
          return leftBalance - rightBalance;
        }

        return String(left.name || '').localeCompare(String(right.name || ''));
      });
  }, [pageMemory.balance, pageMemory.search, pageMemory.sort, vendors]);

  const openDetails = useCallback(
    (vendor = null, draftName = '') => {
      if (!canManage) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      setEditingVendor(vendor);

      setVendorValues(
        vendor
          ? {
              ...emptyVendorForm,
              ...withVendorOpeningFormValues(vendor),
              travelVendorType: vendor.travelVendorType || 'other',
              travelServiceCategories: normalizeCategoryIds(vendor.travelServiceCategories),
            }
          : {
              ...emptyVendorForm,
              name: draftName,
            }
      );

      setFormError('');
      setDetailsOpen(true);
    },
    [canManage]
  );

  const openQuickAdd = useCallback(
    (draftName = '') => {
      if (!canManage) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      setQuickValues(createEmptyQuickVendorForm(draftName));

      setFormError('');
      setQuickOpen(true);
    },
    [canManage]
  );

  useEffect(() => {
    if (!canManage || !createMode) {
      return;
    }

    if (createMode === 'quick') {
      setQuickValues(createEmptyQuickVendorForm(pageMemory.search));

      setFormError('');
      setQuickOpen(true);
    } else if (createMode === 'details' || createMode === 'true') {
      setEditingVendor(null);

      setVendorValues({
        ...emptyVendorForm,
        name: pageMemory.search,
      });

      setFormError('');
      setDetailsOpen(true);
    }

    const nextParams = new URLSearchParams(searchParams);

    nextParams.delete('new');

    setSearchParams(nextParams, {
      replace: true,
    });
  }, [canManage, createMode, pageMemory.search, searchParams, setSearchParams]);

  const handleDetailsSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const payload = buildVendorOpeningPayload(vendorValues);
      const saved = editingVendor
        ? await updateTravelVendor(editingVendor._id, payload)
        : await createTravelVendor(payload);

      setVendors((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
      setDetailsOpen(false);
      setEditingVendor(null);
    } catch (error) {
      console.error('Travel vendor save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await createTravelVendor(quickValues);

      setVendors((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
      setQuickOpen(false);

      setQuickValues(createEmptyQuickVendorForm());
    } catch (error) {
      console.error('Travel vendor quick add failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.quickAddFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVendor = useCallback(
    async (vendor, event = null) => {
      event?.stopPropagation?.();

      if (!canManage) {
        alert(t('travel.alerts.permissionDenied'));
        return;
      }

      if (!window.confirm(buildTravelConfirmMessage('travel.vendors.deleteConfirm', vendor.name))) {
        return;
      }

      try {
        setDeletingId(vendor._id);

        await deleteTravelVendor(vendor._id, {
          reason: 'Travel vendor archived by user',
        });

        setVendors((current) => current.filter((item) => String(item._id) !== String(vendor._id)));

        if (String(pageMemory.selectedId) === String(vendor._id)) {
          setSelectedId('');
        }
      } catch (error) {
        console.error('Travel vendor delete failed:', error);

        alert(error?.response?.data?.message || t('travel.vendors.deleteFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [canManage, pageMemory.selectedId, setSelectedId]
  );

  const toggleCategory = (categoryId) => {
    setVendorValues((current) => {
      const currentIds = normalizeCategoryIds(current.travelServiceCategories);

      const exists = currentIds.includes(categoryId);

      return {
        ...current,
        travelServiceCategories: exists
          ? currentIds.filter((id) => id !== categoryId)
          : [...currentIds, categoryId],
      };
    });
  };

  const openLedger = useCallback(
    (vendor) => {
      if (!vendor?._id || !canViewLedger) {
        return;
      }

      navigate(`/supplier-ledger/${vendor._id}?moduleScope=travel`, {
        state: buildTravelRouteState('/travel/vendors'),
      });
    },
    [canViewLedger, navigate]
  );

  const openVendorPayment = useCallback(
    (vendor) => {
      if (!vendor?._id || !canPayVendor) {
        return;
      }

      navigate(`/travel/vendor-payments/new?vendorId=${vendor._id}`);
    },
    [canPayVendor, navigate]
  );

  const sendTravelReminder = useCallback(
    (vendor, event = null) => {
      event?.stopPropagation?.();

      sendWhatsAppReminder({
        phone: vendor?.phone,
        customerName: vendor?.name,
        balance: getVendorBalance(vendor).toFixed(2),
        businessName,
        lang: getCurrentLanguage(),
        template: whatsAppTemplate,
      });
    },
    [businessName, whatsAppTemplate]
  );

  const balanceOptions = useMemo(
    () => [
      {
        value: '',
        labelKey: 'travel.vendors.filters.allBalances',
      },
      {
        value: 'payable',
        labelKey: 'travel.vendors.filters.payable',
      },
      {
        value: 'credit',
        labelKey: 'travel.vendors.filters.credit',
      },
      {
        value: 'settled',
        labelKey: 'travel.vendors.filters.settled',
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

  const columns = useMemo(
    () => [
      {
        key: 'name',
        labelKey: 'travel.fields.vendor',
        className: 'w-[27%]',
        render: (vendor) => (
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">{vendor.name}</p>

            {vendor.email && (
              <p className="truncate text-xs font-semibold text-slate-500">{vendor.email}</p>
            )}
          </div>
        ),
      },
      {
        key: 'mobile',
        labelKey: 'travel.fields.mobile',
        className: 'w-[15%]',
        render: (vendor) => (
          <span className="font-semibold text-slate-700">{vendor.phone || '-'}</span>
        ),
      },
      {
        key: 'openingBalance',
        labelKey: 'travel.openingBalance.short',
        className: 'w-[16%]',
        render: (vendor) => (
          <span className="font-bold text-slate-700">
            {formatTravelMoney(vendor.openingBalance || 0)}
          </span>
        ),
      },
      {
        key: 'balance',
        labelKey: 'travel.fields.balance',
        className: 'w-[18%]',
        render: (vendor) => {
          const balance = getVendorBalance(vendor);

          return (
            <span className={`font-extrabold ${getBalanceTextClass(balance)}`}>
              {formatTravelMoney(balance)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        labelKey: 'travel.fields.actions',
        className: 'w-[24%]',
        cellClassName: '!px-2 !py-2',
        render: (vendor) => (
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-1.5">
            {canViewLedger && (
              <IconActionButton
                icon={FaBookOpen}
                title={t('travel.common.viewLedger')}
                variant="blue"
                onClick={(event) => {
                  event.stopPropagation();
                  openLedger(vendor);
                }}
              />
            )}

            {canPayVendor && (
              <IconActionButton
                icon={FaMoneyBillWave}
                title={t('travel.payments.vendorActionShort')}
                variant="cyan"
                onClick={(event) => {
                  event.stopPropagation();
                  openVendorPayment(vendor);
                }}
              />
            )}

            {vendor.phone && (
              <IconActionButton
                icon={FaWhatsapp}
                title={t('whatsappSettings.sendReminder')}
                variant="green"
                onClick={(event) => {
                  event.stopPropagation();

                  sendWhatsAppReminder({
                    phone: vendor?.phone,
                    customerName: vendor?.name,
                    balance: getVendorBalance(vendor).toFixed(2),
                    businessName,
                    lang: getCurrentLanguage(),
                    template: whatsAppTemplate,
                  });
                }}
              />
            )}

            {canManage && (
              <IconActionButton
                icon={FaEdit}
                title={t('travel.common.edit')}
                variant="amber"
                onClick={(event) => {
                  event.stopPropagation();
                  openDetails(vendor);
                }}
              />
            )}

            {canManage && (
              <IconActionButton
                icon={FaTrash}
                title={
                  deletingId === vendor._id
                    ? t('travel.common.deleting')
                    : t('travel.common.delete')
                }
                variant="rose"
                disabled={deletingId === vendor._id}
                onClick={(event) => handleDeleteVendor(vendor, event)}
              />
            )}
          </div>
        ),
      },
    ],
    [
      canManage,
      canPayVendor,
      canViewLedger,
      businessName,
      deletingId,
      handleDeleteVendor,
      openDetails,
      openLedger,
      openVendorPayment,
      whatsAppTemplate,
    ]
  );

  const renderMobileCard = useCallback(
    (vendor) => {
      const balance = getVendorBalance(vendor);

      return (
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-slate-950">{vendor.name}</p>

              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {vendor.phone || vendor.email || '-'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                {t('travel.fields.balance')}
              </p>

              <p className={`mt-0.5 text-sm font-extrabold ${getBalanceTextClass(balance)}`}>
                {formatTravelMoney(balance)}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <TravelCardLine labelKey="travel.fields.mobile" value={vendor.phone} />
            <TravelCardLine
              labelKey="travel.openingBalance.short"
              value={formatTravelMoney(vendor.openingBalance || 0)}
            />
          </div>

          {(canViewLedger || canPayVendor || canManage || vendor.phone) && (
            <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t border-slate-100 pt-3">
              {canViewLedger && (
                <IconActionButton
                  icon={FaBookOpen}
                  title={t('travel.common.viewLedger')}
                  variant="blue"
                  onClick={() => openLedger(vendor)}
                />
              )}

              {canPayVendor && (
                <IconActionButton
                  icon={FaMoneyBillWave}
                  title={t('travel.payments.vendorActionShort')}
                  variant="cyan"
                  onClick={() => openVendorPayment(vendor)}
                />
              )}

              {vendor.phone && (
                <IconActionButton
                  icon={FaWhatsapp}
                  title={t('whatsappSettings.sendReminder')}
                  variant="green"
                  onClick={() => sendTravelReminder(vendor)}
                />
              )}

              {canManage && (
                <IconActionButton
                  icon={FaEdit}
                  title={t('travel.common.edit')}
                  variant="amber"
                  onClick={() => openDetails(vendor)}
                />
              )}

              {canManage && (
                <IconActionButton
                  icon={FaTrash}
                  title={
                    deletingId === vendor._id
                      ? t('travel.common.deleting')
                      : t('travel.common.delete')
                  }
                  variant="rose"
                  disabled={deletingId === vendor._id}
                  onClick={(event) => handleDeleteVendor(vendor, event)}
                />
              )}
            </div>
          )}
        </article>
      );
    },
    [
      canManage,
      canPayVendor,
      canViewLedger,
      deletingId,
      handleDeleteVendor,
      openDetails,
      openLedger,
      openVendorPayment,
      sendTravelReminder,
    ]
  );

  const selectedCategoryIds = useMemo(
    () => normalizeCategoryIds(vendorValues.travelServiceCategories),
    [vendorValues.travelServiceCategories]
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.vendors.title"
      actions={
        canManage && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <HeaderActionButton
              icon={FaBolt}
              title={t('travel.common.quickAdd')}
              variant="cyan"
              onClick={() => openQuickAdd(pageMemory.search)}
            />

            <HeaderActionButton
              icon={FaPlus}
              title={t('travel.vendors.add')}
              variant="blue"
              onClick={() => openDetails(null, pageMemory.search)}
            />
          </div>
        )
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(220px,1fr)_minmax(150px,auto)_minmax(165px,auto)_auto_auto]">
          <TravelSearchInput
            value={pageMemory.search}
            onChange={setSearch}
            placeholderKey="travel.vendors.search"
          />

          <TravelFilterSelect
            value={pageMemory.balance}
            onChange={setBalance}
            options={balanceOptions}
          />

          <TravelFilterSelect value={pageMemory.sort} onChange={setSort} options={sortOptions} />

          <IconActionButton
            icon={FaTimes}
            title={t('travel.common.clearFilters')}
            variant="amber"
            onClick={clearFilters}
          />

          <IconActionButton
            icon={FaSyncAlt}
            title={loading ? t('travel.common.loading') : t('travel.common.refresh')}
            variant="cyan"
            onClick={() =>
              loadData({
                forceRefresh: true,
              })
            }
            disabled={loading}
          />
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
        records={visibleVendors}
        selectedId={pageMemory.selectedId}
        onRowClick={(vendor) => setSelectedId(vendor._id)}
        renderMobileCard={renderMobileCard}
        emptyKey="travel.vendors.empty"
      />

      <TravelFormModal
        open={detailsOpen}
        titleKey="travel.vendors.formTitle"
        modeKey={editingVendor ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={vendorFields}
        values={vendorValues}
        onChange={(name, value) =>
          setVendorValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onClose={() => {
          setDetailsOpen(false);
          setEditingVendor(null);
        }}
        onSubmit={handleDetailsSubmit}
        submitting={submitting}
        error={formError}
        submitIcon={FaEdit}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-xs font-extrabold text-slate-600">
            {t('travel.fields.travelServiceCategories')}
          </p>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories
              .filter((category) => category.isActive !== false)
              .map((category) => (
                <label
                  key={category._id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(category._id)}
                    onChange={() => toggleCategory(category._id)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                  />

                  <span className="truncate">{category.name}</span>
                </label>
              ))}
          </div>

          {categories.length === 0 && (
            <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500">
              {t('travel.services.emptyCategories')}
            </div>
          )}
        </div>
      </TravelFormModal>

      <TravelFormModal
        open={quickOpen}
        titleKey="travel.vendors.quickTitle"
        modeKey="travel.common.quickAdd"
        fields={quickVendorFields}
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
        submitIcon={FaBolt}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelVendorsPage;
