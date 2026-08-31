import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaPaperclip, FaSave, FaTimes } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  createTravelRefund,
  fetchTravelPaymentAccounts,
  fetchTravelRefundableInvoices,
  fetchTravelVendors,
} from '../../services/travelMasterService';
import { getLocalDateInputValue, getLocalTimeInputValue } from '../../utils/localDateTime';
import {
  TravelActionButton,
  TravelCompactAutocomplete,
  TravelMasterPageFrame,
} from '../../components/travel/master/TravelMasterUI';
import {
  formatBookingMoney,
  getCustomerName,
} from '../../components/travel/bookings/travelBookingConfig';
import { compactPayload } from '../../components/travel/bookings/form/bookingFormUtils';
import { DEFAULT_TRAVEL_CURRENCY } from '../../config/travelConfig';

const MAX_ATTACHMENTS = 3;

const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-500';

const createInitialRefundForm = () => ({
  originalInvoiceId: '',
  refundDate: getLocalDateInputValue(),
  refundTime: getLocalTimeInputValue(),
  refundMode: 'partial',
  grossRefundAmount: '',
  penaltyAmount: '',
  paidBackAmount: '',
  paymentType: 'cash',
  accountId: '',
  notes: '',
  attachments: [],
  refundItems: [],
});

const numberValue = (value) => {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
};

const getRecordId = (record) => (typeof record === 'object' ? record?._id : record);

const getInvoiceNumber = (invoice) => invoice?.invoiceNumber || invoice?.bookingNumber || '-';

const getInvoiceLabel = (invoice) =>
  [getInvoiceNumber(invoice), getCustomerName(invoice?.customerId)].filter(Boolean).join(' | ');

const getInvoiceMeta = (invoice) =>
  `${t('travel.refund.fields.remainingRefundable')}: ${formatBookingMoney(
    invoice?.remainingRefundable,
    invoice?.baseCurrency || DEFAULT_TRAVEL_CURRENCY
  )}`;

const getVendorLabel = (vendor) => vendor?.name || '-';

const getItemLabel = (item) =>
  item.title || item.description || t(`travel.booking.itemTypes.${item.itemType || 'service'}`);

const getProratedItemAmount = (item, invoice) => {
  const grossSale = numberValue(invoice?.sellingTotal);
  const netSale = numberValue(invoice?.netSale || invoice?.sellingTotal);
  const ratio = grossSale > 0 ? netSale / grossSale : 1;

  return Number((numberValue(item?.estimatedSellingBase || item?.sellingPrice) * ratio).toFixed(2));
};

const getItemCostAmount = (item) => {
  const useComponents =
    item?.itemType === 'umrah_package' &&
    item?.umrahDetails?.packageMode === 'custom_component_package' &&
    item?.umrahDetails?.components?.length > 0;

  if (useComponents) {
    return Number(
      item.umrahDetails.components
        .reduce((sum, component) => sum + numberValue(component.estimatedCostBase), 0)
        .toFixed(2)
    );
  }

  return numberValue(item?.estimatedCostBase || item?.costPrice);
};

const buildRefundItems = (invoice) =>
  (invoice?.bookingItems || []).map((item) => ({
    bookingItemId: item._id,
    title: getItemLabel(item),
    itemType: item.itemType || 'service',
    originalAmount: getProratedItemAmount(item, invoice),
    costAmount: getItemCostAmount(item),
    selected: false,
    refundAmount: '',
    vendorId: getRecordId(item.vendorId) || '',
    vendorRecoveryAmount: '',
  }));

const FieldLabel = ({ children }) => (
  <span className="mb-1 block text-xs font-extrabold text-slate-500">{children}</span>
);

const MoneyField = ({ labelKey, value, onChange, disabled = false }) => (
  <label className="min-w-0">
    <FieldLabel>{t(labelKey)}</FieldLabel>

    <input
      type="number"
      min="0"
      step="0.01"
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  </label>
);

