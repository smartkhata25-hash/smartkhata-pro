import React, { useCallback, useEffect, useState } from 'react';
import { FaLock, FaSave, FaSyncAlt } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  fetchWhatsAppTemplate,
  updateWhatsAppTemplate,
} from '../../services/whatsAppTemplateService';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../utils/whatsapp';

const VARIABLES = {
  name: '{{name}}',
  balance: '{{balance}}',
  businessName: '{{businessName}}',
};

const createSegments = (template, fallbackTemplate) => {
  const source = String(template || fallbackTemplate || '');

  const nameIndex = source.indexOf(VARIABLES.name);
  const balanceIndex = source.indexOf(VARIABLES.balance);
  const businessIndex = source.indexOf(VARIABLES.businessName);

  const isValidOrder =
    nameIndex !== -1 &&
    balanceIndex !== -1 &&
    businessIndex !== -1 &&
    nameIndex < balanceIndex &&
    balanceIndex < businessIndex;

  if (!isValidOrder) {
    if (source !== fallbackTemplate) {
      return createSegments(fallbackTemplate, fallbackTemplate);
    }

    return {
      beforeName: '',
      betweenNameAndBalance: '',
      betweenBalanceAndBusiness: '',
      afterBusiness: '',
    };
  }

  const afterNameIndex = nameIndex + VARIABLES.name.length;
  const afterBalanceIndex = balanceIndex + VARIABLES.balance.length;
  const afterBusinessIndex = businessIndex + VARIABLES.businessName.length;

  return {
    beforeName: source.slice(0, nameIndex),
    betweenNameAndBalance: source.slice(afterNameIndex, balanceIndex),
    betweenBalanceAndBusiness: source.slice(afterBalanceIndex, businessIndex),
    afterBusiness: source.slice(afterBusinessIndex),
  };
};

const buildTemplate = (segments) =>
  `${segments.beforeName}${VARIABLES.name}${segments.betweenNameAndBalance}${VARIABLES.balance}${segments.betweenBalanceAndBusiness}${VARIABLES.businessName}${segments.afterBusiness}`;

const createDefaultEditors = () => ({
  english: createSegments(DEFAULT_WHATSAPP_TEMPLATES.en, DEFAULT_WHATSAPP_TEMPLATES.en),
  urdu: createSegments(DEFAULT_WHATSAPP_TEMPLATES.ur, DEFAULT_WHATSAPP_TEMPLATES.ur),
});

const LockedVariable = ({ label, value, rtl = false }) => (
  <div
    dir={rtl ? 'rtl' : 'ltr'}
    className="flex items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 px-4 py-3"
  >
    <div className="min-w-0">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">
        {label}
      </div>

      <div className="mt-0.5 text-xs font-bold text-slate-500">{value}</div>
    </div>

    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-cyan-600 shadow-sm">
      <FaLock className="text-[11px]" />
    </div>
  </div>
);

const EditableBlock = ({ value, onChange, disabled, rtl = false, minHeight = 92 }) => (
  <textarea
    value={value}
    onChange={(event) => onChange(event.target.value)}
    disabled={disabled}
    dir={rtl ? 'rtl' : 'ltr'}
    style={{ minHeight }}
    className={`w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
      rtl ? 'text-right' : 'text-left'
    }`}
  />
);

const TemplateColumn = ({ title, segments, onChange, disabled, rtl = false }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
    <div className="mb-3 text-xs font-extrabold uppercase tracking-wide text-slate-500">
      {title}
    </div>

    <div className="space-y-3">
      <EditableBlock
        value={segments.beforeName}
        onChange={(value) => onChange('beforeName', value)}
        disabled={disabled}
        rtl={rtl}
        minHeight={115}
      />

      <LockedVariable
        label={rtl ? 'صارف کا نام' : 'Customer Name'}
        value={VARIABLES.name}
        rtl={rtl}
      />

      <EditableBlock
        value={segments.betweenNameAndBalance}
        onChange={(value) => onChange('betweenNameAndBalance', value)}
        disabled={disabled}
        rtl={rtl}
      />

      <LockedVariable label={rtl ? 'بقایا رقم' : 'Balance'} value={VARIABLES.balance} rtl={rtl} />

      <EditableBlock
        value={segments.betweenBalanceAndBusiness}
        onChange={(value) => onChange('betweenBalanceAndBusiness', value)}
        disabled={disabled}
        rtl={rtl}
      />

      <LockedVariable
        label={rtl ? 'کاروبار کا نام' : 'Business Name'}
        value={VARIABLES.businessName}
        rtl={rtl}
      />

      <EditableBlock
        value={segments.afterBusiness}
        onChange={(value) => onChange('afterBusiness', value)}
        disabled={disabled}
        rtl={rtl}
        minHeight={70}
      />
    </div>
  </div>
);

const WhatsAppTemplateEditor = ({
  moduleScope = 'trading',
  title = t('whatsappSettings.title'),
  description = t('whatsappSettings.description'),
  canManage = false,
}) => {
  const [editors, setEditors] = useState(createDefaultEditors);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const applyTemplate = useCallback((template) => {
    setEditors({
      english: createSegments(template?.englishTemplate, DEFAULT_WHATSAPP_TEMPLATES.en),
      urdu: createSegments(template?.urduTemplate, DEFAULT_WHATSAPP_TEMPLATES.ur),
    });
  }, []);

  const loadTemplate = useCallback(
    async (options = {}) => {
      try {
        setLoading(true);
        setError('');
        setMessage('');

        const template = await fetchWhatsAppTemplate(moduleScope, options);

        applyTemplate(template);
      } catch (loadError) {
        console.error('WhatsApp template load failed:', loadError);

        setEditors(createDefaultEditors());
        setError(t('whatsappSettings.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [applyTemplate, moduleScope]
  );

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleEditorChange = (language, field, value) => {
    setEditors((current) => ({
      ...current,
      [language]: {
        ...current[language],
        [field]: value,
      },
    }));

    setError('');
    setMessage('');
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

      const payload = {
        englishTemplate: buildTemplate(editors.english),
        urduTemplate: buildTemplate(editors.urdu),
      };

      const saved = await updateWhatsAppTemplate(moduleScope, payload);

      applyTemplate(saved);
      setMessage(t('whatsappSettings.saveSuccess'));
    } catch (saveError) {
      console.error('WhatsApp template save failed:', saveError);

      setError(saveError?.response?.data?.message || t('whatsappSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canManage || loading || saving;

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-700 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-white md:text-xl">{title}</h2>

            {description && (
              <p className="mt-1 text-sm font-semibold text-cyan-50">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadTemplate({ forceRefresh: true })}
            disabled={loading || saving}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/15 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FaSyncAlt className={`text-[11px] ${loading ? 'animate-spin' : ''}`} />
            {t('travel.common.refresh')}
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6">
        {(error || message) && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              error
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {error || message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TemplateColumn
            title={t('whatsappSettings.englishTemplate')}
            segments={editors.english}
            disabled={disabled}
            onChange={(field, value) => handleEditorChange('english', field, value)}
          />

          <TemplateColumn
            title={t('whatsappSettings.urduTemplate')}
            segments={editors.urdu}
            disabled={disabled}
            rtl
            onChange={(field, value) => handleEditorChange('urdu', field, value)}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <FaSave className="text-xs" />

            {saving ? t('travel.common.saving') : t('whatsappSettings.save')}
          </button>
        </div>
      </div>
    </form>
  );
};

export default WhatsAppTemplateEditor;
