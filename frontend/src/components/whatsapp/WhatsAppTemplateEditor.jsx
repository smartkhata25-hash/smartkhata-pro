import React, { useCallback, useEffect, useState } from 'react';
import { FaSave, FaSyncAlt } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  fetchWhatsAppTemplate,
  updateWhatsAppTemplate,
} from '../../services/whatsAppTemplateService';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../utils/whatsapp';

const defaultValues = {
  englishTemplate: DEFAULT_WHATSAPP_TEMPLATES.en,
  urduTemplate: DEFAULT_WHATSAPP_TEMPLATES.ur,
};

const WhatsAppTemplateEditor = ({
  moduleScope = 'trading',
  title = t('whatsappSettings.title'),
  description = t('whatsappSettings.description'),
  canManage = false,
}) => {
  const [values, setValues] = useState(defaultValues);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadTemplate = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const template = await fetchWhatsAppTemplate(moduleScope, options);

      setValues({
        englishTemplate: template?.englishTemplate || DEFAULT_WHATSAPP_TEMPLATES.en,
        urduTemplate: template?.urduTemplate || DEFAULT_WHATSAPP_TEMPLATES.ur,
      });
    } catch (loadError) {
      console.error('WhatsApp template load failed:', loadError);

      setValues(defaultValues);
      setError(t('whatsappSettings.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [moduleScope]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleChange = (field, value) => {
    setValues((current) => ({
      ...current,
      [field]: value,
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

      const saved = await updateWhatsAppTemplate(moduleScope, values);

      setValues({
        englishTemplate: saved?.englishTemplate || DEFAULT_WHATSAPP_TEMPLATES.en,
        urduTemplate: saved?.urduTemplate || DEFAULT_WHATSAPP_TEMPLATES.ur,
      });
      setMessage(t('whatsappSettings.saveSuccess'));
    } catch (saveError) {
      console.error('WhatsApp template save failed:', saveError);

      setError(saveError?.response?.data?.message || t('whatsappSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
          <p className="mt-2 text-xs font-bold text-cyan-700">
            {t('whatsappSettings.variables')}: {'{{name}}'}, {'{{balance}}'}, {'{{businessName}}'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadTemplate({ forceRefresh: true })}
          disabled={loading || saving}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FaSyncAlt className="text-[11px]" />
          {t('travel.common.refresh')}
        </button>
      </div>

      {(error || message) && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase text-slate-500">
            {t('whatsappSettings.englishTemplate')}
          </span>
          <textarea
            value={values.englishTemplate}
            onChange={(event) => handleChange('englishTemplate', event.target.value)}
            disabled={!canManage || loading || saving}
            rows={9}
            className="min-h-[210px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase text-slate-500">
            {t('whatsappSettings.urduTemplate')}
          </span>
          <textarea
            value={values.urduTemplate}
            onChange={(event) => handleChange('urduTemplate', event.target.value)}
            disabled={!canManage || loading || saving}
            rows={9}
            dir="rtl"
            className="min-h-[210px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={!canManage || loading || saving}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-600 bg-cyan-600 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FaSave className="text-[11px]" />
          {saving ? t('travel.common.saving') : t('whatsappSettings.save')}
        </button>
      </div>
    </form>
  );
};

export default WhatsAppTemplateEditor;
