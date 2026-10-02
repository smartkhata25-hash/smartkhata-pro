import React, { useEffect, useMemo, useState } from 'react';

import { FaCoins, FaImage, FaSave, FaSyncAlt, FaTrash } from 'react-icons/fa';

import WhatsAppTemplateEditor from '../../components/whatsapp/WhatsAppTemplateEditor';
import {
  fetchTravelCurrencySettings,
  updateTravelCurrencySettings,
} from '../../services/travelMasterService';
import {
  getPrintSettings,
  removePrintLogo,
  updatePrintSettings,
  uploadPrintLogo,
} from '../../services/printSettingService';

import { DEFAULT_TRAVEL_CURRENCY, SUPPORTED_TRAVEL_CURRENCIES } from '../../config/travelConfig';

import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';

import {
  TravelActionButton,
  TravelErrorModal,
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


  const [error, setError] = useState('');
  const [branding, setBranding] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(false);

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
    getPrintSettings()
      .then((data) => setBranding(data?.travelInvoice || null))
      .catch((loadError) => {
        console.error('Travel branding settings load failed:', loadError);
        setError(t('travel.settings.brandingLoadFailed'));
      });
  }, []);

  const normalizedBrandingHeader = useMemo(() => {
    const header = branding?.header || {};

    return {
      ...header,
      showLogoOnPrint:
        typeof header.showLogoOnPrint === 'boolean'
          ? header.showLogoOnPrint
          : header.showLogo === true,
      showLogoOnPdf:
        typeof header.showLogoOnPdf === 'boolean' ? header.showLogoOnPdf : header.showLogo === true,
    };
  }, [branding]);

  const saveBrandingVisibility = async (field, checked) => {
    if (!canManage || brandingLoading) return;

    try {
      setBrandingLoading(true);
      setError('');
      const header = { ...normalizedBrandingHeader, [field]: checked };
      const saved = await updatePrintSettings('travelInvoice', { header });
      setBranding(saved);
    } catch (saveError) {
      console.error('Travel branding visibility save failed:', saveError);
      setError(saveError?.response?.data?.msg || t('travel.settings.brandingSaveFailed'));
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canManage || brandingLoading) return;

    try {
      setBrandingLoading(true);
      setError('');
      setBranding(await uploadPrintLogo('travelInvoice', file));
    } catch (uploadError) {
      console.error('Travel logo upload failed:', uploadError);
      setError(uploadError?.response?.data?.msg || t('travel.settings.logoUploadFailed'));
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!canManage || brandingLoading) return;

    try {
      setBrandingLoading(true);
      setError('');
      setBranding(await removePrintLogo('travelInvoice'));
    } catch (removeError) {
      console.error('Travel logo remove failed:', removeError);
      setError(removeError?.response?.data?.msg || t('travel.settings.logoRemoveFailed'));
    } finally {
      setBrandingLoading(false);
    }
  };

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

      const saved = await updateTravelCurrencySettings({
        baseCurrency: DEFAULT_TRAVEL_CURRENCY,

        rates: rateCodes.map((currency) => ({
          currency,

          rateToBase: Number(rateValues[currency] || 0),
        })),
      });

      setSettings(saved);

      setRateValues(normalizeRateMap(saved));

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
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
              <FaImage />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-950">
                {t('travel.settings.brandingTitle')}
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                {t('travel.settings.brandingNote')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm">
              <FaImage />
              {normalizedBrandingHeader.logoUrl
                ? t('travel.settings.replaceLogo')
                : t('travel.settings.uploadLogo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={!canManage || brandingLoading}
                onChange={handleLogoUpload}
              />
            </label>
            {normalizedBrandingHeader.logoUrl && (
              <button
                type="button"
                onClick={handleLogoRemove}
                disabled={!canManage || brandingLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700 disabled:opacity-50"
              >
                <FaTrash /> {t('travel.settings.removeLogo')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
            {normalizedBrandingHeader.logoUrl ? (
              <img
                src={normalizedBrandingHeader.logoUrl}
                alt={t('travel.settings.currentLogo')}
                className="max-h-20 max-w-full object-contain"
              />
            ) : (
              <span className="text-xs font-bold text-slate-400">
                {t('travel.settings.noLogo')}
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['showLogoOnPrint', 'travel.settings.showLogoOnPrint'],
              ['showLogoOnPdf', 'travel.settings.showLogoOnPdf'],
            ].map(([field, labelKey]) => (
              <label
                key={field}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={normalizedBrandingHeader[field] === true}
                  disabled={!canManage || brandingLoading || !normalizedBrandingHeader.logoUrl}
                  onChange={(event) => saveBrandingVisibility(field, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                {t(labelKey)}
              </label>
            ))}
          </div>
        </div>
      </section>
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

        <TravelErrorModal open={Boolean(error)} message={error} onClose={() => setError('')} />

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
