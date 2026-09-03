import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaHistory, FaSave, FaUsers } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  createTravelReceivePayment,
  fetchTravelCustomers,
  fetchTravelParties,
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
  customerType: 'customer',
  customerId: '',
  customerPartyId: '',
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

const getRecordId = (record) => (typeof record === 'object' ? record?._id : record) || '';

const buildCounterpartyOption = (record, type) => {
  const sourceId = getRecordId(record);

  return {
    ...record,
    _id: sourceId ? `${type}:${sourceId}` : '',
    sourceId,
    counterpartyType: type,
    entityType: type,
  };
};

const getCustomerCounterpartyValue = (formState) =>
  formState.customerType === 'party' && getRecordId(formState.customerPartyId)
    ? `party:${getRecordId(formState.customerPartyId)}`
    : getRecordId(formState.customerId)
      ? `customer:${getRecordId(formState.customerId)}`
      : '';

const getCounterpartySelection = (value, record, fallbackType = 'customer') => {
  if (record?.counterpartyType) {
    return {
      type: record.counterpartyType,
      id: record.sourceId || getRecordId(record),
    };
  }

  if (typeof value === 'string' && value.includes(':')) {
    const [type, id] = value.split(':');

    return {
      type: type || fallbackType,
      id: id || '',
    };
  }

  return {
    type: fallbackType,
    id: value || '',
  };
};

const getCustomerReceivable = (customer) => {
  if (customer?.counterpartyType === 'party' || customer?.entityType === 'party') {
    return Math.max(Number(customer?.balance || 0), 0);
  }

  return Number(customer?.currentReceivable || 0);
};

const getCustomerCredit = (customer) => {
  if (customer?.counterpartyType === 'party' || customer?.entityType === 'party') {
    return Math.max(-Number(customer?.balance || 0), 0);
  }

  return Number(customer?.customerCredit || 0);
};

const getCustomerMeta = (customer) =>
  [
    customer?.counterpartyType === 'party' ? t('travel.counterparty.party') : '',
    customer?.phone,
    formatTravelMoney(getCustomerReceivable(customer)),
  ]
    .filter(Boolean)
    .join(' | ');

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
  const [parties, setParties] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const queryCustomerId = searchParams.get('customerId') || '';
  const queryCustomerType = searchParams.get('customerType') === 'party' ? 'party' : 'customer';
  const queryCustomerPartyId = searchParams.get('customerPartyId') || '';

  const customerOptions = useMemo(
    () => [
      ...customers.map((customer) => buildCounterpartyOption(customer, 'customer')),
      ...parties.map((party) => buildCounterpartyOption(party, 'party')),
    ],
    [customers, parties]
  );

  const selectedCustomer = useMemo(
    () =>
      customerOptions.find(
        (customer) => String(customer._id) === String(getCustomerCounterpartyValue(formState))
      ) || null,
    [customerOptions, formState]
  );

  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setFormError('');

      const [customerData, partyData, accountData] = await Promise.all([
        fetchTravelCustomers(
          {
            includeBalance: 'true',
          },
          {
            forceRefresh: true,
          }
        ),
        fetchTravelParties(
          {
            status: 'active',
            eligibleRole: 'customer',
            includeBalance: 'true',
          },
          {
            forceRefresh: true,
          }
        ),
        fetchTravelPaymentAccounts(),
      ]);

      const safeCustomers = Array.isArray(customerData) ? customerData : [];
      const safeParties = Array.isArray(partyData) ? partyData : [];

      const safeAccounts = Array.isArray(accountData) ? accountData : [];

      setCustomers(safeCustomers);
      setParties(safeParties);
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
    if (!queryCustomerId && !queryCustomerPartyId) {
      return;
    }

    setFormState((current) => ({
      ...current,
      customerType: queryCustomerType,
      customerId: queryCustomerType === 'party' ? '' : queryCustomerId,
      customerPartyId: queryCustomerType === 'party' ? queryCustomerPartyId || queryCustomerId : '',
    }));
  }, [queryCustomerId, queryCustomerPartyId, queryCustomerType]);

  const updateCustomerCounterparty = (value, record) => {
    const selection = getCounterpartySelection(value, record, 'customer');

    setFormState((current) => ({
      ...current,
      customerType: selection.type === 'party' ? 'party' : 'customer',
      customerId: selection.type === 'party' ? '' : selection.id,
      customerPartyId: selection.type === 'party' ? selection.id : '',
    }));

    setSuccessMessage('');
  };

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

      const savedCustomerId = getRecordId(saved.customer);
      const isSavedParty =
        saved.customer?.counterpartyType === 'party' || saved.customer?.entityType === 'party';

      if (isSavedParty) {
        setParties((current) =>
          current.map((party) =>
            String(party._id) === String(savedCustomerId)
              ? {
                  ...party,
                  balance: saved.balance,
                  currentReceivable: saved.currentReceivable,
                  customerCredit: saved.customerCredit,
                }
              : party
          )
        );
      } else {
        setCustomers((current) =>
          current.map((customer) =>
            String(customer._id) === String(savedCustomerId)
              ? {
                  ...customer,
                  balance: saved.balance,
                  currentReceivable: saved.currentReceivable,
                  customerCredit: saved.customerCredit,
                }
              : customer
          )
        );
      }

      setFormState((current) => ({
        ...createInitialForm(),
        customerType: current.customerType,
        customerId: current.customerId,
        customerPartyId: current.customerPartyId,
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
              value={getCustomerCounterpartyValue(formState)}
              onChange={updateCustomerCounterparty}
              records={customerOptions}
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
                value={formatTravelMoney(getCustomerReceivable(selectedCustomer))}
                accent="text-amber-700"
              />

              <SummaryBox
                labelKey="travel.fields.customerCredit"
                value={formatTravelMoney(getCustomerCredit(selectedCustomer))}
                accent="text-blue-700"
              />
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <TravelActionButton
              type="submit"
              icon={FaSave}
              disabled={
                saving ||
                loading ||
                (!formState.customerId && !formState.customerPartyId) ||
                !formState.accountId
              }
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