const SummaryBox = ({ labelKey, value, accent = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3 py-2.5 shadow-sm">
    <p className="text-[10px] font-extrabold uppercase tracking-normal text-slate-400">
      {t(labelKey)}
    </p>

    <p className={`mt-1 truncate text-sm font-black ${accent}`}>{value}</p>
  </div>
);

const HeaderIconButton = ({ icon: Icon, title, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-sm text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300 sm:h-10 sm:w-10 sm:text-base"
  >
    <Icon aria-hidden="true" />
  </button>
);

const ClearIconButton = ({ title, disabled, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 sm:text-base"
  >
    <FaTimes aria-hidden="true" />
  </button>
);

const TravelRefundFormPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formState, setFormState] = useState(createInitialRefundForm);
  const [invoices, setInvoices] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const selectedInvoice = useMemo(
    () =>
      invoices.find((invoice) => String(invoice._id) === String(formState.originalInvoiceId)) ||
      null,
    [formState.originalInvoiceId, invoices]
  );

  const computed = useMemo(() => {
    let grossRefundAmount = 0;

    if (formState.refundMode === 'full') {
      grossRefundAmount = numberValue(selectedInvoice?.remainingRefundable);
    } else if (formState.refundMode === 'items') {
      grossRefundAmount = formState.refundItems
        .filter((item) => item.selected)
        .reduce((sum, item) => sum + numberValue(item.refundAmount), 0);
    } else {
      grossRefundAmount = numberValue(formState.grossRefundAmount);
    }

    const penaltyAmount = numberValue(formState.penaltyAmount);

    const customerRefundAmount = Math.max(grossRefundAmount - penaltyAmount, 0);

    const vendorRecoveryAmount =
      formState.refundMode === 'items'
        ? formState.refundItems
            .filter((item) => item.selected)
            .reduce((sum, item) => sum + numberValue(item.vendorRecoveryAmount), 0)
        : 0;

    const paidBackAmount = numberValue(formState.paidBackAmount);

    return {
      grossRefundAmount,
      penaltyAmount,
      customerRefundAmount,
      vendorRecoveryAmount,
      paidBackAmount,
    };
  }, [
    formState.grossRefundAmount,
    formState.paidBackAmount,
    formState.penaltyAmount,
    formState.refundItems,
    formState.refundMode,
    selectedInvoice,
  ]);

  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setFormError('');

      const [invoiceData, accountData, vendorData] = await Promise.all([
        fetchTravelRefundableInvoices(),
        fetchTravelPaymentAccounts(),
        fetchTravelVendors(),
      ]);

      setInvoices(Array.isArray(invoiceData) ? invoiceData : []);

      setPaymentAccounts(Array.isArray(accountData) ? accountData : []);

      setVendors(Array.isArray(vendorData) ? vendorData : []);
    } catch (error) {
      console.error('Travel refund references failed:', error);

      setFormError(t('travel.refund.alerts.referencesFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  const updateRoot = useCallback((field, value) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const selectInvoice = useCallback((_, invoice) => {
    setFormState((current) => ({
      ...current,
      originalInvoiceId: invoice?._id || '',
      refundItems: buildRefundItems(invoice),
    }));
  }, []);

  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId');

    if (!invoiceId || formState.originalInvoiceId || invoices.length === 0) {
      return;
    }

    const invoice = invoices.find((row) => String(row._id) === String(invoiceId));

    if (invoice) {
      selectInvoice(invoice._id, invoice);
    }
  }, [formState.originalInvoiceId, invoices, searchParams, selectInvoice]);

  const updateRefundItem = useCallback((index, field, value) => {
    setFormState((current) => {
      const refundItems = [...current.refundItems];
      const row = refundItems[index];

      if (!row) {
        return current;
      }

      refundItems[index] = {
        ...row,
        [field]: value,
      };

      return {
        ...current,
        refundItems,
      };
    });
  }, []);

  const toggleRefundItem = useCallback((index) => {
    setFormState((current) => {
      const refundItems = [...current.refundItems];
      const row = refundItems[index];

      if (!row) {
        return current;
      }

      const selected = !row.selected;

      refundItems[index] = {
        ...row,
        selected,
        refundAmount: selected && !row.refundAmount ? row.originalAmount : row.refundAmount,
      };

      return {
        ...current,
        refundItems,
      };
    });
  }, []);

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
      attachments: (current.attachments || []).filter(
        (_, attachmentIndex) => attachmentIndex !== index
      ),
    }));
  }, []);

  const buildPayload = useCallback(() => {
    const payload = {
      originalInvoiceId: formState.originalInvoiceId,
      refundDate: formState.refundDate,
      refundTime: formState.refundTime,
      refundMode: formState.refundMode,
      grossRefundAmount:
        formState.refundMode === 'full'
          ? selectedInvoice?.remainingRefundable || ''
          : formState.grossRefundAmount,
      penaltyAmount: formState.penaltyAmount,
      paidBackAmount: formState.paidBackAmount,
      paymentType: formState.paymentType,
      accountId: formState.accountId,
      notes: formState.notes,
      refundItems:
        formState.refundMode === 'items'
          ? formState.refundItems
              .filter((item) => item.selected)
              .map((item) => ({
                bookingItemId: item.bookingItemId,
                title: item.title,
                refundAmount: item.refundAmount,
                vendorId: item.vendorId,
                vendorRecoveryAmount: item.vendorRecoveryAmount,
              }))
          : [],
    };

    const compact = compactPayload(payload);

    if (formState.attachments?.length) {
      compact.attachments = formState.attachments;
    }

    return compact;
  }, [formState, selectedInvoice]);

  const submitRefund = useCallback(async () => {
    if (!formState.originalInvoiceId) {
      setFormError(t('travel.refund.alerts.selectInvoice'));
      return;
    }

    if (computed.grossRefundAmount <= 0) {
      setFormError(t('travel.refund.alerts.refundAmountRequired'));
      return;
    }

    if (computed.penaltyAmount > computed.grossRefundAmount) {
      setFormError(t('travel.refund.alerts.penaltyTooHigh'));
      return;
    }

    if (computed.paidBackAmount > 0 && !formState.accountId) {
      setFormError(t('travel.refund.alerts.paymentAccountRequired'));
      return;
    }

    try {
      setSaving(true);
      setFormError('');

      const saved = await createTravelRefund(buildPayload());

      navigate(`/travel/refunds/${saved._id}`);
    } catch (error) {
      console.error('Travel refund save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.refund.alerts.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [
    buildPayload,
    computed.grossRefundAmount,
    computed.paidBackAmount,
    computed.penaltyAmount,
    formState.accountId,
    formState.originalInvoiceId,
    navigate,
  ]);

  const handleClear = useCallback(() => {
    setFormState(createInitialRefundForm());
    setFormError('');
  }, []);

  const baseCurrency = selectedInvoice?.baseCurrency || DEFAULT_TRAVEL_CURRENCY;

  const showPaymentAccount = computed.paidBackAmount > 0;

  const remainingAfterRefund = Math.max(
    numberValue(selectedInvoice?.remainingRefundable) - computed.grossRefundAmount,
    0
  );

  return (
    <TravelMasterPageFrame
      titleKey="travel.refund.form.title"
      actions={
        <HeaderIconButton
          icon={FaArrowLeft}
          title={t('travel.refund.actions.backToList')}
          onClick={() => navigate('/travel/refunds')}
        />
      }
    >
      {formError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {formError}
        </div>
      )}

      {loading && (
        <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-700">
          {t('travel.common.loading')}
        </div>
      )}

      <div className="space-y-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

          <div className="grid grid-cols-1 gap-3 p-3 sm:p-4 lg:grid-cols-[170px_135px_minmax(260px,1fr)_170px]">
            <label className="min-w-0">
              <FieldLabel>{t('travel.refund.fields.refundDate')}</FieldLabel>

              <input
                type="date"
                value={formState.refundDate}
                onChange={(event) => updateRoot('refundDate', event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.time')}</FieldLabel>

              <input
                type="time"
                value={formState.refundTime}
                onChange={(event) => updateRoot('refundTime', event.target.value)}
                className={inputClass}
              />
            </label>

            <TravelCompactAutocomplete
              labelKey="travel.refund.fields.originalInvoice"
              value={formState.originalInvoiceId}
              records={invoices}
              getLabel={getInvoiceLabel}
              getMeta={getInvoiceMeta}
              placeholderKey="travel.refund.placeholders.invoiceSearch"
              emptyKey="travel.refund.empty.invoices"
              onChange={selectInvoice}
            />

            <label className="min-w-0">
              <FieldLabel>{t('travel.refund.fields.refundMode')}</FieldLabel>

              <select
                value={formState.refundMode}
                onChange={(event) => updateRoot('refundMode', event.target.value)}
                className={`${inputClass} font-bold`}
              >
                <option value="partial">{t('travel.refund.modes.partial')}</option>

                <option value="full">{t('travel.refund.modes.full')}</option>

                <option value="items">{t('travel.refund.modes.items')}</option>
              </select>
            </label>
          </div>
        </section>

        {selectedInvoice && (
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <SummaryBox
              labelKey="travel.refund.fields.originalInvoice"
              value={getInvoiceNumber(selectedInvoice)}
            />

            <SummaryBox
              labelKey="travel.booking.fields.customer"
              value={getCustomerName(selectedInvoice.customerId)}
            />

            <SummaryBox
              labelKey="travel.refund.fields.invoiceNet"
              value={formatBookingMoney(selectedInvoice.netSale, baseCurrency)}
            />

            <SummaryBox
              labelKey="travel.refund.fields.remainingRefundable"
              value={formatBookingMoney(selectedInvoice.remainingRefundable, baseCurrency)}
              accent="text-cyan-700"
            />
          </section>
        )}

        {selectedInvoice && formState.refundMode === 'items' && (
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 className="mb-3 text-sm font-black text-slate-900">
              {t('travel.refund.sections.items')}
            </h2>

            <div className="space-y-2">
              {formState.refundItems.map((item, index) => (
                <div
                  key={item.bookingItemId || index}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 lg:grid-cols-[40px_minmax(180px,1.4fr)_140px_140px_minmax(140px,1fr)_140px]"
                >
                  <label className="flex items-center lg:pt-6">
                    <input
                      type="checkbox"
                      checked={Boolean(item.selected)}
                      onChange={() => toggleRefundItem(index)}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                    />
                  </label>

                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase text-slate-400">
                      {t(`travel.booking.itemTypes.${item.itemType}`)}
                    </p>

                    <p className="truncate text-sm font-black text-slate-900">{item.title}</p>

                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {formatBookingMoney(item.originalAmount, baseCurrency)}
                    </p>
                  </div>

                  <MoneyField
                    labelKey="travel.refund.fields.refundAmount"
                    value={item.refundAmount}
                    disabled={!item.selected}
                    onChange={(value) => updateRefundItem(index, 'refundAmount', value)}
                  />

                  <MoneyField
                    labelKey="travel.refund.fields.vendorRecoveryAmount"
                    value={item.vendorRecoveryAmount}
                    disabled={!item.selected}
                    onChange={(value) => updateRefundItem(index, 'vendorRecoveryAmount', value)}
                  />

                  <label className="min-w-0">
                    <FieldLabel>{t('travel.booking.fields.vendor')}</FieldLabel>

                    <select
                      value={item.vendorId || ''}
                      disabled={!item.selected}
                      onChange={(event) => updateRefundItem(index, 'vendorId', event.target.value)}
                      className={`${inputClass} font-bold`}
                    >
                      <option value="">{t('travel.common.noneSelected')}</option>

                      {vendors.map((vendor) => (
                        <option key={vendor._id} value={vendor._id}>
                          {getVendorLabel(vendor)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SummaryBox
                    labelKey="travel.refund.fields.itemCost"
                    value={formatBookingMoney(item.costAmount, baseCurrency)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {formState.refundMode === 'partial' && (
                <MoneyField
                  labelKey="travel.refund.fields.grossRefundAmount"
                  value={formState.grossRefundAmount}
                  onChange={(value) => updateRoot('grossRefundAmount', value)}
                />
              )}

              <MoneyField
                labelKey="travel.refund.fields.penaltyAmount"
                value={formState.penaltyAmount}
                onChange={(value) => updateRoot('penaltyAmount', value)}
              />

              <MoneyField
                labelKey="travel.refund.fields.paidBackAmount"
                value={formState.paidBackAmount}
                onChange={(value) => updateRoot('paidBackAmount', value)}
              />

              <label className="min-w-0">
                <FieldLabel>{t('travel.booking.fields.paymentType')}</FieldLabel>

                <select
                  value={formState.paymentType || 'cash'}
                  disabled={!showPaymentAccount}
                  onChange={(event) => updateRoot('paymentType', event.target.value)}
                  className={`${inputClass} font-bold`}
                >
                  <option value="cash">{t('payment.cash')}</option>

                  <option value="online">{t('payment.online')}</option>

                  <option value="cheque">{t('payment.cheque')}</option>
                </select>
              </label>

              <label className="min-w-0 sm:col-span-2">
                <FieldLabel>{t('travel.booking.fields.paymentAccount')}</FieldLabel>

                <select
                  value={formState.accountId || ''}
                  disabled={!showPaymentAccount}
                  onChange={(event) => updateRoot('accountId', event.target.value)}
                  className={`${inputClass} font-bold`}
                >
                  <option value="">{t('travel.booking.placeholders.paymentAccount')}</option>

                  {paymentAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {[account.name, account.code].filter(Boolean).join(' - ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SummaryBox
                labelKey="travel.refund.fields.grossRefundAmount"
                value={formatBookingMoney(computed.grossRefundAmount, baseCurrency)}
              />

              <SummaryBox
                labelKey="travel.refund.fields.penaltyAmount"
                value={formatBookingMoney(computed.penaltyAmount, baseCurrency)}
                accent="text-amber-700"
              />

              <SummaryBox
                labelKey="travel.refund.fields.customerRefundAmount"
                value={formatBookingMoney(computed.customerRefundAmount, baseCurrency)}
                accent="text-cyan-700"
              />

              <SummaryBox
                labelKey="travel.refund.fields.vendorRecoveryAmount"
                value={formatBookingMoney(computed.vendorRecoveryAmount, baseCurrency)}
                accent="text-emerald-700"
              />

              <SummaryBox
                labelKey="travel.refund.fields.paidBackAmount"
                value={formatBookingMoney(computed.paidBackAmount, baseCurrency)}
                accent="text-rose-700"
              />

              <SummaryBox
                labelKey="travel.refund.fields.remainingAfterRefund"
                value={formatBookingMoney(remainingAfterRefund, baseCurrency)}
                accent="text-violet-700"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <label className="block">
              <FieldLabel>{t('travel.fields.notes')}</FieldLabel>

              <textarea
                value={formState.notes || ''}
                onChange={(event) => updateRoot('notes', event.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-slate-600">
                  {t('travel.booking.fields.attachments')}
                </p>

                <label
                  title={t('travel.booking.actions.attachFiles')}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-xs text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:h-9 sm:w-9 sm:text-sm"
                >
                  <FaPaperclip aria-hidden="true" />

                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    disabled={formState.attachments.length >= MAX_ATTACHMENTS}
                    onChange={handleAttachmentChange}
                  />
                </label>
              </div>

              <div className="space-y-2">
                {formState.attachments.map((attachment, index) => (
                  <div
                    key={`${attachment.name}-${index}`}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-xs font-bold text-slate-700">
                      {attachment.name}
                    </span>

                    <button
                      type="button"
                      title={t('travel.booking.actions.removeAttachment')}
                      aria-label={t('travel.booking.actions.removeAttachment')}
                      onClick={() => removeAttachment(index)}
                      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                    >
                      <FaTimes aria-hidden="true" />
                    </button>
                  </div>
                ))}

                {formState.attachments.length === 0 && (
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-500">
                    {t('travel.booking.empty.attachments')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="sticky bottom-0 z-20 flex items-center justify-end gap-1.5 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-6px_18px_rgba(15,23,42,0.08)] backdrop-blur sm:gap-2">
          <ClearIconButton
            title={t('travel.refund.actions.clear')}
            disabled={saving}
            onClick={handleClear}
          />

          <TravelActionButton
            icon={FaSave}
            variant="success"
            onClick={submitRefund}
            disabled={saving || loading}
          >
            {saving ? t('travel.common.saving') : t('travel.refund.actions.create')}
          </TravelActionButton>
        </section>
      </div>
    </TravelMasterPageFrame>
  );
};

export default TravelRefundFormPage;
