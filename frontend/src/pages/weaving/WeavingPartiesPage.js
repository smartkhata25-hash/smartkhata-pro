import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FaEdit,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaUndo,
  FaWhatsapp,
} from 'react-icons/fa';

import WeavingPartyLedgerPanel from '../../components/weaving/WeavingPartyLedgerPanel';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

import {
  createCounterparty,
  hideCounterparty,
  listCounterparties,
  mergeCounterparties,
  restoreCounterparty,
  updateCounterparty,
} from '../../services/weavingCommercialService';

import { hasPermission } from '../../utils/permissionHelper';
import { sendWhatsAppReminder } from '../../utils/whatsapp';

const types = {
  customer: {
    label: 'Customer',
    role: 'customer',
    serviceTypes: [],
  },
  supplier: {
    label: 'Supplier',
    role: 'supplier',
    serviceTypes: [],
  },
  both: {
    label: 'Party',
    role: 'both',
    serviceTypes: [],
  },
  sizing: {
    label: 'Sizing Party',
    role: 'supplier',
    serviceTypes: ['sizing'],
  },
};

const tabs = [
  ['customer', 'Customers'],
  ['supplier', 'Suppliers'],
  ['both', 'Parties'],
  ['sizing', 'Sizing'],
];

const field =
  'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

const compactField =
  'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100';

const blank = (type) => ({
  ...types[type],
  type,
  name: '',
  phone: '',
  email: '',
  address: '',
  openingBalance: '',
  balanceType: 'receivable',
  openingDate: '',
  notes: '',
  isActive: true,
});

const balanceKind = (value) =>
  Number(value) > 0 ? 'receivable' : Number(value) < 0 ? 'payable' : 'settled';

