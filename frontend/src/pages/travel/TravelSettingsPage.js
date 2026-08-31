import React, { useEffect, useMemo, useState } from 'react';

import { FaCoins, FaSave, FaSyncAlt } from 'react-icons/fa';

import WhatsAppTemplateEditor from '../../components/whatsapp/WhatsAppTemplateEditor';
import {
  fetchTravelCurrencySettings,
  updateTravelCurrencySettings,
} from '../../services/travelMasterService';

import { DEFAULT_TRAVEL_CURRENCY, SUPPORTED_TRAVEL_CURRENCIES } from '../../config/travelConfig';

import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';

import {
  TravelActionButton,
  TravelMasterPageFrame,
} from '../../components/travel/master/TravelMasterUI';

const getRateCodes = (settings = null) => {
  const supportedCurrencies = Array.isArray(settings?.supportedCurrencies)
    ? settings.supportedCurrencies
    : SUPPORTED_TRAVEL_CURRENCIES;

  return supportedCurrencies
    .map((currency) => currency.code)
    .filter((code) => code && code !== DEFAULT_TRAVEL_CURRENCY);
};

const normalizeRateMap = (settings = null) => {
  const byCurrency = new Map(
    (settings?.rates || []).map((rate) => [
      rate.currency,
      rate.rateToBase === 0 ? '0' : String(rate.rateToBase || ''),
    ])
  );

  return getRateCodes(settings).reduce((result, code) => {
    result[code] = byCurrency.get(code) || '';

    return result;
  }, {});
};

const TravelSettingsPage = () => {
  const [settings, setSettings] = useState(null);

  const [rateValues, setRateValues] = useState({});

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');

  const [error, setError] = useState('');

  const canManage = hasPermission('travel.settings');

  const rateCodes = useMemo(() => getRateCodes(settings), [settings]);

  const supportedByCode = useMemo(() => {
    return new Map(
      (settings?.supportedCurrencies || SUPPORTED_TRAVEL_CURRENCIES).map((currency) => [
        currency.code,
        currency,
      ])
    );
  }, [settings]);

  const loadSettings = async (options = {}) => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const data = await fetchTravelCurrencySettings(options);

      setSettings(data);

      setRateValues(normalizeRateMap(data));
    } catch (loadError) {
      console.error('Travel currency settings load failed:', loadError);

      setError(t('travel.settings.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleRateChange = (currency, value) => {
    setRateValues((current) => ({
      ...current,
      [currency]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canManage) {
      setError(t('travel.alerts.permissionDenied'));

      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const saved = await updateTravelCurrencySettings({
        baseCurrency: DEFAULT_TRAVEL_CURRENCY,

        rates: rateCodes.map((currency) => ({
          currency,

          rateToBase: Number(rateValues[currency] || 0),
        })),
      });

      setSettings(saved);

      setRateValues(normalizeRateMap(saved));

      setMessage(t('travel.settings.saveSuccess'));
    } catch (saveError) {
      console.error('Travel currency settings save failed:', saveError);

      setError(saveError?.response?.data?.message || t('travel.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const lastUpdatedText = settings?.updatedAt
    ? `${t('travel.settings.lastUpdated')}: ${new Date(settings.updatedAt).toLocaleString()}`
    : t('travel.settings.noSavedRates');

  return (
    <TravelMasterPageFrame
      titleKey="travel.settings.title"
      actions={
        <TravelActionButton
          icon={FaSyncAlt}
          variant="secondary"
          onClick={() =>
            loadSettings({
              forceRefresh: true,
            })
          }
          disabled={loading || saving}
          title={t('travel.common.refresh')}
        />
      }
    >
      <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* HEADER / BASE CURRENCY */}
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-blue-50 p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
                  <FaCoins className="text-sm" />
                </span>

                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-slate-950">
                    {t('travel.settings.currencyRates')}
                  </h2>

                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {t('travel.settings.manualNote')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-3 rounded-xl border border-cyan-100 bg-white px-4 py-3 shadow-sm">
              <span className="text-xs font-bold text-slate-500">
                {t('travel.settings.baseCurrency')}
              </span>

              <span className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm">
                {DEFAULT_TRAVEL_CURRENCY}
              </span>
            </div>
          </div>
        </section>

        {/* ERROR */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm">
            {error}
          </div>
        )}

        {/* SUCCESS */}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm">
            {message}
          </div>
        )}

        {/* RATE CARDS */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rateCodes.map((code) => {
            const currency = supportedByCode.get(code) || {
              code,
              nameKey: '',
            };

            return (
              <div
                key={code}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">
                      {currency.nameKey ? t(currency.nameKey) : code}
                    </p>

                    <p className="mt-0.5 text-xs font-bold text-slate-400">{code}</p>
                  </div>

                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">
                    {code}
                  </span>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-500">
                    1 {code} = {DEFAULT_TRAVEL_CURRENCY}
                  </span>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={rateValues[code] || ''}
                      onChange={(event) => handleRateChange(code, event.target.value)}
                      onWheel={(event) => event.currentTarget.blur()}
                      placeholder={t('travel.settings.ratePlaceholder')}
                      disabled={!canManage || loading || saving}
                      className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-slate-950 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />

                    <span className="flex h-11 flex-shrink-0 items-center rounded-lg bg-slate-100 px-3 text-xs font-extrabold text-slate-600">
                      {DEFAULT_TRAVEL_CURRENCY}
                    </span>
                  </div>
                </label>
              </div>
            );
          })}
        </section>

        {/* FOOTER */}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">{lastUpdatedText}</p>

          <TravelActionButton
            type="submit"
            icon={FaSave}
            variant="primary"
            disabled={!canManage || loading || saving}
          >
            {saving ? t('travel.common.saving') : t('travel.settings.saveChanges')}
          </TravelActionButton>
        </div>
      </form>
      <WhatsAppTemplateEditor
        moduleScope="travel"
        title={t('whatsappSettings.travelTitle')}
        description={t('whatsappSettings.travelDescription')}
        canManage={canManage}
      />
      </div>
    </TravelMasterPageFrame>
  );
};

export default TravelSettingsPage;
