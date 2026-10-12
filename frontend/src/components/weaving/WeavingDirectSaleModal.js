import React, { useEffect, useMemo, useState } from 'react';
import { formatMoneyDisplay } from '../../utils/money';
import { FaTimes } from 'react-icons/fa';
import WeavingSaleSaveOutput, { useSaleSaveOutput, savedSaleOutputUrl } from './WeavingSaleSaveOutput';

import SearchableCreatableSelect from './SearchableCreatableSelect';
import WeavingCounterpartySelect from './WeavingCounterpartySelect';
import WeavingSalePaymentSection, {
  paymentError,
  paymentReceived,
  confirmExcessPayment,
} from './WeavingSalePaymentSection';

import { t, getCurrentLanguage } from '../../i18n/i18n';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { createWeavingItem } from '../../services/weavingCommercialService';
import {
  LBS_TO_KG,
  autoYarnWeight,
  packageProfilesFor,
  roundYarnQuantity,
} from '../../utils/weaving/yarnPackaging';

const recoveryKey = 'weaving:sale:unsaved:direct';

const control =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-500';

const key = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const money = formatMoneyDisplay;

const MiniField = ({ label, children, className = '' }) => (
  <label className={`block min-w-0 ${className}`}>
    {label && (
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
    )}
    {children}
  </label>
);

const NumberInput = ({ value, onChange, placeholder, className = '', ...props }) => (
  <input
    type="number"
    min="0"
    step="any"
    aria-label={placeholder}
    placeholder={placeholder}
    className={`${control} ${className}`}
    value={value ?? ''}
    onChange={onChange}
    {...props}
  />
);

const emptyForm = () => ({
  invoiceNo: '',
  invoiceDate: getBusinessDateInputValue(),

  partyId: '',

  saleNature: 'fabric',

  fabricCategory: 'normal',
  otherSubtype: 'rejected',

  fabricQualityId: '',
  yarnId: '',
  godownId: '',

  description: '',

  quantity: '',
  uom: 'Job',

  weightKg: '',
  thanCount: '',
  pieceCount: '',
  itemId: '',

  packageType: 'bag',
  packageQty: '',
  smallCones: '',
  largeCones: '',

  finalRate: '',

  discountAmount: '',
  taxAmount: '',

  creditDays: '',
  dueDate: '',

  receivedNow: '',
  paymentAccountId: '',
  paymentMethod: '',

  chequeNo: '',
  chequeBank: '',
  chequeDate: '',
  chequeDueDate: '',

  receiptRequestKey: key(),

  notes: '',
});

const fromInvoice = (invoice) => ({
  ...emptyForm(),

  invoiceNo: invoice.invoiceNo || '',
  invoiceDate: invoice.invoiceDate || getBusinessDateInputValue(),

  partyId: invoice.partyId?._id || invoice.partyId || '',

  saleNature: invoice.saleNature || 'fabric',

  fabricCategory: invoice.fabricCategory || 'normal',
  otherSubtype: invoice.otherSubtype || 'rejected',

  fabricQualityId: invoice.fabricQualityId?._id || invoice.fabricQualityId || '',

  yarnId: invoice.yarnId?._id || invoice.yarnId || '',

  godownId: invoice.godownId?._id || invoice.godownId || '',

  description: invoice.description || '',

  quantity: invoice.quantity || '',
  uom: invoice.uom || 'Job',

  weightKg: invoice.weightKg || '',
  thanCount: invoice.thanCount || '',
  pieceCount: invoice.pieceCount || '',

  packageType: invoice.packageType || 'bag',
  packageQty: invoice.packageQty || '',
  smallCones: invoice.smallCones || '',
  largeCones: invoice.largeCones || '',

  finalRate: invoice.finalRate || '',

  discountAmount: invoice.discountAmount || '',
  taxAmount: invoice.taxAmount || '',

  creditDays: invoice.creditDays || '',
  dueDate: invoice.dueDate || '',

  rateOverrideReason: invoice.rateOverrideReason || '',

  receivedNow: invoice.receivedNowRequested || '',

  paymentAccountId: invoice.paymentAccountId?._id || invoice.paymentAccountId || '',

  paymentMethod: invoice.paymentMethod || '',

  ...(invoice.paymentDetails || {}),

  receiptRequestKey: invoice.receiptRequestKey || key(),

  notes: invoice.notes || '',
});

const restore = () => {
  try {
    return {
      ...emptyForm(),
      ...JSON.parse(localStorage.getItem(recoveryKey) || '{}'),
    };
  } catch {
    return emptyForm();
  }
};

export const clearDirectSaleRecovery = () => localStorage.removeItem(recoveryKey);

