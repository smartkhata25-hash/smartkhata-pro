import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaHistory, FaMoneyBillWave, FaSave, FaUserTie } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  createTravelVendorPayment,
  fetchTravelPaymentAccounts,
  fetchTravelVendors,
} from '../../services/travelMasterService';
import { getLocalDateInputValue, getLocalTimeInputValue } from '../../utils/localDateTime';
import {
  TravelActionButton,
  TravelCompactAutocomplete,
  TravelMasterPageFrame,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';

const createInitialForm = () => ({
  vendorId: '',
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
    value: 'bank',
    labelKey: 'travel.payments.paymentTypes.bank',
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

const getVendorBalance = (vendor) => {
  const payable = Number(vendor?.currentPayable || 0);
  const credit = Number(vendor?.vendorCredit || 0);

  return payable - credit;
};

const getVendorLabel = (vendor) => vendor?.name || '-';

const getVendorMeta = (vendor) => {
  const balance = getVendorBalance(vendor);

  return [vendor?.phone, `${t('travel.fields.balance')}: ${formatTravelMoney(balance)}`]
    .filter(Boolean)
    .join(' | ');
};

const getAccountLabel = (account) => [account?.name, account?.code].filter(Boolean).join(' - ');

const getMatchingAccountCategories = (paymentType) => {
  if (paymentType === 'cash') {
    return ['cash'];
  }

  if (paymentType === 'bank') {
    return ['bank'];
  }

  if (paymentType === 'online') {
    return ['online'];
  }

  if (paymentType === 'cheque') {
    return ['cheque'];
  }

  return [];
};

const BalanceBox = ({ balance }) => {
  const numericBalance = Number(balance || 0);

  let accentClass = 'text-emerald-700';
  let surfaceClass = 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50';

  if (numericBalance > 0) {
    accentClass = 'text-rose-700';
    surfaceClass = 'border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50';
  } else if (numericBalance < 0) {
    accentClass = 'text-blue-700';
    surfaceClass = 'border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50';
  }

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${surfaceClass}`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
          <FaMoneyBillWave aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
            {t('travel.fields.balance')}
          </p>

          <p className={`mt-0.5 truncate text-lg font-black ${accentClass}`}>
            {formatTravelMoney(numericBalance)}
          </p>
        </div>
      </div>
    </div>
  );
};

const TravelVendorPaymentPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formState, setFormState] = useState(createInitialForm);
  const [vendors, setVendors] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const queryVendorId = searchParams.get('vendorId') || '';

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => String(vendor._id) === String(formState.vendorId)) || null,
    [formState.vendorId, vendors]
  );

  const selectedVendorBalance = useMemo(() => getVendorBalance(selectedVendor), [selectedVendor]);

  const filteredPaymentAccounts = useMemo(() => {
    const allowedCategories = getMatchingAccountCategories(formState.paymentType);

    if (allowedCategories.length === 0) {
      return paymentAccounts;
    }

    return paymentAccounts.filter((account) =>
      allowedCategories.includes(String(account?.category || '').toLowerCase())
    );
  }, [formState.paymentType, paymentAccounts]);

  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setFormError('');

      const [vendorData, accountData] = await Promise.all([
        fetchTravelVendors(
          {
            includeBalance: 'true',
          },
          {
            forceRefresh: true,
          }
        ),
        fetchTravelPaymentAccounts(),
      ]);

      const safeVendors = Array.isArray(vendorData) ? vendorData : [];
      const safeAccounts = Array.isArray(accountData) ? accountData : [];

      setVendors(safeVendors);
      setPaymentAccounts(safeAccounts);

      const firstCashAccount = safeAccounts.find(
        (account) => String(account?.category || '').toLowerCase() === 'cash'
      );

      setFormState((current) => ({
        ...current,
        accountId: current.accountId || firstCashAccount?._id || safeAccounts[0]?._id || '',
      }));
    } catch (error) {
      console.error('Travel vendor payment references failed:', error);

      setFormError(t('travel.payments.referencesFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    if (!queryVendorId) {
      return;
    }

    setFormState((current) => ({
      ...current,
      vendorId: queryVendorId,
    }));
  }, [queryVendorId]);

  const updateField = useCallback((field, value) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));

    setFormError('');
    setSuccessMessage('');
  }, []);

  const handlePaymentTypeChange = useCallback(
    (paymentType) => {
      const allowedCategories = getMatchingAccountCategories(paymentType);

      const matchingAccount = paymentAccounts.find((account) =>
        allowedCategories.includes(String(account?.category || '').toLowerCase())
      );

      setFormState((current) => ({
        ...current,
        paymentType,
        accountId: matchingAccount?._id || '',
      }));

      setFormError('');
      setSuccessMessage('');
    },
    [paymentAccounts]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    const numericAmount = Number(formState.amount || 0);

    if (!formState.vendorId) {
      setFormError(t('travel.payments.vendorPlaceholder'));
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError(t('travel.fields.amountPaid'));
      return;
    }

    if (!formState.accountId) {
      setFormError(t('travel.payments.accountPlaceholder'));
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      setSuccessMessage('');

      const saved = await createTravelVendorPayment({
        ...formState,
        amount: numericAmount,
      });

      setVendors((current) =>
        current.map((vendor) => {
          if (String(vendor._id) !== String(saved?.vendor?._id)) {
            return vendor;
          }

          return {
            ...vendor,
            balance: saved?.balance,
            currentPayable: saved?.currentPayable,
            vendorCredit: saved?.vendorCredit,
          };
        })
      );

      setFormState((current) => ({
        ...createInitialForm(),
        vendorId: current.vendorId,
        accountId: current.accountId,
        paymentType: current.paymentType,
      }));

      setSuccessMessage(t('travel.payments.vendorSuccess'));
    } catch (error) {
      console.error('Travel vendor payment failed:', error);

      setFormError(error?.response?.data?.message || t('travel.payments.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.payments.vendorTitle"
      actions={
        <>
          <TravelActionButton
            icon={FaHistory}
            variant="secondary"
            onClick={() => navigate('/travel/payments/vendors')}
            title={t('travel.payments.vendorHistory.title')}
          />

          <TravelActionButton
            icon={FaUserTie}
            variant="secondary"
            onClick={() => navigate('/travel/vendors')}
            title={t('travel.sidebar.vendors')}
          />
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

        <div className="space-y-4 p-4 md:p-5">
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
              labelKey="travel.fields.vendor"
              value={formState.vendorId}
              onChange={(id) => updateField('vendorId', id)}
              records={vendors}
              getLabel={getVendorLabel}
              getMeta={getVendorMeta}
              placeholderKey="travel.payments.vendorPlaceholder"
              emptyKey="travel.payments.emptyVendors"
              disabled={loading || saving}
            />

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.amountPaid')}
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formState.amount}
                onChange={(event) => updateField('amount', event.target.value)}
                required
                disabled={saving}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.paymentType')}
              </span>

              <select
                value={formState.paymentType}
                onChange={(event) => handlePaymentTypeChange(event.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              >
                {paymentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.paymentAccount')}
              </span>

              <select
                value={formState.accountId}
                onChange={(event) => updateField('accountId', event.target.value)}
                required
                disabled={loading || saving}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              >
                <option value="">{t('travel.payments.accountPlaceholder')}</option>

                {filteredPaymentAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.date')}
              </span>

              <input
                type="date"
                value={formState.date}
                onChange={(event) => updateField('date', event.target.value)}
                required
                disabled={saving}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.time')}
              </span>

              <input
                type="time"
                value={formState.time}
                onChange={(event) => updateField('time', event.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.reference')}
              </span>

              <input
                type="text"
                value={formState.reference}
                onChange={(event) => updateField('reference', event.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </label>

            <label className="min-w-0 md:col-span-2">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('travel.fields.notes')}
              </span>

              <textarea
                rows={3}
                value={formState.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                disabled={saving}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </label>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <BalanceBox balance={selectedVendorBalance} />
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <TravelActionButton type="submit" icon={FaSave} disabled={saving || loading}>
              {saving ? t('travel.common.saving') : t('travel.payments.vendorAction')}
            </TravelActionButton>
          </div>
        </div>
      </form>
    </TravelMasterPageFrame>
  );
};

export default TravelVendorPaymentPage;
