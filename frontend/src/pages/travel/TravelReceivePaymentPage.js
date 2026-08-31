import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaHistory, FaSave, FaUsers } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  createTravelReceivePayment,
  fetchTravelCustomers,
  fetchTravelPaymentAccounts,
} from '../../services/travelMasterService';
import { getLocalDateInputValue, getLocalTimeInputValue } from '../../utils/localDateTime';
import {
  TravelActionButton,
  TravelCompactAutocomplete,
  TravelMasterPageFrame,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';

const createInitialForm = () => ({
  customerId: '',
  amount: '',
  accountId: '',
  paymentType: 'cash',
  date: getLocalDateInputValue(),
  time: getLocalTimeInputValue(),
  reference: '',
  notes: '',
});

const paymentTypeOptions = [
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

const getCustomerLabel = (customer) => customer?.name || '-';

const getCustomerMeta = (customer) =>
  [customer?.phone, formatTravelMoney(customer?.currentReceivable)].filter(Boolean).join(' | ');

const getAccountLabel = (account) => [account?.name, account?.code].filter(Boolean).join(' - ');

const SummaryBox = ({ labelKey, value, accent = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 shadow-sm">
    <p className="text-[11px] font-extrabold uppercase tracking-normal text-slate-400">
      {t(labelKey)}
    </p>

    <p className={`mt-1 text-base font-black ${accent}`}>{value}</p>
  </div>
);

const HeaderIconButton = ({ icon: Icon, title, variant = 'blue', onClick }) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    violet: 'from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-sm text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 sm:h-10 sm:w-10 sm:text-base ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon aria-hidden="true" />
    </button>
  );
};

const FieldLabel = ({ children }) => (
  <span className="mb-1 block text-xs font-extrabold text-slate-500">{children}</span>
);

const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const TravelReceivePaymentPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formState, setFormState] = useState(createInitialForm);
  const [customers, setCustomers] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const queryCustomerId = searchParams.get('customerId') || '';

  const selectedCustomer = useMemo(
    () =>
      customers.find((customer) => String(customer._id) === String(formState.customerId)) || null,
    [customers, formState.customerId]
  );

  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setFormError('');

      const [customerData, accountData] = await Promise.all([
        fetchTravelCustomers(
          {
            includeBalance: 'true',
          },
          {
            forceRefresh: true,
          }
        ),
        fetchTravelPaymentAccounts(),
      ]);

      const safeCustomers = Array.isArray(customerData) ? customerData : [];

      const safeAccounts = Array.isArray(accountData) ? accountData : [];

      setCustomers(safeCustomers);
      setPaymentAccounts(safeAccounts);

      setFormState((current) => ({
        ...current,
        accountId: current.accountId || safeAccounts[0]?._id || '',
      }));
    } catch (error) {
      console.error('Travel receive payment references failed:', error);

      setFormError(t('travel.payments.referencesFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    if (!queryCustomerId) {
      return;
    }

    setFormState((current) => ({
      ...current,
      customerId: queryCustomerId,
    }));
  }, [queryCustomerId]);

  const updateField = (field, value) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));

    setSuccessMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setFormError('');
      setSuccessMessage('');

      const saved = await createTravelReceivePayment(formState);

      setCustomers((current) =>
        current.map((customer) =>
          String(customer._id) === String(saved.customer?._id)
            ? {
                ...customer,
                balance: saved.balance,
                currentReceivable: saved.currentReceivable,
                customerCredit: saved.customerCredit,
              }
            : customer
        )
      );

      setFormState((current) => ({
        ...createInitialForm(),
        customerId: current.customerId,
        accountId: current.accountId,
        paymentType: current.paymentType,
      }));

      setSuccessMessage(t('travel.payments.receiveSuccess'));
    } catch (error) {
      console.error('Travel receive payment failed:', error);

      setFormError(error?.response?.data?.message || t('travel.payments.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.payments.receiveTitle"
      actions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <HeaderIconButton
            icon={FaHistory}
            title={t('travel.payments.receivedHistory.title')}
            variant="blue"
            onClick={() => navigate('/travel/payments/received')}
          />

          <HeaderIconButton
            icon={FaUsers}
            title={t('travel.sidebar.customers')}
            variant="violet"
            onClick={() => navigate('/travel/customers')}
          />
        </div>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

        <div className="space-y-4 p-4">
          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {formError}
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TravelCompactAutocomplete
              labelKey="travel.fields.customer"
              value={formState.customerId}
              onChange={(id) => updateField('customerId', id)}
              records={customers}
              getLabel={getCustomerLabel}
              getMeta={getCustomerMeta}
              placeholderKey="travel.payments.customerPlaceholder"
              emptyKey="travel.payments.emptyCustomers"
              disabled={loading}
            />

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.amount')}</FieldLabel>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formState.amount}
                onChange={(event) => updateField('amount', event.target.value)}
                required
                className={inputClass}
              />
            </label>

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.paymentType')}</FieldLabel>

              <select
                value={formState.paymentType}
                onChange={(event) => updateField('paymentType', event.target.value)}
                className={`${inputClass} font-bold`}
              >
                {paymentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.paymentAccount')}</FieldLabel>

              <select
                value={formState.accountId}
                onChange={(event) => updateField('accountId', event.target.value)}
                required
                className={`${inputClass} font-bold`}
              >
                <option value="">{t('travel.payments.accountPlaceholder')}</option>

                {paymentAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.date')}</FieldLabel>

              <input
                type="date"
                value={formState.date}
                onChange={(event) => updateField('date', event.target.value)}
                required
                className={inputClass}
              />
            </label>

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.time')}</FieldLabel>

              <input
                type="time"
                value={formState.time}
                onChange={(event) => updateField('time', event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="min-w-0">
              <FieldLabel>{t('travel.fields.reference')}</FieldLabel>

              <input
                type="text"
                value={formState.reference}
                onChange={(event) => updateField('reference', event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="min-w-0 md:col-span-2">
              <FieldLabel>{t('travel.fields.notes')}</FieldLabel>

              <textarea
                rows={3}
                value={formState.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          {selectedCustomer && (
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <SummaryBox
                labelKey="travel.fields.currentReceivable"
                value={formatTravelMoney(selectedCustomer.currentReceivable)}
                accent="text-amber-700"
              />

              <SummaryBox
                labelKey="travel.fields.customerCredit"
                value={formatTravelMoney(selectedCustomer.customerCredit)}
                accent="text-blue-700"
              />
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <TravelActionButton
              type="submit"
              icon={FaSave}
              disabled={saving || loading || !formState.customerId || !formState.accountId}
            >
              {saving ? t('travel.common.saving') : t('travel.payments.receiveAction')}
            </TravelActionButton>
          </div>
        </div>
      </form>
    </TravelMasterPageFrame>
  );
};

export default TravelReceivePaymentPage;