function LegacyDirectSaleModal({ meta, current, saving, onClose, onSave, onPartySaved, onPartyError }) {
  const [form, setForm] = useState(() => (current ? fromInvoice(current) : restore()));

  const [error, setError] = useState('');
  const [editRequestKey] = useState(key);

  const general = form.saleNature === 'other' && form.otherSubtype === 'other';

  const grand = useMemo(
    () =>
      Math.max(
        0,
        Number(form.quantity || (general ? 1 : 0)) * Number(form.finalRate || 0) -
          Number(form.discountAmount || 0) +
          Number(form.taxAmount || 0)
      ),
    [form.quantity, form.finalRate, form.discountAmount, form.taxAmount, general]
  );

  useEffect(() => {
    if (current) return undefined;

    const timer = window.setTimeout(() => {
      localStorage.setItem(recoveryKey, JSON.stringify(form));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [current, form]);

  useEffect(() => {
    if (!current && meta.nextInvoiceNo) {
      setForm((value) => ({
        ...value,
        invoiceNo: value.invoiceNo || meta.nextInvoiceNo,
      }));
    }
  }, [current, meta.nextInvoiceNo]);

  const patch = (next) =>
    setForm((value) => ({
      ...value,
      ...next,
    }));

  const close = () => {
    if (!current) clearDirectSaleRecovery();
    onClose();
  };

  const performSave = async () => {
    if (saving) return;

    const issue = paymentError(form, grand);

    if (issue) {
      setError(issue);
      return;
    }

    if (!(await confirmExcessPayment(form, grand))) return;

    const result = await onSave({
      ...form,

      editRequestKey,
      expectedUpdatedAt: current?.updatedAt,

      quantity: form.quantity || (general ? 1 : ''),

      receivedNow: paymentReceived(form),
    });

    if (result && !current) clearDirectSaleRecovery();
    return result;
  };
  const save = useSaleSaveOutput(performSave, savedSaleOutputUrl, saving);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3"
      dir={getCurrentLanguage() === 'ur' ? 'rtl' : 'ltr'}
    >
      <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h2 className="text-lg font-black text-slate-900">
            {current ? `Edit ${current.invoiceNo}` : t('weaving.sales.newDirect')}
          </h2>

          <button
            type="button"
            aria-label={t('weaving.sales.close')}
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <FaTimes />
          </button>
        </header>

        <div className="overflow-y-auto p-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniField label={t('weaving.sales.invoiceDate')}>
              <input
                type="date"
                className={control}
                value={form.invoiceDate}
                onChange={(event) => patch({ invoiceDate: event.target.value })}
              />
            </MiniField>

            <WeavingCounterpartySelect
              label={t('weaving.sales.party')}
              parties={meta.parties}
              context="customer"
              value={form.partyId}
              required
              onChange={(partyId) => patch({ partyId })}
              onPartySaved={onPartySaved}
              onError={onPartyError}
            />

            <MiniField label={t('weaving.sales.saleType')}>
              <select
                disabled={Boolean(current)}
                className={control}
                value={form.saleNature}
                onChange={(event) =>
                  patch({
                    saleNature: event.target.value,
                    fabricQualityId: '',
                    yarnId: '',
                    godownId: '',
                  })
                }
              >
                <option value="fabric">{t('weaving.sales.fabricSale')}</option>

                <option value="yarn">{t('weaving.sales.yarnSale')}</option>

                <option value="other">{t('weaving.sales.otherSale')}</option>
              </select>
            </MiniField>

            {form.saleNature === 'fabric' && (
              <MiniField label={t('weaving.sales.grade')}>
                <select
                  className={control}
                  value={form.fabricCategory}
                  onChange={(event) => patch({ fabricCategory: event.target.value })}
                >
                  <option value="normal">Normal / A</option>
                  <option value="b">B Grade</option>
                </select>
              </MiniField>
            )}

            {form.saleNature === 'other' && (
              <MiniField label={t('weaving.sales.subtype')}>
                <select
                  disabled={Boolean(current)}
                  className={control}
                  value={form.otherSubtype}
                  onChange={(event) => patch({ otherSubtype: event.target.value })}
                >
                  <option value="rejected">{t('weaving.sales.rejected')}</option>

                  <option value="cut_piece">{t('weaving.sales.cutPiece')}</option>

                  <option value="waste">{t('weaving.sales.waste')}</option>

                  <option value="other">{t('weaving.sales.generalOther')}</option>
                </select>
              </MiniField>
            )}

            {!general && form.saleNature !== 'yarn' && (
              <SearchableCreatableSelect
                label={t('weaving.sales.quality')}
                options={meta.qualities}
                value={form.fabricQualityId}
                required
                onChange={(fabricQualityId) => patch({ fabricQualityId })}
              />
            )}

            {form.saleNature === 'yarn' && (
              <SearchableCreatableSelect
                label={t('weaving.sales.yarn')}
                options={meta.yarns}
                value={form.yarnId}
                required
                onChange={(yarnId) => patch({ yarnId })}
              />
            )}

            {!general && (
              <MiniField label={t('weaving.salesPro.sourceLocation')}>
                <select
                  className={control}
                  value={form.godownId}
                  onChange={(event) => patch({ godownId: event.target.value })}
                >
                  <option value="">{t('weaving.salesPro.selectSource')}</option>

                  {meta.godowns.map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </MiniField>
            )}

            {general && (
              <>
                <input
                  className={`${control} lg:col-span-2`}
                  placeholder={t('weaving.sales.description')}
                  aria-label={t('weaving.sales.description')}
                  value={form.description}
                  onChange={(event) => patch({ description: event.target.value })}
                />

                <select
                  aria-label="UOM"
                  className={control}
                  value={form.uom}
                  onChange={(event) => patch({ uom: event.target.value })}
                >
                  {['Job', 'Nos', 'Piece', 'KG', 'Meter', 'Other'].map((uom) => (
                    <option key={uom}>{uom}</option>
                  ))}
                </select>
              </>
            )}

            <NumberInput
              placeholder={general ? 'Qty' : form.saleNature === 'yarn' ? 'Sale KG' : 'Sale Meter'}
              value={form.quantity}
              onChange={(event) => patch({ quantity: event.target.value })}
            />

            {!general && form.saleNature !== 'yarn' && (
              <>
                <NumberInput
                  placeholder="Actual KG"
                  value={form.weightKg}
                  onChange={(event) => patch({ weightKg: event.target.value })}
                />

                <NumberInput
                  placeholder="Than Count"
                  value={form.thanCount}
                  onChange={(event) => patch({ thanCount: event.target.value })}
                />

                {form.saleNature === 'other' && (
                  <NumberInput
                    placeholder="Piece Count"
                    value={form.pieceCount}
                    onChange={(event) => patch({ pieceCount: event.target.value })}
                  />
                )}
              </>
            )}

            <NumberInput
              placeholder={
                general
                  ? 'Amount'
                  : form.saleNature === 'yarn'
                    ? 'Rate / KG'
                    : t('weaving.sales.rate')
              }
              value={form.finalRate}
              onChange={(event) => patch({ finalRate: event.target.value })}
            />

            <NumberInput
              placeholder={t('weaving.salesPro.discount')}
              value={form.discountAmount}
              onChange={(event) => patch({ discountAmount: event.target.value })}
            />

            <NumberInput
              placeholder={t('weaving.salesPro.tax')}
              value={form.taxAmount}
              onChange={(event) => patch({ taxAmount: event.target.value })}
            />
          </div>

          {current && Number(form.finalRate) !== Number(current.originalRate) && (
            <input
              className={`${control} mt-3`}
              placeholder={t('weaving.salesCleanup.rateReason')}
              value={form.rateOverrideReason || ''}
              onChange={(event) => patch({ rateOverrideReason: event.target.value })}
            />
          )}

          <div className="mt-3">
            <WeavingSalePaymentSection
              form={form}
              onChange={patch}
              total={grand}
              accounts={meta.paymentAccounts}
              date={form.invoiceDate}
            />
          </div>

          <input
            className={`${control} mt-3`}
            placeholder={t('weaving.sales.notes')}
            aria-label={t('weaving.sales.notes')}
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
          />

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <button
            type="button"
            onClick={() => {
              setForm(current ? fromInvoice(current) : emptyForm());
              setError('');
            }}
            className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            {t('weaving.salesCleanup.reset')}
          </button>

          <button
            type="button"
            onClick={close}
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('weaving.sales.cancel')}
          </button>

          <WeavingSaleSaveOutput onSave={save} disabled={saving} />
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="h-10 rounded-lg bg-teal-700 px-6 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-40"
          >
            {saving ? t('weaving.sales.saving') : t('weaving.salesCleanup.save')}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function WeavingDirectSaleModal(props) {
  return props.current &&
    (!props.current.entryMode || props.current.entryMode === 'legacy') &&
    !props.current.accountingOnly &&
    !(props.current.saleNature === 'yarn' && props.current.uom === 'LBS') ? (
    <LegacyDirectSaleModal {...props} />
  ) : (
    <NewDirectSaleModal {...props} />
  );
}

/* -------------------------------------------------------------------------- */
/* NEW DIRECT SALES                                                            */
/* -------------------------------------------------------------------------- */

function NewDirectSaleModal({
  meta,
  current,
  kind = current?.saleNature || 'fabric',
  saving,
  onClose,
  onSave,
  onItemCreated,
  onPartySaved,
  onPartyError,
}) {
  const productionMode = meta.productionTrackingMode || 'detailed';
  const preferredEntryMode = productionMode === 'detailed' ? 'than' : 'manual';

  const defaults = () => ({
    ...emptyForm(),

    saleNature: kind,

    entryMode: preferredEntryMode,

    wasteMode: 'quick',
    otherSubtype: 'waste',

    amount: '',

    rows: [
      {
        itemId: '',
        description: '',
        uom: 'KG',
        quantity: '',
        rate: '',
      },
    ],

    foldingEntryIds: [],

    requestKey: key(),
  });

  const editDefaults = () => ({
    ...defaults(),
    ...fromInvoice(current),

    entryMode: current.entryMode,

    godownId: current.godownId?._id || current.godownId || '__folding__',

    foldingEntryIds: (current.foldingEntryIds || []).map(String),

    wasteMode: current.lines?.length ? 'detailed' : 'quick',

    rows: current.lines?.length ? current.lines : defaults().rows,

    amount: current.subtotal,

    weightKg: current.uom === 'Job' ? '' : current.weightKg,

    finalRate: current.accountingOnly && current.uom === 'Job' ? '' : current.finalRate,

    editRequestKey: key(),

    expectedUpdatedAt: current.updatedAt,
  });

  const [initial] = useState(() => {
    if (current) return editDefaults();

    try {
      const recovered = JSON.parse(localStorage.getItem(`${recoveryKey}:${kind}`) || '{}');

      return {
        ...defaults(),
        ...recovered,

        entryMode: kind === 'fabric' ? preferredEntryMode : recovered.entryMode || preferredEntryMode,
      };
    } catch {
      return defaults();
    }
  });

  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [itemOptions, setItemOptions] = useState(() =>
    (meta.items || []).filter((item) => item.category === 'other')
  );

  const patch = (next) =>
    setForm((value) => ({
      ...value,
      ...next,
    }));

  const normalizeItemName = (value = '') =>
    String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

  const safeSaleUom = (unit, fallback = 'KG') =>
    ['Meter', 'KG', 'Piece', 'Nos', 'Job', 'Other'].includes(unit) ? unit : fallback;

  const quickAddSaleItem = async (name, unit, apply) => {
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) return null;

    let item = itemOptions.find(
      (row) => normalizeItemName(row.name) === normalizeItemName(cleanName)
    );

    if (!item) {
      item = await createWeavingItem({
        name: cleanName,
        category: 'other',
        unit: unit || 'KG',
      });

      setItemOptions((rows) => [...rows.filter((row) => row._id !== item._id), item]);
      onItemCreated?.(item);
    }

    apply(item);
    return item;
  };

  const clear = () => {
    setForm(current ? initial : defaults());
    setError('');

    if (!current) {
      localStorage.removeItem(`${recoveryKey}:${kind}`);
    }
  };

  useEffect(() => {
    if (current) return undefined;

    const timer = window.setTimeout(() => {
      localStorage.setItem(`${recoveryKey}:${kind}`, JSON.stringify(form));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [form, kind, current]);

  const sourceId = form.godownId === '__folding__' ? '' : form.godownId;

  const ownSources = current?.selectedThans || [];

  const allThans = [
    ...(meta.availableThans || []),

    ...ownSources.filter(
      (row) => !(meta.availableThans || []).some((item) => String(item._id) === String(row._id))
    ),
  ];

  const matchingThans = allThans.filter(
    (row) =>
      Boolean(form.fabricQualityId) &&
      row.ownershipType === 'own' &&
      String(row.fabricQualityId?._id || row.fabricQualityId) === form.fabricQualityId &&
      (row.category || 'normal') === form.fabricCategory
  );

  const available = matchingThans.filter(
    (row) =>
      Boolean(form.godownId) &&
      String(row.godownId?._id || row.godownId || '') === sourceId
  );

  const selected = available.filter((row) => form.foldingEntryIds.includes(String(row._id)));

  const exact = kind === 'fabric' && form.entryMode === 'than';

  const meter = exact
    ? selected.reduce((sum, row) => sum + Number(row.meter || 0), 0)
    : Number(form.quantity || 0);

  const kg = exact
    ? selected.reduce((sum, row) => sum + Number(row.weightKg || 0), 0)
    : Number(form.weightKg || 0);

  const manual = (meta.manualStock || []).find(
    (row) =>
      row.ownershipType === 'own' &&
      String(row.fabricQualityId) === form.fabricQualityId &&
      String(row.godownId || '') === sourceId &&
      row.category === form.fabricCategory
  );

  const matchingMeterStock = (meta.manualStock || []).filter(
    (row) =>
      Boolean(form.fabricQualityId) &&
      row.ownershipType === 'own' &&
      String(row.fabricQualityId) === form.fabricQualityId &&
      row.category === form.fabricCategory &&
      Number(row.meter || 0) > 0
  );

  const yarn = (meta.yarnStock || []).find(
    (row) =>
      row.ownershipType === 'own' &&
      String(row.yarnId?._id || row.yarnId) === form.yarnId &&
      String(row.godownId?._id || row.godownId || '') === sourceId
  );

  const selectedYarn = (meta.yarns || []).find((row) => String(row._id) === String(form.yarnId));

  const yarnProfile = packageProfilesFor(selectedYarn).find(
    (profile) => profile.packageType === 'bag'
  );

  const yarnPacking = autoYarnWeight({
    packageWeight: yarnProfile?.packageWeight,
    packageQty: form.packageQty,
    smallCones: form.smallCones,
    largeCones: form.largeCones,
    smallConesPerPackage: yarnProfile?.smallConesPerPackage,
    largeConesPerPackage: yarnProfile?.largeConesPerPackage,
  });

  const saleLbs = Number(yarnPacking.lbs || 0);
  const saleKg = Number(yarnPacking.kg || 0);
  const saleQuantity = kind === 'yarn' ? saleLbs : meter;

  const detailed = kind === 'other' && form.wasteMode === 'detailed';

  const quickKg = Number(form.weightKg) > 0 && Number(form.finalRate) > 0;

  const amount = detailed
    ? form.rows.reduce(
        (sum, row) =>
          sum + Math.round(Number(row.quantity || 0) * Number(row.rate || 0) * 100) / 100,
        0
      )
    : kind === 'other'
      ? quickKg
        ? Number(form.weightKg) * Number(form.finalRate)
        : Number(form.amount || 0)
      : kind === 'yarn'
        ? saleLbs * Number(form.finalRate || 0)
        : meter * Number(form.finalRate || 0);

  const total =
    Math.round((amount - Number(form.discountAmount || 0) + Number(form.taxAmount || 0)) * 100) /
    100;

  const availableAmount = kind === 'yarn' ? Number(yarn?.kg || 0) : Number(manual?.meter || 0);
  const availableLbs = roundYarnQuantity(availableAmount / LBS_TO_KG);

  const performSave = async () => {
    if (saving) return;

    let message = !form.partyId || !form.invoiceDate ? t('weaving.salesPro.selectPartyDate') : '';

    if (
      kind !== 'other' &&
      (!form.godownId || !(kind === 'yarn' ? form.yarnId : form.fabricQualityId))
    ) {
      message = t('weaving.salesPro.selectStock');
    }

    if (exact && !selected.length) {
      message = t('weaving.salesPro.selectThans');
    }

    if (total <= 0 || (kind !== 'other' && saleQuantity <= 0)) {
      message = t('weaving.salesPro.validAmount');
    }

    if (kind === 'yarn' && saleKg > availableAmount + 0.000001) {
      message = `Only ${money(availableLbs)} LBS (${money(availableAmount)} KG) Yarn is available.`;
    }

    if (
      detailed &&
      form.rows.some(
        (row) =>
          !String(row.description || '').trim() ||
          Number(row.quantity) <= 0 ||
          Number(row.rate) <= 0
      )
    ) {
      message = t('weaving.salesPro.validRows');
    }

    message ||= paymentError(form, total);

    if (message) {
      setError(message);
      return;
    }

    if (!(await confirmExcessPayment(form, total))) return;

    const invoice = await onSave({
      ...form,

      godownId: form.godownId === '__folding__' ? null : form.godownId,

      accountingOnly: kind === 'other',

      description:
        kind === 'other'
          ? form.description || (detailed ? t('weaving.sales.otherSale') : t('weaving.sales.waste'))
          : form.description,

      lines: detailed ? form.rows : [],

      quantity:
        kind === 'other'
          ? quickKg && !detailed
            ? form.weightKg
            : 1
          : kind === 'yarn'
            ? saleLbs
            : meter,

      finalRate:
        kind === 'other' ? (quickKg && !detailed ? form.finalRate : amount) : form.finalRate,

      uom:
        kind === 'other' ? (quickKg && !detailed ? 'KG' : 'Job') : kind === 'yarn' ? 'LBS' : 'Meter',

      weightKg: kind === 'yarn' ? saleKg : kg,

      sourceEntryUnit: kind === 'yarn' ? 'LBS' : undefined,

      packageType: kind === 'yarn' ? yarnProfile?.packageType || 'bag' : undefined,
      packageQty: kind === 'yarn' ? form.packageQty : undefined,
      smallCones: kind === 'yarn' ? form.smallCones : undefined,
      largeCones: kind === 'yarn' ? form.largeCones : undefined,

      thanCount: exact ? selected.length : form.thanCount,

      receivedNow: paymentReceived(form, total),
    });

    if (invoice && !current) {
      localStorage.removeItem(`${recoveryKey}:${kind}`);
    }
    return invoice;
  };
  const save = useSaleSaveOutput(performSave, savedSaleOutputUrl, saving);

  const saleTitle =
    current?.invoiceNo || t(`weaving.sales.${kind === 'other' ? 'other' : kind}Sale`);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-2 sm:p-3"
      dir={getCurrentLanguage() === 'ur' ? 'rtl' : 'ltr'}
    >
      <section className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* HEADER */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h2 className="text-lg font-black text-slate-900">{saleTitle}</h2>

          <button
            type="button"
            aria-label={t('weaving.sales.close')}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <FaTimes />
          </button>
        </header>

        {/* BODY */}
        <div className="overflow-y-auto p-3 sm:p-4">
          {/* MODE */}
          {kind === 'other' && (
            <div className="mb-3 flex overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1">
              {[
                ['quick', 'quick'],
                ['detailed', 'detailed'],
              ].map(([value, label]) => {
                const active = form.wasteMode === value;

                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => patch({ wasteMode: value })}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${
                      active
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t(`weaving.salesPro.${label}`)}
                  </button>
                );
              })}
            </div>
          )}

          {!current && kind === 'fabric' && form.entryMode !== preferredEntryMode && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Using historical {form.entryMode === 'than' ? 'Than' : 'Meter'} stock.{' '}
              <button
                type="button"
                className="font-bold underline"
                onClick={() =>
                  patch({
                    entryMode: preferredEntryMode,
                    foldingEntryIds: [],
                    godownId: '',
                    quantity: '',
                  })
                }
              >
                Return to current production flow
              </button>
            </div>
          )}

          {/* MAIN COMPACT FORM */}
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* DATE */}
              <MiniField label={t('weaving.sales.date')}>
                <input
                  type="date"
                  className={control}
                  value={form.invoiceDate}
                  onChange={(event) => patch({ invoiceDate: event.target.value })}
                />
              </MiniField>

              {/* PARTY */}
              <WeavingCounterpartySelect
                label={t('weaving.sales.party')}
                parties={meta.parties}
                context="customer"
                value={form.partyId}
                onChange={(partyId) => patch({ partyId })}
                onPartySaved={onPartySaved}
                onError={onPartyError}
              />

              {/* STOCK ITEM */}
              {kind !== 'other' && (
                <SearchableCreatableSelect
                  label={t(kind === 'yarn' ? 'weaving.sales.yarn' : 'weaving.sales.quality')}
                  options={kind === 'yarn' ? meta.yarns : meta.qualities}
                  value={kind === 'yarn' ? form.yarnId : form.fabricQualityId}
                  onChange={(value) => {
                    const yarnLocations =
                      kind === 'yarn'
                        ? [
                            ...new Set(
                              (meta.yarnStock || [])
                                .filter(
                                  (row) =>
                                    row.ownershipType === 'own' &&
                                    String(row.yarnId?._id || row.yarnId) === String(value) &&
                                    Number(row.kg || 0) > 0
                                )
                                .map((row) => String(row.godownId?._id || row.godownId || ''))
                                .filter(Boolean)
                            ),
                          ]
                        : [];

                    patch({
                      [kind === 'yarn' ? 'yarnId' : 'fabricQualityId']: value,

                      foldingEntryIds: [],

                      ...(kind === 'yarn'
                        ? {
                            godownId: yarnLocations.length === 1 ? yarnLocations[0] : '',
                            packageQty: '',
                            smallCones: '',
                            largeCones: '',
                          }
                        : {}),
                    });
                  }}
                />
              )}

              {/* SOURCE */}
              {kind !== 'other' && (
                <MiniField label={t('weaving.salesPro.sourceLocation')}>
                  <select
                    className={control}
                    value={form.godownId}
                    onChange={(event) =>
                      patch({
                        godownId: event.target.value,
                        foldingEntryIds: [],
                      })
                    }
                  >
                    <option value="">{t('weaving.salesPro.selectSource')}</option>

                    {kind === 'fabric' && (
                      <option value="__folding__">{t('weaving.salesPro.folding')}</option>
                    )}

                    {meta.godowns.map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </MiniField>
              )}

              {/* FABRIC GRADE */}
              {kind === 'fabric' && (
                <MiniField label={t('weaving.sales.grade')}>
                  <select
                    className={control}
                    value={form.fabricCategory}
                    onChange={(event) =>
                      patch({
                        fabricCategory: event.target.value,
                        foldingEntryIds: [],
                      })
                    }
                  >
                    <option value="normal">{t('weaving.sales.normal')}</option>

                    <option value="b">{t('weaving.salesPro.bGrade')}</option>
                  </select>
                </MiniField>
              )}

              {/* YARN QUANTITY */}
              {kind === 'yarn' && (
                <>
                  <MiniField label="Bags">
                    <NumberInput
                      placeholder="Enter Bags"
                      step="1"
                      value={form.packageQty}
                      onChange={(event) => patch({ packageQty: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="Small Cones">
                    <NumberInput
                      placeholder="Enter Small Cones"
                      value={form.smallCones}
                      onChange={(event) => patch({ smallCones: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="Large Cones">
                    <NumberInput
                      placeholder="Enter Large Cones"
                      value={form.largeCones}
                      onChange={(event) => patch({ largeCones: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="Sale LBS">
                    <input readOnly className={`${control} bg-slate-100 font-bold`} value={yarnPacking.lbs || ''} />
                  </MiniField>

                  <MiniField label="KG">
                    <input readOnly className={`${control} bg-slate-100`} value={yarnPacking.kg || ''} />
                  </MiniField>

                  <MiniField label="Rate / LBS">
                    <NumberInput
                      placeholder="Enter Rate / LBS"
                      value={form.finalRate}
                      onChange={(event) => patch({ finalRate: event.target.value })}
                    />
                  </MiniField>
                </>
              )}

              {/* FABRIC MANUAL QUANTITY */}
              {kind === 'fabric' && !exact && (
                <>
                  <MiniField label="Sale Meter">
                    <NumberInput
                      placeholder="Enter Sale Meter"
                      value={form.quantity}
                      onChange={(event) => patch({ quantity: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="KG">
                    <NumberInput
                      placeholder="Enter KG"
                      value={form.weightKg}
                      onChange={(event) => patch({ weightKg: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="Than Count">
                    <NumberInput
                      placeholder="Enter Than Count"
                      value={form.thanCount}
                      onChange={(event) => patch({ thanCount: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="Rate / Meter">
                    <NumberInput
                      placeholder="Enter Rate"
                      value={form.finalRate}
                      onChange={(event) => patch({ finalRate: event.target.value })}
                    />
                  </MiniField>
                </>
              )}

              {/* FABRIC THAN-WISE RATE */}
              {kind === 'fabric' && exact && (
                <MiniField label="Rate / Meter">
                  <NumberInput
                    placeholder="Enter Rate"
                    value={form.finalRate}
                    onChange={(event) => patch({ finalRate: event.target.value })}
                  />
                </MiniField>
              )}

              {/* QUICK OTHER SALE */}
              {kind === 'other' && !detailed && (
                <>
                  <SearchableCreatableSelect
                    label="Item / Description"
                    placeholder="Search or add item"
                    options={[
                      ...itemOptions,
                      ...(form.description &&
                      !itemOptions.some(
                        (item) => normalizeItemName(item.name) === normalizeItemName(form.description)
                      )
                        ? [{ _id: '__legacy_quick__', name: form.description, unit: 'KG' }]
                        : []),
                    ]}
                    value={
                      form.itemId ||
                      (form.description &&
                      !itemOptions.some(
                        (item) => normalizeItemName(item.name) === normalizeItemName(form.description)
                      )
                        ? '__legacy_quick__'
                        : itemOptions.find(
                            (item) =>
                              normalizeItemName(item.name) === normalizeItemName(form.description)
                          )?._id || '')
                    }
                    onChange={(itemId, item) =>
                      patch({ itemId, description: item?.name || '' })
                    }
                    onQuickAdd={(name) =>
                      quickAddSaleItem(name, 'KG', (item) =>
                        patch({ itemId: item._id, description: item.name })
                      )
                    }
                  />

                  <MiniField label="Total Amount">
                    <NumberInput
                      placeholder="Enter Total Amount"
                      value={form.amount}
                      onChange={(event) => patch({ amount: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="KG (Optional)">
                    <NumberInput
                      placeholder="Enter KG"
                      value={form.weightKg}
                      onChange={(event) => patch({ weightKg: event.target.value })}
                    />
                  </MiniField>

                  <MiniField label="Rate / KG">
                    <NumberInput
                      placeholder="Enter Rate / KG"
                      value={form.finalRate}
                      onChange={(event) => patch({ finalRate: event.target.value })}
                    />
                  </MiniField>
                </>
              )}

              {/* DIRECT DISCOUNT */}
              {!detailed && (
                ['fabric', 'yarn', 'other'].includes(kind) ? (
                  <MiniField label="Discount / Deduction">
                    <NumberInput
                      placeholder={kind === 'other' ? 'Enter Discount' : 'Enter Discount / Deduction'}
                      value={form.discountAmount}
                      onChange={(event) =>
                        patch({
                          discountAmount: event.target.value,
                        })
                      }
                    />
                  </MiniField>
                ) : (
                  <NumberInput
                    placeholder={t('weaving.salesPro.discount')}
                    value={form.discountAmount}
                    onChange={(event) =>
                      patch({
                        discountAmount: event.target.value,
                      })
                    }
                  />
                )
              )}

              {/* DIRECT CHARGES */}
              {!detailed && (
                ['fabric', 'yarn', 'other'].includes(kind) ? (
                  <MiniField label="Tax / Charges">
                    <NumberInput
                      placeholder="Enter Tax / Charges"
                      value={form.taxAmount}
                      onChange={(event) => patch({ taxAmount: event.target.value })}
                    />
                  </MiniField>
                ) : (
                  <NumberInput
                    placeholder={t('weaving.salesPro.tax')}
                    value={form.taxAmount}
                    onChange={(event) => patch({ taxAmount: event.target.value })}
                  />
                )
              )}
            </div>

            {/* SMALL STOCK INFORMATION */}
            {!exact && kind !== 'other' && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800">
                <span>
                  {t('weaving.sales.available')}:{' '}
                  <b>{kind === 'yarn' ? `${money(availableLbs)} LBS` : `${money(availableAmount)} M`}</b>
                </span>

                {kind === 'yarn' && <span className="font-normal">{money(availableAmount)} KG</span>}

                {kind === 'fabric' && (
                  <span className="font-normal text-slate-500">
                    {t('weaving.salesPro.manualHelp')}
                  </span>
                )}
              </div>
            )}

            {!current &&
              kind === 'fabric' &&
              form.entryMode === preferredEntryMode &&
              preferredEntryMode === 'manual' &&
              matchingThans.length > 0 && (
                <button
                  type="button"
                  className="mt-2 text-sm font-bold text-teal-700 underline"
                  onClick={() => {
                    const locations = [
                      ...new Set(
                        matchingThans.map(
                          (row) =>
                            String(row.godownId?._id || row.godownId || '') || '__folding__'
                        )
                      ),
                    ];

                    patch({
                      entryMode: 'than',
                      foldingEntryIds: [],
                      godownId: locations.length === 1 ? locations[0] : '',
                    });
                  }}
                >
                  Old Than Stock ({matchingThans.length})
                </button>
              )}

            {!current &&
              kind === 'fabric' &&
              form.entryMode === preferredEntryMode &&
              preferredEntryMode === 'than' &&
              matchingMeterStock.length > 0 && (
                <button
                  type="button"
                  className="mt-2 text-sm font-bold text-teal-700 underline"
                  onClick={() => {
                    const locations = [
                      ...new Set(
                        matchingMeterStock.map(
                          (row) => String(row.godownId || '') || '__folding__'
                        )
                      ),
                    ];

                    patch({
                      entryMode: 'manual',
                      foldingEntryIds: [],
                      godownId: locations.length === 1 ? locations[0] : '',
                      quantity: '',
                    });
                  }}
                >
                  Old Meter Stock
                </button>
              )}
          </section>

          {/* THAN SELECTION */}
          {exact && (
            <section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="text-sm font-bold text-slate-800">
                  {t('weaving.sales.availableThans')}
                </div>

                <button
                  type="button"
                  className="text-xs font-bold text-teal-700 hover:text-teal-900"
                  onClick={() =>
                    patch({
                      foldingEntryIds: available.map((row) => String(row._id)),
                    })
                  }
                >
                  {t('weaving.sales.selectAll')}
                </button>
              </div>

              <div className="grid max-h-48 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
                {available.map((row) => {
                  const checked = form.foldingEntryIds.includes(String(row._id));

                  return (
                    <label
                      key={row._id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition ${
                        checked
                          ? 'border-teal-300 bg-teal-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          patch({
                            foldingEntryIds: checked
                              ? form.foldingEntryIds.filter((value) => value !== String(row._id))
                              : [...form.foldingEntryIds, String(row._id)],
                          })
                        }
                      />

                      <div className="min-w-0">
                        <b className="block truncate text-sm">{row.thanNo}</b>

                        <span className="text-xs text-slate-500">
                          {money(row.meter)} M · {money(row.weightKg)} KG
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {!available.length && (
                <p className="py-6 text-center text-sm text-slate-500">
                  {t('weaving.sales.noRecords')}
                </p>
              )}

              <div className="border-t border-slate-200 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-800">
                {selected.length} {t('weaving.salesPro.thanCount')} · {money(meter)} M · {money(kg)}{' '}
                KG
              </div>
            </section>
          )}

          {/* DETAILED WASTE / OTHER */}
          {detailed && (
            <section className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="space-y-2">
                <div className="hidden grid-cols-12 gap-2 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
                  <span className="col-span-4">Item / Description</span>
                  <span className="col-span-2">Unit</span>
                  <span className="col-span-2">Quantity</span>
                  <span className="col-span-2">Rate</span>
                  <span className="col-span-2">Amount</span>
                </div>

                {form.rows.map((row, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-4">
                      <SearchableCreatableSelect
                          hideLabel
                        placeholder="Search or add item"
                        options={[
                          ...itemOptions,
                          ...(row.description &&
                          !itemOptions.some(
                            (item) => normalizeItemName(item.name) === normalizeItemName(row.description)
                          )
                            ? [{ _id: `__legacy_${index}`, name: row.description, unit: row.uom }]
                            : []),
                        ]}
                        value={
                          row.itemId ||
                          (row.description &&
                          !itemOptions.some(
                            (item) => normalizeItemName(item.name) === normalizeItemName(row.description)
                          )
                            ? `__legacy_${index}`
                            : itemOptions.find(
                                (item) =>
                                  normalizeItemName(item.name) === normalizeItemName(row.description)
                              )?._id || '')
                        }
                        onChange={(itemId, item) =>
                          patch({
                            rows: form.rows.map((value, rowIndex) =>
                              rowIndex === index
                                ? {
                                    ...value,
                                    itemId,
                                    description: item?.name || '',
                                    uom: safeSaleUom(item?.unit, value.uom),
                                  }
                                : value
                            ),
                          })
                        }
                        onQuickAdd={(name) =>
                          quickAddSaleItem(name, row.uom || 'KG', (item) =>
                            patch({
                              rows: form.rows.map((value, rowIndex) =>
                                rowIndex === index
                                  ? {
                                      ...value,
                                      itemId: item._id,
                                      description: item.name,
                                      uom: safeSaleUom(item.unit, value.uom),
                                    }
                                  : value
                              ),
                            })
                          )
                        }
                      />
                    </div>

                    <select
                      className={`${control} sm:col-span-2`}
                      value={row.uom}
                      onChange={(event) =>
                        patch({
                          rows: form.rows.map((item, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...item,
                                  uom: event.target.value,
                                }
                              : item
                          ),
                        })
                      }
                    >
                      {['KG', 'Meter', 'Piece', 'Nos', 'Job', 'Other'].map((uom) => (
                        <option key={uom}>{uom}</option>
                      ))}
                    </select>

                    <NumberInput
                      className="sm:col-span-2"
                      placeholder="Enter Qty"
                      aria-label="Quantity"
                      value={row.quantity}
                      onChange={(event) =>
                        patch({
                          rows: form.rows.map((item, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...item,
                                  quantity: event.target.value,
                                }
                              : item
                          ),
                        })
                      }
                    />

                    <NumberInput
                      className="sm:col-span-2"
                      placeholder="Enter Rate"
                      aria-label="Rate"
                      value={row.rate}
                      onChange={(event) =>
                        patch({
                          rows: form.rows.map((item, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...item,
                                  rate: event.target.value,
                                }
                              : item
                          ),
                        })
                      }
                    />

                    <div className="flex h-11 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 sm:col-span-2">
                      <b className="text-sm text-slate-800">
                        {money(Number(row.quantity || 0) * Number(row.rate || 0))}
                      </b>

                      {form.rows.length > 1 && (
                        <button
                          type="button"
                          aria-label={t('weaving.salesPro.removeRow')}
                          onClick={() =>
                            patch({
                              rows: form.rows.filter((_, rowIndex) => rowIndex !== index),
                            })
                          }
                          className="text-rose-600 hover:text-rose-800"
                        >
                          <FaTimes />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-50"
                  onClick={() =>
                    patch({
                      rows: [
                        ...form.rows,
                        {
                          itemId: '',
                          description: '',
                          uom: 'KG',
                          quantity: '',
                          rate: '',
                        },
                      ],
                    })
                  }
                >
                  + {t('weaving.salesPro.addRow')}
                </button>

                <NumberInput
                  className="max-w-[180px]"
                  placeholder={t('weaving.salesPro.discount')}
                  value={form.discountAmount}
                  onChange={(event) =>
                    patch({
                      discountAmount: event.target.value,
                    })
                  }
                />

                <NumberInput
                  className="max-w-[180px]"
                  placeholder={t('weaving.salesPro.tax')}
                  value={form.taxAmount}
                  onChange={(event) => patch({ taxAmount: event.target.value })}
                />

                <div className="ml-auto flex h-11 min-w-[190px] items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-teal-700">
                    Total Amount
                  </span>
                  <b className="text-base text-teal-950">Rs. {money(total)}</b>
                </div>
              </div>
            </section>
          )}

          {/* RATE CHANGE REASON */}
          {current &&
            kind !== 'other' &&
            Number(form.finalRate) !== Number(current.originalRate) && (
              <input
                className={`${control} mt-3`}
                placeholder={t('weaving.salesCleanup.rateReason')}
                aria-label={t('weaving.salesCleanup.rateReason')}
                value={form.rateOverrideReason || ''}
                onChange={(event) =>
                  patch({
                    rateOverrideReason: event.target.value,
                  })
                }
              />
            )}

          {['fabric', 'yarn'].includes(kind) ? (
            <details className="mt-3 rounded-xl border border-slate-200 bg-white">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-slate-700">
                Payment / Additional Details
              </summary>

              <div className="space-y-3 border-t border-slate-100 p-3">
                <WeavingSalePaymentSection
                  form={form}
                  onChange={patch}
                  total={total}
                  accounts={meta.paymentAccounts}
                  date={form.invoiceDate}
                />

                <MiniField label={t('weaving.sales.notes')}>
                  <input
                    className={control}
                    placeholder="Enter Notes"
                    aria-label={t('weaving.sales.notes')}
                    value={form.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                  />
                </MiniField>
              </div>
            </details>
          ) : (
            <div className={`mt-3 grid items-start gap-3 ${kind === 'other' ? 'lg:grid-cols-4' : ''}`}>
              <div className={kind === 'other' ? 'lg:col-span-3' : ''}>
                {kind === 'other' && (
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Received Amount / Payment Details
                  </span>
                )}
                <WeavingSalePaymentSection
                  form={form}
                  onChange={patch}
                  total={total}
                  accounts={meta.paymentAccounts}
                  date={form.invoiceDate}
                />
              </div>

              <MiniField label={t('weaving.sales.notes')}>
                <input
                  className={control}
                  placeholder="Enter Notes"
                  aria-label={t('weaving.sales.notes')}
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </MiniField>
            </div>
          )}

          {/* ERROR */}
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900"
            >
              {error}
            </p>
          )}
        </div>

        {/* STICKY ACTION FOOTER */}
        <footer className="flex flex-wrap shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3">
          <div className="text-sm text-slate-500">
            <span className="font-semibold">{t('weaving.salesPro.finalAmount')}:</span>{' '}
            <b className="text-base text-teal-800">Rs. {money(total)}</b>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clear}
              className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              {t(current ? 'weaving.salesCleanup.reset' : 'weaving.sales.clear')}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('weaving.sales.cancel')}
            </button>

            <WeavingSaleSaveOutput onSave={save} disabled={saving} />
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="h-10 rounded-lg bg-teal-700 px-6 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-40"
            >
              {t(
                saving
                  ? 'weaving.sales.saving'
                  : current
                    ? 'weaving.salesCleanup.save'
                    : 'weaving.salesPro.confirmSale'
              )}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