const money = (value) => `Rs. ${Math.abs(Number(value || 0)).toLocaleString('en-PK')}`;

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export default function WeavingPartiesPage() {
  const [params, setParams] = useSearchParams();

  const requestedTab = types[params.get('tab')] ? params.get('tab') : 'customer';

  const [tab, setTab] = useState(requestedTab);

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [, setSelectedIndex] = useState(-1);
  const [mobileDetail, setMobileDetail] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    status: 'active',
    balance: 'all',
    nameSort: 'az',
    balanceSort: '',
  });

  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [form, setForm] = useState(null);
  const [addMenu, setAddMenu] = useState(false);

  const [duplicateMerge, setDuplicateMerge] = useState(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [errorNotice, setErrorNotice] = useState('');
  useWeavingFeedback(errorNotice, setErrorNotice, { type: 'error' });

  const requestKey = useRef('');
  const openedNewType = useRef('');
  const openedEditId = useRef('');
  const openingInputRef = useRef(null);

  const canCreate = hasPermission('weaving.counterparties.create');
  const canEdit = hasPermission('weaving.counterparties.edit');
  const canHide = hasPermission('weaving.counterparties.hide');
  const canRestore = hasPermission('weaving.counterparties.restore');
  const canMerge = hasPermission('weaving.counterparties.merge');

  useEffect(() => {
    if (requestedTab !== tab) {
      setTab(requestedTab);
      setSelected(null);
      setSelectedIndex(-1);
      setMobileDetail(false);
      requestKey.current = '';
    }
  }, [requestedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const newType = params.get('new') === '1' ? requestedTab : '';

    if (canCreate && newType && openedNewType.current !== newType) {
      openedNewType.current = newType;
      setForm(blank(newType));
    }

    if (!newType) {
      openedNewType.current = '';
    }
  }, [canCreate, params, requestedTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 425);

    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (!errorNotice) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setErrorNotice('');
    }, 3500);

    return () => clearTimeout(timer);
  }, [errorNotice]);

  const query = useMemo(
    () => ({
      ...(tab === 'sizing' ? { serviceType: 'sizing' } : { role: tab }),

      status: filters.status,

      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [tab, filters.status, debouncedSearch]
  );

  const load = async (force = false) => {
    const key = JSON.stringify(query);

    if (!force && requestKey.current === key) {
      return;
    }

    requestKey.current = key;
    setLoading(true);

    try {
      const data = await listCounterparties(query);

      setRows(Array.isArray(data) ? data : []);

      setSelected((current) =>
        current ? data.find((row) => row._id === current._id) || null : null
      );
    } catch (error) {
      requestKey.current = '';

      setErrorNotice(error.response?.data?.message || 'Could not load parties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId || openedEditId.current === editId || !rows.length) return;
    const row = rows.find((item) => String(item._id) === editId);
    if (!row) {
      setErrorNotice('Source record is no longer available.');
      openedEditId.current = editId;
      return;
    }
    if (!canEdit) {
      setErrorNotice('You do not have permission to edit parties');
      openedEditId.current = editId;
      return;
    }
    openedEditId.current = editId;
    setSelected(row);
    setMobileDetail(true);
    setForm({ ...row, type: row.serviceTypes?.includes('sizing') ? 'sizing' : row.role });
    if (params.get('focus') === 'opening') setTimeout(() => openingInputRef.current?.focus(), 0);
  }, [canEdit, params, rows]);

  const shownRows = useMemo(
    () =>
      rows
        .filter((row) => filters.balance === 'all' || balanceKind(row.balance) === filters.balance)
        .sort((a, b) => {
          if (filters.balanceSort) {
            return filters.balanceSort === 'high'
              ? Math.abs(b.balance) - Math.abs(a.balance)
              : Math.abs(a.balance) - Math.abs(b.balance);
          }

          return filters.nameSort === 'za'
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name);
        }),
    [rows, filters.balance, filters.balanceSort, filters.nameSort]
  );

  /*
   * Trading کی طرح:
   * Arrow Down / Arrow Up سے party select ہوگی
   * اور list خود scroll ہوتی جائے گی۔
   */
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!shownRows.length) {
        return;
      }

      const activeTag = document.activeElement?.tagName;

      /*
       * Search، form یا dropdown استعمال کرتے وقت
       * arrow navigation نہ چلائیں۔
       */
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if (form || duplicateMerge) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();

        setSelectedIndex((previous) => {
          const next = previous < 0 ? 0 : Math.min(previous + 1, shownRows.length - 1);

          const row = shownRows[next];

          if (!row) {
            return previous;
          }

          setSelected(row);
          setMobileDetail(true);

          setTimeout(() => {
            const selectedElement = document.getElementById(`weaving-party-${row._id}`);

            selectedElement?.scrollIntoView({
              block: 'nearest',
              inline: 'nearest',
              behavior: 'smooth',
            });
          }, 0);

          return next;
        });
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();

        setSelectedIndex((previous) => {
          const next = previous <= 0 ? 0 : previous - 1;

          const row = shownRows[next];

          if (!row) {
            return previous;
          }

          setSelected(row);
          setMobileDetail(true);

          setTimeout(() => {
            const selectedElement = document.getElementById(`weaving-party-${row._id}`);

            selectedElement?.scrollIntoView({
              block: 'nearest',
              inline: 'nearest',
              behavior: 'smooth',
            });
          }, 0);

          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shownRows, form, duplicateMerge]);

  /*
   * Mouse سے select ہونے پر بھی
   * keyboard index وہیں سے شروع ہوگا۔
   */
  useEffect(() => {
    if (!selected?._id) {
      setSelectedIndex(-1);
      return;
    }

    const index = shownRows.findIndex((row) => row._id === selected._id);

    setSelectedIndex(index);
  }, [selected?._id, shownRows]);

  const resetFilters = () => {
    setFilters({
      search: '',
      status: 'active',
      balance: 'all',
      nameSort: 'az',
      balanceSort: '',
    });

    setSelected(null);
    setSelectedIndex(-1);
    requestKey.current = '';
  };

  const findDuplicateByName = async (currentForm) => {
    const activeParties = await listCounterparties({
      status: 'active',
    });

    const wantedName = normalizeName(currentForm.name);

    return activeParties.find((row) => {
      if (currentForm._id && String(row._id) === String(currentForm._id)) {
        return false;
      }

      return normalizeName(row.name) === wantedName;
    });
  };

  const performNormalSave = async (currentForm) => {
    const saved = currentForm._id
      ? await updateCounterparty(currentForm._id, currentForm)
      : await createCounterparty(currentForm);

    setForm(null);
    const next = new URLSearchParams(params);
    next.delete('edit');
    next.delete('focus');
    setParams(next, { replace: true });

    requestKey.current = '';

    await load(true);

    setSelected(saved);
  };

  const save = async () => {
    if (form?._id ? !canEdit : !canCreate) {
      setErrorNotice('You do not have permission for this action');
      return;
    }

    if (!form?.name?.trim()) {
      setErrorNotice('Name is required');
      return;
    }

    setSaving(true);

    try {
      const duplicate = await findDuplicateByName(form);

      if (duplicate) {
        if (!canMerge) {
          setErrorNotice(`"${duplicate.name}" already exists. Please use a different name.`);
          return;
        }

        setDuplicateMerge({
          target: duplicate,
          pendingForm: {
            ...form,
          },
          mode: form._id ? 'edit' : 'create',
        });

        return;
      }

      await performNormalSave(form);
    } catch (error) {
      setErrorNotice(error.response?.data?.message || 'Could not save party');
    } finally {
      setSaving(false);
    }
  };

  const confirmDuplicateMerge = async () => {
    if (!duplicateMerge?.target || !duplicateMerge?.pendingForm) {
      return;
    }

    if (!canMerge) {
      setErrorNotice('You do not have permission to merge parties');
      return;
    }

    setSaving(true);

    try {
      const { target, pendingForm, mode } = duplicateMerge;

      let source;

      if (mode === 'edit') {
        source = await updateCounterparty(pendingForm._id, pendingForm);
      } else {
        source = await createCounterparty(pendingForm);
      }

      const result = await mergeCounterparties(source._id, target._id);

      setDuplicateMerge(null);
      setForm(null);

      requestKey.current = '';

      await load(true);

      setSelected(result.target);
    } catch (error) {
      setErrorNotice(error.response?.data?.message || 'Could not merge parties');
    } finally {
      setSaving(false);
    }
  };

  const hide = async (row) => {
    if (!canHide) {
      setErrorNotice('You do not have permission to hide parties');
      return;
    }

    if (!await requestWeavingConfirmation({ message: `Delete ${row.name}? Historical ledger entries will remain available.` })) {
      return;
    }

    try {
      await hideCounterparty(row._id, 'deleted');

      if (selected?._id === row._id) {
        setSelected(null);
        setSelectedIndex(-1);
      }

      requestKey.current = '';

      await load(true);
    } catch (error) {
      setErrorNotice(error.response?.data?.message || 'Could not delete party');
    }
  };

  const restore = async (row) => {
    if (!canRestore) {
      setErrorNotice('You do not have permission to restore parties');
      return;
    }

    try {
      await restoreCounterparty(row._id);

      requestKey.current = '';

      await load(true);
    } catch (error) {
      setErrorNotice(error.response?.data?.message || 'Could not restore party');
    }
  };

  const edit = (row, options = {}) => {
    if (!canEdit) {
      setErrorNotice('You do not have permission to edit parties');
      return;
    }

    setForm({
      ...row,

      type: row.serviceTypes?.includes('sizing') ? 'sizing' : row.role,
    });
    if (options.focus === 'opening') setTimeout(() => openingInputRef.current?.focus(), 0);
  };

  const closeForm = () => {
    setForm(null);
    const next = new URLSearchParams(params);
    next.delete('edit');
    next.delete('focus');
    setParams(next, { replace: true });
  };

  const select = (row) => {
    setSelected(row);

    setSelectedIndex(shownRows.findIndex((item) => item._id === row._id));

    setMobileDetail(true);
  };

  const changeTab = (key) => {
    setParams({
      tab: key,
    });

    setTab(key);
    setSelected(null);
    setSelectedIndex(-1);
    setMobileDetail(false);

    setAddMenu(false);

    requestKey.current = '';
  };

  const openNew = (key = tab) => {
    if (!canCreate) {
      setErrorNotice('You do not have permission to create parties');
      return;
    }

    setParams({
      tab: key,
    });

    setTab(key);

    setSelected(null);
    setSelectedIndex(-1);
    setMobileDetail(false);

    setForm(blank(key));

    setAddMenu(false);

    requestKey.current = '';
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/60 px-3 pb-3 pt-0 sm:px-5 sm:pb-5 sm:pt-0">
      <div className="mx-auto max-w-[1700px]">
        <div className="grid gap-3 lg:grid-cols-[390px_minmax(0,1fr)]">
          {/* LEFT SIDE */}
          <section
            className={`${
              mobileDetail ? 'hidden lg:block' : 'block'
            } overflow-visible rounded-b-md border-x border-b bg-white shadow-sm`}
          >
            {/* FILTERS */}
            <div className="border-b p-2">
              {/* SEARCH + CLEAR */}
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

                  <input
                    className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    placeholder="Search name, phone or email"
                    value={filters.search}
                    onChange={(event) =>
                      setFilters({
                        ...filters,
                        search: event.target.value,
                      })
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={resetFilters}
                  title="Clear Filters"
                  aria-label="Clear Filters"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700"
                >
                  <FaTimes />
                </button>
              </div>

              {/* SMALL FILTERS */}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <select
                  aria-label="Status"
                  className={compactField}
                  value={filters.status}
                  onChange={(event) => {
                    setFilters({
                      ...filters,
                      status: event.target.value,
                    });

                    setSelected(null);

                    setSelectedIndex(-1);

                    requestKey.current = '';
                  }}
                >
                  <option value="active">Active</option>

                  <option value="hidden">Hidden</option>
                </select>

                <select
                  aria-label="Balance"
                  className={compactField}
                  value={filters.balance}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      balance: event.target.value,
                    })
                  }
                >
                  <option value="all">All Balances</option>

                  <option value="receivable">Receivable</option>

                  <option value="payable">Payable</option>

                  <option value="settled">Settled</option>
                </select>

                <select
                  aria-label="Name sort"
                  className={compactField}
                  value={filters.nameSort}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      nameSort: event.target.value,
                      balanceSort: '',
                    })
                  }
                >
                  <option value="az">Name A-Z</option>

                  <option value="za">Name Z-A</option>
                </select>

                <select
                  aria-label="Balance sort"
                  className={compactField}
                  value={filters.balanceSort}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      balanceSort: event.target.value,
                    })
                  }
                >
                  <option value="">Balance Sort</option>

                  <option value="high">High-Low</option>

                  <option value="low">Low-High</option>
                </select>
              </div>
            </div>

            {/* LIST */}
            <div className="max-h-[76vh] overflow-y-auto">
              {loading ? (
                <FaSpinner className="mx-auto my-12 animate-spin text-2xl text-teal-700" />
              ) : shownRows.length ? (
                shownRows.map((row) => (
                  <div
                    id={`weaving-party-${row._id}`}
                    key={row._id}
                    className={`group flex items-center border-b px-3 py-2.5 hover:bg-teal-50 ${
                      selected?._id === row._id ? 'bg-teal-50 ring-1 ring-inset ring-teal-200' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => select(row)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-semibold text-slate-900">{row.name}</div>

                      <div
                        className={`mt-1 text-xs font-medium ${
                          balanceKind(row.balance) === 'receivable'
                            ? 'text-blue-700'
                            : balanceKind(row.balance) === 'payable'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {balanceKind(row.balance)[0].toUpperCase() +
                          balanceKind(row.balance).slice(1)}
                        : {money(row.balance)}
                        {row.isHidden
                          ? ` | ${
                              row.hiddenReason === 'merged'
                                ? 'Merged'
                                : row.hiddenReason === 'deleted'
                                  ? 'Deleted'
                                  : 'Hidden'
                            }`
                          : ''}
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center">
                      {row.isHidden ? (
                        row.hiddenReason === 'deleted' &&
                        canRestore && (
                          <button
                            type="button"
                            title="Restore"
                            aria-label="Restore"
                            onClick={() => restore(row)}
                            className="flex h-8 w-8 items-center justify-center text-emerald-700 hover:bg-emerald-50"
                          >
                            <FaUndo />
                          </button>
                        )
                      ) : (
                        <>
                          {canEdit && (
                            <button
                              type="button"
                              title="Edit"
                              aria-label="Edit"
                              onClick={() => edit(row)}
                              className="flex h-8 w-8 items-center justify-center rounded text-blue-700 hover:bg-blue-50"
                            >
                              <FaEdit />
                            </button>
                          )}

                          <button
                            type="button"
                            title="WhatsApp"
                            aria-label="WhatsApp"
                            disabled={!row.phone}
                            onClick={() =>
                              sendWhatsAppReminder({
                                phone: row.phone,
                                customerName: row.name,
                                balance: Math.abs(row.balance).toLocaleString(),
                                businessName: 'Smart Khata',
                                lang: 'en',
                              })
                            }
                            className="flex h-8 w-8 items-center justify-center rounded text-emerald-700 hover:bg-emerald-50 disabled:opacity-25"
                          >
                            <FaWhatsapp />
                          </button>

                          {canHide && (
                            <button
                              type="button"
                              title="Delete"
                              aria-label="Delete"
                              onClick={() => hide(row)}
                              className="flex h-8 w-8 items-center justify-center rounded text-rose-600 hover:bg-rose-50"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-14 text-center text-sm text-slate-400">
                  No parties match these filters
                </div>
              )}
            </div>
          </section>

          {/* RIGHT SIDE */}
          <div className={`min-w-0 ${mobileDetail ? 'block' : 'hidden lg:block'}`}>
            {/* TABS + ADD NEW */}
            <div className="mb-2 flex h-11 min-w-0 items-center gap-2 overflow-visible rounded-md border bg-white px-2 shadow-sm">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
                {tabs.map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => changeTab(key)}
                    className={`h-8 shrink-0 rounded px-3 text-sm font-semibold transition ${
                      tab === key
                        ? 'bg-teal-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {canCreate && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setAddMenu((value) => !value)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    <FaPlus className="text-xs" />
                    Add New
                  </button>

                  {addMenu && (
                    <div className="absolute right-0 z-50 mt-1 w-44 rounded-md border bg-white py-1 shadow-xl">
                      {Object.entries(types).map(([key, value]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => openNew(key)}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-teal-50"
                        >
                          {value.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <WeavingPartyLedgerPanel
              party={selected}
              onBack={() => setMobileDetail(false)}
              onEdit={selected && !selected.isHidden && canEdit ? (options) => edit(selected, options) : null}
            />
          </div>
        </div>
      </div>

      {/* ADD / EDIT FORM */}
      {form && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4">
          <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-md bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-md">
            <h2 className="mb-4 text-lg font-bold">
              {form._id ? 'Edit' : 'Add'} {types[form.type]?.label || 'Party'}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Party Type
                <select
                  className={field}
                  value={form.type}
                  onChange={(event) => {
                    const type = event.target.value;

                    setForm({
                      ...form,
                      type,
                      role: types[type].role,
                      serviceTypes: types[type].serviceTypes,
                    });
                  }}
                >
                  <option value="customer">Customer</option>

                  <option value="supplier">Supplier</option>

                  <option value="both">Party</option>

                  <option value="sizing">Sizing Party</option>
                </select>
              </label>

              {[
                ['name', 'Name *'],
                ['phone', 'Phone'],
                ['email', 'Email'],
                ['address', 'Address'],
              ].map(([key, label]) => (
                <label key={key} className="text-sm font-medium">
                  {label}

                  <input
                    className={field}
                    value={form[key] || ''}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        [key]: event.target.value,
                      })
                    }
                  />
                </label>
              ))}

              <label className="text-sm font-medium">
                Opening Balance
                <input
                  ref={openingInputRef}
                  type="number"
                  min="0"
                  className={field}
                  value={form.openingBalance || ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      openingBalance: event.target.value,
                    })
                  }
                />
              </label>

              <label className="text-sm font-medium">
                Opening Date
                <input
                  type="date"
                  className={field}
                  value={form.openingDate || ''}
                  onChange={(event) => setForm({ ...form, openingDate: event.target.value })}
                />
              </label>

              <label className="text-sm font-medium">
                Balance Type
                <select
                  className={field}
                  value={form.balanceType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      balanceType: event.target.value,
                    })
                  }
                >
                  <option value="receivable">Receivable</option>

                  <option value="payable">Payable</option>
                </select>
              </label>

              <label className="text-sm font-medium sm:col-span-2">
                Notes
                <textarea
                  className={`${field} h-20 py-2`}
                  value={form.notes || ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      notes: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-md border px-4"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="h-10 rounded-md bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save & Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE / MERGE */}
      {duplicateMerge && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Same Name Already Exists</h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              <strong>{duplicateMerge.target.name}</strong> پہلے سے موجود ہے۔
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              اگر یہ وہی Customer / Supplier / Party ہے تو آپ دونوں records کو Merge کر سکتے ہیں۔
            </p>

            <p className="mt-2 text-xs text-slate-500">
              اگر یہ الگ record ہے تو Cancel کریں اور نام میں مناسب تبدیلی کر دیں۔
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDuplicateMerge(null)}
                className="h-10 rounded-md border px-4 text-sm font-medium"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={confirmDuplicateMerge}
                className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Merging...' : 'Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
