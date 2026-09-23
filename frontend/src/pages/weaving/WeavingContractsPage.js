import React, { useCallback, useEffect, useState } from 'react';

import { FaEdit, FaFileContract, FaPlus, FaSearch, FaTimes } from 'react-icons/fa';

import { t } from '../../i18n/i18n';

import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import WeightKgLbsInput, { KG_TO_LBS } from '../../components/weaving/WeightKgLbsInput';

import WeavingFormActions from '../../components/weaving/WeavingFormActions';
import { useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

import {
  createWeavingContract,
  getWeavingContractMeta,
  listWeavingContracts,
  updateWeavingContract,
} from '../../services/weavingOperationsService';

import { getBusinessDateInputValue } from '../../utils/localDateTime';

const input = `
  mt-1
  h-9
  w-full
  rounded-md
  border
  border-slate-300
  bg-white
  px-3
  text-sm
  text-slate-800
  outline-none
  transition-all
  duration-150
  placeholder:text-slate-400
  hover:border-teal-400
  hover:bg-teal-50/20
  focus:border-teal-500
  focus:bg-white
  focus:ring-2
  focus:ring-teal-100
  disabled:cursor-not-allowed
  disabled:bg-slate-100
  disabled:text-slate-500
`;

const fresh = (type, number = '') => ({
  type,
  contractType: 'fabric_sale',
  contractNo: number,
  contractDate: getBusinessDateInputValue(),
  partyId: '',
  partyName: '',
  itemId: '',
  quantity: '',
  kg: '',
  lbs: '',
  sourceEntryUnit: 'KG',
  unit: type === 'purchase' ? 'KG' : 'Meter',
  rate: '',
  deliveryDate: '',
  brokerName: '',
  commissionPercent: '',
  creditDays: '',
  paymentTerms: '',
  packingTerms: '',
  deliveryTerms: '',
  expiryDate: '',
  status: 'active',
  notes: '',
});

const itemLabel = (item) => item.displayLabel || item.name;

const Field = ({ label, children, span = '' }) => (
  <label className={`min-w-0 text-xs font-semibold text-slate-600 ${span}`}>
    <span className="block min-h-[18px] leading-[18px]">{label}</span>

    {children}
  </label>
);

const WeavingContractsPage = ({ initialTab = 'sales', embedded = false, listMode = false, onNew }) => {
  const [tab, setTab] = useState(initialTab);

  const [meta, setMeta] = useState({
    yarns: [],
    fabrics: [],
    parties: [],
    nextNumbers: {},
  });

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(fresh(initialTab));

  const [editingId, setEditingId] = useState('');

  const [search, setSearch] = useState('');

  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState(null);
  const [detail, setDetail] = useState(null);
  useWeavingFeedback(notice, setNotice);

  const load = useCallback(async () => {
    try {
      const [setup, list] = await Promise.all([
        getWeavingContractMeta(),

        listWeavingContracts({
          type: tab,
        }),
      ]);

      setup.yarns = (setup.yarns || []).map((row) => ({
        ...row,
        displayLabel: [row.name, row.millBrand, row.quality, row.count].filter(Boolean).join(' | '),
      }));

      setup.fabrics = (setup.fabrics || []).map((row) => ({
        ...row,
        displayLabel: [row.name, row.construction, row.width].filter(Boolean).join(' | '),
      }));

      setMeta(setup);
      const term = search.trim().toLocaleLowerCase('en');
      setRows(term
        ? list.filter((row) => [row.contractNo, row.partyName, row.itemName, row.contractDate, row.deliveryDate, row.status]
          .some((value) => String(value || '').toLocaleLowerCase('en').includes(term)))
        : list);

      if (!editingId) {
        setForm((current) => ({
          ...current,

          contractNo: current.contractNo || setup.nextNumbers?.[tab] || '',
        }));
      }
    } catch (error) {
      setNotice({
        error: true,

        text: error.response?.data?.message || t('weaving.operations.loadFailed'),
      });
    }
  }, [editingId, search, tab]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);

    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setEditingId('');

    setForm(fresh(tab, meta.nextNumbers?.[tab]));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const parties = meta.parties.filter(
    (row) => row.role === 'both' || row.role === (tab === 'sales' ? 'customer' : 'supplier')
  );

  const items = tab === 'sales' ? meta.fabrics : meta.yarns;

  const reset = () => {
    setEditingId('');

    setForm(fresh(tab, meta.nextNumbers?.[tab]));
  };

  const save = async (close) => {
    setSaving(true);
    setNotice(null);

    try {
      if (editingId) {
        await updateWeavingContract(editingId, form);
      } else {
        await createWeavingContract(form);
      }

      setNotice({
        text: t('weaving.operations.saved'),
      });

      reset();
      await load();

      if (close) {
        setNotice({
          text: t('weaving.operations.saved'),
        });
      }
    } catch (error) {
      setNotice({
        error: true,

        text: error.response?.data?.message || t('weaving.operations.saveFailed'),
      });
    } finally {
      setSaving(false);
    }
  };

  const edit = (row) => {
    setEditingId(row._id);

    setForm({
      ...fresh(tab),
      ...row,

      partyId: row.partyId?._id || row.partyId,

      itemId: row.itemId?._id || row.itemId,

      kg: row.unit === 'KG' ? row.quantity : '',

      lbs: row.unit === 'KG' ? Math.round(row.quantity * KG_TO_LBS * 1000) / 1000 : '',
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const label = (key) => t(`weaving.operations.${key}`);

  const patch = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));

  return (
    <div
      className={
        embedded
          ? ''
          : 'min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/50 px-3 pb-4 pt-1'
      }
    >
      <div className="mx-auto max-w-[1600px] space-y-2">
        {!embedded && (
          <>
            <header className="rounded-md border border-slate-200 bg-gradient-to-r from-white via-teal-50/60 to-emerald-50/40 px-4 py-3 shadow-sm">
              <h1 className="text-xl font-bold text-slate-900">{label('contracts')}</h1>

              <p className="mt-0.5 text-xs text-slate-500">{label('contractsSubtitle')}</p>
            </header>

            <div className="flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
              {['sales', 'purchase'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
                    tab === key
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  {label(`${key}Contract`)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* FORM */}
        {!listMode && <section className="overflow-visible rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-teal-50/60 px-4 py-2.5 font-bold text-slate-900">
            {editingId ? label('editContract') : label('newContract')}
          </div>

          <div className="grid gap-x-3 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={`${label('contractNo')} *`}>
              <input disabled className={input} value={form.contractNo} />
            </Field>

            <Field label={`${label('contractDate')} *`}>
              <input
                type="date"
                className={input}
                value={form.contractDate}
                onChange={patch('contractDate')}
              />
            </Field>

            {tab === 'sales' && (
              <Field label={`${t('weaving.sales.contractType')} *`}>
                <select
                  className={input}
                  value={form.contractType}
                  onChange={patch('contractType')}
                >
                  <option value="fabric_sale">{t('weaving.sales.fabricSale')}</option>

                  <option value="conversion">{t('weaving.sales.conversion')}</option>
                </select>
              </Field>
            )}

            <SearchableCreatableSelect
              label={tab === 'sales' ? label('customer') : label('supplier')}
              placeholder="Search Party"
              options={parties}
              value={form.partyId}
              required
              onChange={(partyId, row) =>
                setForm({
                  ...form,
                  partyId,
                  partyName: row?.name || '',
                })
              }
            />

            <SearchableCreatableSelect
              label={tab === 'sales' ? label('fabricQuality') : label('yarnMaster')}
              placeholder="Search Item"
              options={items}
              value={form.itemId}
              required
              getLabel={itemLabel}
              onChange={(itemId, row) =>
                setForm({
                  ...form,
                  itemId,

                  ...(tab === 'sales' && row
                    ? {
                        unit: row.primaryUnit,
                      }
                    : {}),
                })
              }
            />

            <Field label={`${label('unit')} *`}>
              <select
                className={input}
                value={form.unit}
                onChange={patch('unit')}
                disabled={tab === 'purchase'}
              >
                <option>KG</option>
                <option>Meter</option>
                <option>Yard</option>
              </select>
            </Field>

            <div className="sm:col-span-2">
              {form.unit === 'KG' ? (
                <WeightKgLbsInput
                  kg={form.kg}
                  lbs={form.lbs}
                  required
                  onChange={(value) =>
                    setForm({
                      ...form,
                      ...value,
                    })
                  }
                />
              ) : (
                <Field label={`${label('quantity')} (${form.unit}) *`}>
                  <input
                    type="number"
                    min="0"
                    className={input}
                    value={form.quantity}
                    onChange={patch('quantity')}
                  />
                </Field>
              )}
            </div>

            <Field label={`${label('rate')} *`}>
              <input
                type="number"
                min="0"
                className={input}
                value={form.rate}
                onChange={patch('rate')}
              />
            </Field>

            <Field label={label('deliveryDate')}>
              <input
                type="date"
                className={input}
                value={form.deliveryDate}
                onChange={patch('deliveryDate')}
              />
            </Field>

            {tab === 'sales' && (
              <>
                <Field label="Broker">
                  <input className={input} value={form.brokerName} onChange={patch('brokerName')} />
                </Field>

                <Field label="Commission %">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className={input}
                    value={form.commissionPercent}
                    onChange={patch('commissionPercent')}
                  />
                </Field>

                <Field label={t('weaving.sales.creditDays')}>
                  <input
                    type="number"
                    min="0"
                    className={input}
                    value={form.creditDays}
                    onChange={patch('creditDays')}
                  />
                </Field>

                <Field label="Expiry Date">
                  <input
                    type="date"
                    className={input}
                    value={form.expiryDate}
                    onChange={patch('expiryDate')}
                  />
                </Field>

                <Field label="Payment Terms">
                  <input
                    className={input}
                    value={form.paymentTerms}
                    onChange={patch('paymentTerms')}
                  />
                </Field>

                <Field label="Packing Terms">
                  <input
                    className={input}
                    value={form.packingTerms}
                    onChange={patch('packingTerms')}
                  />
                </Field>

                <Field label="Delivery Terms">
                  <input
                    className={input}
                    value={form.deliveryTerms}
                    onChange={patch('deliveryTerms')}
                  />
                </Field>

                <Field label="Status">
                  <select className={input} value={form.status} onChange={patch('status')}>
                    <option value="active">Active</option>

                    <option value="complete">Complete</option>

                    <option value="expired">Expired</option>
                  </select>
                </Field>
              </>
            )}

            <Field label={label('notesTerms')} span="sm:col-span-2 lg:col-span-4">
              <textarea
                rows="2"
                className={`${input} h-16 resize-none py-2`}
                value={form.notes}
                onChange={patch('notes')}
              />
            </Field>

            <div className="col-span-full border-t border-slate-100 pt-2">
              <WeavingFormActions
                editing={!!editingId}
                saving={saving}
                onSaveClose={() => save(true)}
                onSaveNew={() => save(false)}
                onClear={reset}
                onCancel={reset}
              />
            </div>
          </div>
        </section>}

        {/* LIST */}
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
            <h2 className="font-bold text-slate-900">{label(`${tab}Contract`)}</h2>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              {listMode && <button type="button" onClick={onNew} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-teal-600 px-3 text-sm font-semibold text-white hover:bg-teal-700"><FaPlus /> {label('newContract')}</button>}
              <div className="relative min-w-0 flex-1 sm:w-72">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />

              <input
                className={`${input} mt-0 pl-8`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={label('search')}
              />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-100 to-teal-50 text-left text-xs uppercase text-slate-600">
                <tr>
                  {[
                    'contractNo',
                    'contractDate',
                    'party',
                    'item',
                    'quantity',
                    'rate',
                    'actions',
                  ].map((key) => (
                    <th key={key} className="px-4 py-2.5">
                      {label(key)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} role="button" tabIndex={0} onClick={() => setDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(row); } }} className="cursor-pointer border-t transition hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-500">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {row.contractNo}

                      {row.type === 'sales' && (
                        <div className="text-xs font-normal text-teal-700">
                          {row.contractType === 'conversion'
                            ? t('weaving.sales.conversion')
                            : t('weaving.sales.fabricSale')}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-2.5">{row.contractDate}</td>

                    <td className="px-4 py-2.5">{row.partyName}</td>

                    <td className="px-4 py-2.5">{row.itemName}</td>

                    <td className="px-4 py-2.5">
                      {row.quantity} {row.unit}
                    </td>

                    <td className="px-4 py-2.5">{row.rate}</td>

                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        title="Edit"
                        onClick={(event) => { event.stopPropagation(); edit(row); if (listMode) onNew(); }}
                        className="rounded-md p-2 text-teal-700 transition hover:bg-teal-100"
                      >
                        <FaEdit />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!rows.length && (
              <div className="p-10 text-center text-slate-500">
                <FaFileContract className="mx-auto mb-2 text-2xl text-slate-300" />

                {label('noRecords')}
              </div>
            )}
          </div>
        </section>

        {detail && (
          <div className="fixed inset-0 z-[300] flex justify-end bg-slate-950/40" onClick={() => setDetail(null)}>
            <aside className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <header className="sticky top-0 flex items-start gap-3 border-b bg-white p-5">
                <div className="mr-auto"><h2 className="text-xl font-bold text-slate-900">{detail.contractNo}</h2><p className="text-sm text-slate-500">{detail.type === 'sales' ? label('salesContract') : label('purchaseContract')}</p></div>
                <button type="button" onClick={() => setDetail(null)} className="grid h-9 w-9 place-items-center rounded-md border text-slate-600 hover:bg-slate-50"><FaTimes /></button>
              </header>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 text-sm">
                {[
                  [label('contractDate'), detail.contractDate],
                  [label('party'), detail.partyName],
                  [label('item'), detail.itemName],
                  [label('quantity'), `${detail.quantity} ${detail.unit}`],
                  [label('rate'), detail.rate],
                  ['Status', detail.status],
                  [label('deliveryDate'), detail.deliveryDate || '-'],
                  ['Broker', detail.brokerName || '-'],
                  ['Payment Terms', detail.paymentTerms || '-'],
                  [label('notesTerms'), detail.notes || '-'],
                ].map(([name, value]) => <div key={name} className="min-w-0"><dt className="text-xs font-semibold uppercase text-slate-500">{name}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value || '-'}</dd></div>)}
              </dl>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeavingContractsPage;
