import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaCheck,
  FaClock,
  FaEnvelope,
  FaExternalLinkAlt,
  FaLock,
  FaRedo,
  FaSave,
  FaTimes,
  FaWhatsapp,
} from 'react-icons/fa';

import { t, getCurrentLanguage } from '../../../i18n/i18n';
import {
  TRAVEL_REMINDER_LEAD_PRESETS,
  getReminderLeadPreset,
  normalizeReminderSettingsForForm,
} from '../bookings/travelBookingConfig';
import { TravelActionButton } from '../master/TravelMasterUI';
import {
  fetchTravelReminderSettings,
  fetchTravelReminders,
  fetchTravelReminderWhatsAppMessage,
  markTravelReminderRead,
  sendTravelReminderEmail,
  updateTravelReminderSettings,
} from '../../../services/travelReminderService';
import { generateWhatsAppLink } from '../../../utils/whatsapp';
import { hasPermission } from '../../../utils/permissionHelper';

/* -------------------------------------------------------------------------- */
/*                                BASIC CONFIG                                */
/* -------------------------------------------------------------------------- */

const EMPTY_SUMMARY = {
  attentionCount: 0,
  dueCount: 0,
  upcomingCount: 0,
  failedEmailCount: 0,
  nextReminder: null,
};

const reminderTabs = [
  {
    value: 'due',
    labelKey: 'travel.reminders.tabs.due',
  },
  {
    value: 'upcoming',
    labelKey: 'travel.reminders.tabs.upcoming',
  },
  {
    value: 'failed',
    labelKey: 'travel.reminders.tabs.failed',
  },
  {
    value: 'completed',
    labelKey: 'travel.reminders.tabs.completed',
  },
];

const TEMPLATE_VARIABLES = [
  {
    key: 'customerName',
    token: '{{customerName}}',
    label: 'Customer Name',
    urduLabel: 'کسٹمر کا نام',
  },
  {
    key: 'bookingNumber',
    token: '{{bookingNumber}}',
    label: 'Booking Number',
    urduLabel: 'بکنگ نمبر',
  },
  {
    key: 'eventType',
    token: '{{eventType}}',
    label: 'Travel Event',
    urduLabel: 'سفر کی تفصیل',
  },
  {
    key: 'eventDate',
    token: '{{eventDate}}',
    label: 'Event Date',
    urduLabel: 'سفر کی تاریخ',
  },
  {
    key: 'eventTime',
    token: '{{eventTime}}',
    label: 'Event Time',
    urduLabel: 'سفر کا وقت',
  },
  {
    key: 'businessName',
    token: '{{businessName}}',
    label: 'Business Name',
    urduLabel: 'کاروبار کا نام',
  },
];

const TEMPLATE_TOKENS = TEMPLATE_VARIABLES.map((item) => item.token);

const ENGLISH_TEMPLATE_FALLBACK = `Dear {{customerName}},

This is a reminder for your travel booking {{bookingNumber}}.

Travel Event: {{eventType}}
Date: {{eventDate}}
Time: {{eventTime}}

Regards,
{{businessName}}`;

const URDU_TEMPLATE_FALLBACK = `محترم {{customerName}}،

آپ کی سفری بکنگ {{bookingNumber}} کے حوالے سے یاد دہانی ہے۔

سفر: {{eventType}}
تاریخ: {{eventDate}}
وقت: {{eventTime}}

شکریہ،
{{businessName}}`;

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

const boolValue = (value, fallback = false) =>
  value === undefined || value === null ? fallback : value === true;

const normalizeSettingsDraft = (settings = {}) => {
  const leadMinutes = Number(settings.defaultLeadMinutes ?? settings.leadMinutes ?? 24 * 60);

  return {
    automaticRemindersEnabled: boolValue(settings.automaticRemindersEnabled, true),
    defaultLeadMinutes:
      Number.isFinite(leadMinutes) && leadMinutes >= 0 ? Math.floor(leadMinutes) : 24 * 60,
    leadPreset: getReminderLeadPreset(leadMinutes),
    emailEnabled: boolValue(settings.emailEnabled, false),
    whatsappEnabled: settings.whatsappEnabled !== false,
    englishTemplate: settings.englishTemplate || ENGLISH_TEMPLATE_FALLBACK,
    urduTemplate: settings.urduTemplate || URDU_TEMPLATE_FALLBACK,
  };
};

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatShortDate = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatShortTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const leadLabel = (minutes = 0) => {
  const preset = TRAVEL_REMINDER_LEAD_PRESETS.find(
    (option) => option.value !== 'custom' && option.minutes === Number(minutes)
  );

  if (preset) {
    return t(preset.labelKey);
  }

  return `${Number(minutes || 0).toLocaleString('en-GB')} ${t('travel.reminders.minutes')}`;
};

const getVariableByToken = (token) =>
  TEMPLATE_VARIABLES.find((item) => item.token === token) || null;

const templateContainsRequiredVariables = (template) =>
  TEMPLATE_TOKENS.every((token) => String(template || '').includes(token));

const normalizeTemplate = (template, fallback) => {
  const source = String(template || '').trim();

  if (!source || !templateContainsRequiredVariables(source)) {
    return fallback;
  }

  return source;
};

/*
 * Template کو editable text اور locked variables میں تقسیم کرتا ہے۔
 * User wording بدل سکتا ہے لیکن system variables delete/edit نہیں کر سکتا۔
 */
const createTemplateParts = (template, fallback) => {
  const source = normalizeTemplate(template, fallback);

  const tokenPattern = new RegExp(
    `(${TEMPLATE_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g'
  );

  return source
    .split(tokenPattern)
    .filter((part) => part !== '')
    .map((part, index) => {
      if (TEMPLATE_TOKENS.includes(part)) {
        return {
          id: `variable-${index}-${part}`,
          type: 'variable',
          value: part,
        };
      }

      return {
        id: `text-${index}`,
        type: 'text',
        value: part,
      };
    });
};

const buildTemplateFromParts = (parts = []) => parts.map((part) => part.value).join('');

/* -------------------------------------------------------------------------- */
/*                               COMMON CONTROLS                              */
/* -------------------------------------------------------------------------- */

const ToggleField = ({ checked, onChange, labelKey, disabled = false, description = '' }) => (
  <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-cyan-200 hover:shadow">
    <div className="min-w-0">
      <span className="block text-xs font-extrabold text-slate-800">{t(labelKey)}</span>

      {description && (
        <span className="mt-0.5 block text-[10px] font-semibold leading-4 text-slate-400">
          {description}
        </span>
      )}
    </div>

    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 flex-shrink-0 accent-cyan-600 disabled:cursor-not-allowed"
    />
  </label>
);

const TimingControl = ({ value, onChange, disabled = false, useDefaultKey = false }) => {
  const settings = normalizeReminderSettingsForForm(value);
  const leadField = useDefaultKey ? 'defaultLeadMinutes' : 'leadMinutes';

  const handlePresetChange = (option) => {
    onChange({
      ...value,
      leadPreset: option.value,
      [leadField]: option.value === 'custom' ? settings.leadMinutes : option.minutes,
      leadMinutes: option.value === 'custom' ? settings.leadMinutes : option.minutes,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TRAVEL_REMINDER_LEAD_PRESETS.map((option) => {
          const active = settings.leadPreset === option.value;

          return (
            <button
              type="button"
              key={option.value}
              disabled={disabled}
              onClick={() => handlePresetChange(option)}
              className={`min-h-8 rounded-lg border px-2.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'border-cyan-600 bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50'
              }`}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>

      {settings.leadPreset === 'custom' && (
        <label className="block max-w-[170px]">
          <span className="mb-1 block text-xs font-extrabold text-slate-500">
            {t('travel.reminders.customMinutes')}
          </span>

          <input
            type="number"
            min="0"
            step="5"
            disabled={disabled}
            value={settings.leadMinutes}
            onChange={(event) => {
              const minutes = Number(event.target.value || 0);

              const safeMinutes =
                Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : 0;

              onChange({
                ...value,
                leadPreset: 'custom',
                [leadField]: safeMinutes,
                leadMinutes: safeMinutes,
              });
            }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
        </label>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                     BOOKING FORM REMINDER CONTROLS                         */
/* -------------------------------------------------------------------------- */

export const TravelBookingReminderControls = ({
  value,
  onChange,
  businessSettings = null,
  disabled = false,
}) => {
  const settings = normalizeReminderSettingsForForm(value);

  const inherited = normalizeReminderSettingsForForm({
    inheritBusinessDefaults: true,
    automaticRemindersEnabled: businessSettings?.automaticRemindersEnabled,
    defaultLeadMinutes: businessSettings?.defaultLeadMinutes,
    emailEnabled: businessSettings?.emailEnabled,
    whatsappEnabled: businessSettings?.whatsappEnabled,
  });

  const effectiveSettings = settings.inheritBusinessDefaults ? inherited : settings;

  const controlsDisabled = disabled || settings.inheritBusinessDefaults;

  const updateSettings = (patch) => {
    onChange({
      ...settings,
      ...patch,
    });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-cyan-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-sky-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-cyan-700 shadow-sm ring-1 ring-black/5">
            <FaBell aria-hidden="true" />
          </span>

          <h2 className="truncate text-sm font-black text-slate-900">
            {t('travel.reminders.formTitle')}
          </h2>
        </div>

        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-extrabold text-cyan-700">
          {effectiveSettings.enabled
            ? `${leadLabel(effectiveSettings.leadMinutes)} ${t('travel.reminders.beforeEvent')}`
            : t('travel.reminders.disabled')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <ToggleField
          checked={settings.inheritBusinessDefaults}
          disabled={disabled}
          labelKey="travel.reminders.inheritDefaults"
          onChange={(checked) =>
            updateSettings({
              ...inherited,
              inheritBusinessDefaults: checked,
            })
          }
        />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[160px_minmax(0,1fr)_180px_210px]">
          <ToggleField
            checked={effectiveSettings.enabled}
            disabled={controlsDisabled}
            labelKey="travel.reminders.enabled"
            onChange={(checked) =>
              updateSettings({
                enabled: checked,
              })
            }
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <p className="mb-2 text-xs font-extrabold text-slate-500">
              {t('travel.reminders.timingLabel')}
            </p>

            <TimingControl
              value={effectiveSettings}
              disabled={controlsDisabled || !effectiveSettings.enabled}
              onChange={(next) =>
                updateSettings({
                  leadPreset: next.leadPreset,
                  leadMinutes: next.leadMinutes,
                })
              }
            />
          </div>

          <ToggleField
            checked={effectiveSettings.emailEnabled}
            disabled={controlsDisabled || !effectiveSettings.enabled}
            labelKey="travel.reminders.emailAutomatic"
            onChange={(checked) =>
              updateSettings({
                emailEnabled: checked,
              })
            }
          />

          <ToggleField
            checked={effectiveSettings.whatsappEnabled}
            disabled={controlsDisabled || !effectiveSettings.enabled}
            labelKey="travel.reminders.whatsappManual"
            onChange={(checked) =>
              updateSettings({
                whatsappEnabled: checked,
              })
            }
          />
        </div>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                              STATUS / ACTION UI                            */
/* -------------------------------------------------------------------------- */

const StatusPill = ({ children, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  };

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-[10px] font-extrabold ${
        tones[tone] || tones.slate
      }`}
    >
      {children}
    </span>
  );
};

const ReminderIconButton = ({
  icon: Icon,
  title,
  onClick,
  disabled = false,
  variant = 'slate',
}) => {
  const variants = {
    slate: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
    cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700 hover:border-cyan-200 hover:bg-cyan-100',
    emerald:
      'border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-100',
    rose: 'border-rose-100 bg-rose-50 text-rose-700 hover:border-rose-200 hover:bg-rose-100',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border text-sm shadow-sm transition hover:-translate-y-px hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
        variants[variant] || variants.slate
      }`}
    >
      <Icon aria-hidden="true" />
    </button>
  );
};

/* -------------------------------------------------------------------------- */
/*                         BOOKING DETAIL STATUS PANEL                        */
/* -------------------------------------------------------------------------- */

export const TravelReminderStatusPanel = ({
  bookingId,
  reminders = [],
  onOpenCenter = null,
  onSendEmail = null,
  onSendWhatsApp = null,
}) => {
  const navigate = useNavigate();

  const activeReminder = reminders.find((item) => item.status !== 'cancelled') || reminders[0];

  if (!activeReminder) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <FaBell aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-sm font-black text-slate-900">
                {t('travel.reminders.statusTitle')}
              </h2>

              <p className="text-xs font-bold text-slate-500">
                {t('travel.reminders.noActiveReminder')}
              </p>
            </div>
          </div>

          {onOpenCenter && (
            <TravelActionButton icon={FaExternalLinkAlt} variant="soft" onClick={onOpenCenter}>
              {t('travel.reminders.openCenter')}
            </TravelActionButton>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 text-white">
              <FaBell aria-hidden="true" />
            </span>

            <h2 className="text-sm font-black text-slate-900">
              {t('travel.reminders.statusTitle')}
            </h2>

            <StatusPill tone={activeReminder.enabled ? 'cyan' : 'slate'}>
              {activeReminder.enabled
                ? t('travel.reminders.enabled')
                : t('travel.reminders.disabled')}
            </StatusPill>

            <StatusPill tone={activeReminder.isRead ? 'slate' : 'amber'}>
              {activeReminder.isRead ? t('travel.reminders.read') : t('travel.reminders.unread')}
            </StatusPill>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
            <span>{activeReminder.eventLabel || '-'}</span>

            <span>{formatDateTime(activeReminder.eventDateTime)}</span>

            <span>{formatDateTime(activeReminder.remindAt)}</span>

            <span>
              {t('travel.reminders.email')}:{' '}
              {t(`travel.reminders.emailStatus.${activeReminder.emailStatus || 'disabled'}`)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenCenter && (
            <ReminderIconButton
              icon={FaExternalLinkAlt}
              title={t('travel.reminders.openCenter')}
              onClick={onOpenCenter}
              variant="cyan"
            />
          )}

          {bookingId && (
            <ReminderIconButton
              icon={FaExternalLinkAlt}
              title={t('travel.reminders.openBooking')}
              onClick={() => navigate(`/travel/bookings/${bookingId}`)}
            />
          )}

          {activeReminder.whatsappEnabled && onSendWhatsApp && (
            <ReminderIconButton
              icon={FaWhatsapp}
              title={t('travel.reminders.whatsappAction')}
              onClick={() => onSendWhatsApp(activeReminder)}
              variant="emerald"
            />
          )}

          {activeReminder.emailEnabled && onSendEmail && (
            <ReminderIconButton
              icon={activeReminder.emailStatus === 'failed' ? FaRedo : FaEnvelope}
              title={t('travel.reminders.sendEmail')}
              onClick={() => onSendEmail(activeReminder)}
              disabled={activeReminder.emailStatus === 'sent'}
              variant="emerald"
            />
          )}
        </div>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                             TEMPLATE EDITOR                                */
/* -------------------------------------------------------------------------- */

const LockedVariableBlock = ({ token, rtl = false }) => {
  const variable = getVariableByToken(token);

  if (!variable) return null;

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      className="flex items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-blue-50 px-3 py-2.5 shadow-sm"
    >
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wide text-cyan-700">
          {rtl ? variable.urduLabel : variable.label}
        </p>

        <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-slate-500">
          {variable.token}
        </p>
      </div>

      <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-cyan-600 shadow-sm ring-1 ring-cyan-100">
        <FaLock aria-hidden="true" className="text-[10px]" />
      </span>
    </div>
  );
};

const TemplateEditor = ({ title, value, onChange, disabled = false, rtl = false, fallback }) => {
  const parts = useMemo(() => createTemplateParts(value, fallback), [value, fallback]);

  const updateTextPart = (index, nextValue) => {
    const nextParts = parts.map((part, partIndex) =>
      partIndex === index
        ? {
            ...part,
            value: nextValue,
          }
        : part
    );

    onChange(buildTemplateFromParts(nextParts));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-cyan-50 via-white to-blue-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-900">{title}</h4>

            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
              {rtl
                ? 'صرف عام تحریر تبدیل کی جا سکتی ہے، سسٹم فیلڈز لاک ہیں۔'
                : 'Edit wording only. System fields are protected.'}
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100 bg-white px-2.5 py-1 text-[10px] font-black text-cyan-700 shadow-sm">
            <FaLock className="text-[9px]" />
            {rtl ? 'محفوظ فیلڈز' : 'Protected'}
          </span>
        </div>
      </div>

      <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-2.5 p-3">
        {parts.map((part, index) => {
          if (part.type === 'variable') {
            return <LockedVariableBlock key={part.id} token={part.value} rtl={rtl} />;
          }

          return (
            <textarea
              key={part.id}
              value={part.value}
              disabled={disabled}
              dir={rtl ? 'rtl' : 'ltr'}
              rows={Math.max(2, Math.min(5, String(part.value || '').split('\n').length + 1))}
              onChange={(event) => updateTextPart(index, event.target.value)}
              className={`w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold leading-6 text-slate-800 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
                rtl ? 'text-right' : 'text-left'
              }`}
            />
          );
        })}
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                              SUMMARY METRIC                                */
/* -------------------------------------------------------------------------- */

const SummaryMetric = ({ label, value, tone = 'slate' }) => {
  const tones = {
    amber: 'border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700',
    cyan: 'border-cyan-100 bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-700',
    rose: 'border-rose-100 bg-gradient-to-br from-rose-50 to-red-50 text-rose-700',
    emerald: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-700',
    slate: 'border-slate-200 bg-gradient-to-br from-slate-50 to-white text-slate-700',
  };

  return (
    <div className={`rounded-xl border p-3 text-center shadow-sm ${tones[tone] || tones.slate}`}>
      <p className="text-xl font-black">{Number(value || 0).toLocaleString('en-GB')}</p>

      <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-wide">{label}</p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              DESKTOP TABLE                                 */
/* -------------------------------------------------------------------------- */

const DesktopReminderTable = ({
  reminders,
  actionId,
  onWhatsApp,
  onEmail,
  onOpenBooking,
  onRead,
}) => (
  <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-cyan-50">
            <th className="whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Customer
            </th>

            <th className="whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Booking
            </th>

            <th className="whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Travel Event
            </th>

            <th className="whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Reminder
            </th>

            <th className="whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Email
            </th>

            <th className="whitespace-nowrap px-3 py-3 text-right text-[10px] font-black uppercase tracking-wide text-slate-500">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {reminders.map((reminder) => (
            <tr
              key={reminder._id}
              className={`transition hover:bg-cyan-50/50 ${
                reminder.isRead ? 'bg-white' : 'bg-amber-50/30'
              }`}
            >
              <td className="px-3 py-3 align-top">
                <div className="min-w-[135px]">
                  <p className="text-xs font-black text-slate-900">
                    {reminder.customerName || '-'}
                  </p>

                  <div className="mt-1.5">
                    <StatusPill tone={reminder.isRead ? 'slate' : 'amber'}>
                      {reminder.isRead ? t('travel.reminders.read') : t('travel.reminders.unread')}
                    </StatusPill>
                  </div>
                </div>
              </td>

              <td className="px-3 py-3 align-top">
                <p className="whitespace-nowrap text-xs font-extrabold text-slate-700">
                  {reminder.bookingNumber || '-'}
                </p>
              </td>

              <td className="px-3 py-3 align-top">
                <div className="min-w-[150px]">
                  <p className="text-xs font-extrabold text-slate-800">
                    {reminder.eventLabel || '-'}
                  </p>

                  <p className="mt-1 text-[10px] font-bold text-slate-500">
                    {formatShortDate(reminder.eventDateTime)}
                  </p>

                  <p className="text-[10px] font-bold text-slate-400">
                    {formatShortTime(reminder.eventDateTime)}
                  </p>
                </div>
              </td>

              <td className="px-3 py-3 align-top">
                <div className="min-w-[130px]">
                  <p className="text-[11px] font-bold text-slate-600">
                    {formatShortDate(reminder.remindAt)}
                  </p>

                  <p className="text-[10px] font-semibold text-slate-400">
                    {formatShortTime(reminder.remindAt)}
                  </p>

                  <p className="mt-1 text-[10px] font-extrabold text-cyan-700">
                    {leadLabel(reminder.leadMinutes)}
                  </p>
                </div>
              </td>

              <td className="px-3 py-3 align-top">
                <StatusPill
                  tone={
                    reminder.emailStatus === 'failed'
                      ? 'rose'
                      : reminder.emailStatus === 'sent'
                        ? 'emerald'
                        : reminder.emailStatus === 'pending'
                          ? 'cyan'
                          : 'slate'
                  }
                >
                  {t(`travel.reminders.emailStatus.${reminder.emailStatus || 'disabled'}`)}
                </StatusPill>

                {reminder.emailError && (
                  <p className="mt-1 max-w-[170px] text-[9px] font-semibold text-rose-600">
                    {reminder.emailError}
                  </p>
                )}
              </td>

              <td className="px-3 py-3 align-top">
                <div className="flex justify-end gap-1.5">
                  {reminder.whatsappEnabled && (
                    <ReminderIconButton
                      icon={FaWhatsapp}
                      title={t('travel.reminders.whatsappAction')}
                      onClick={() => onWhatsApp(reminder)}
                      disabled={actionId === reminder._id}
                      variant="emerald"
                    />
                  )}

                  {reminder.emailEnabled && (
                    <ReminderIconButton
                      icon={reminder.emailStatus === 'failed' ? FaRedo : FaEnvelope}
                      title={t('travel.reminders.sendEmail')}
                      onClick={() => onEmail(reminder)}
                      disabled={actionId === reminder._id || reminder.emailStatus === 'sent'}
                      variant={reminder.emailStatus === 'failed' ? 'rose' : 'cyan'}
                    />
                  )}

                  <ReminderIconButton
                    icon={FaExternalLinkAlt}
                    title={t('travel.reminders.openBooking')}
                    onClick={() => onOpenBooking(reminder)}
                  />

                  {!reminder.isRead && (
                    <ReminderIconButton
                      icon={FaCheck}
                      title={t('travel.reminders.markRead')}
                      onClick={() => onRead(reminder)}
                      disabled={actionId === reminder._id}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                MOBILE CARDS                                */
/* -------------------------------------------------------------------------- */

const MobileReminderCards = ({
  reminders,
  actionId,
  onWhatsApp,
  onEmail,
  onOpenBooking,
  onRead,
}) => (
  <div className="space-y-3 md:hidden">
    {reminders.map((reminder) => (
      <article
        key={reminder._id}
        className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
          reminder.isRead ? 'border-slate-200' : 'border-amber-200'
        }`}
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-slate-950">
                {reminder.customerName || '-'}
              </h3>

              <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                {reminder.bookingNumber || '-'}
              </p>
            </div>

            <StatusPill tone={reminder.isRead ? 'slate' : 'amber'}>
              {reminder.isRead ? t('travel.reminders.read') : t('travel.reminders.unread')}
            </StatusPill>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <p className="text-[9px] font-black uppercase text-slate-400">Event</p>

              <p className="mt-1 text-xs font-extrabold text-slate-800">
                {reminder.eventLabel || '-'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <p className="text-[9px] font-black uppercase text-slate-400">Timing</p>

              <p className="mt-1 text-xs font-extrabold text-cyan-700">
                {leadLabel(reminder.leadMinutes)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
            <div className="grid grid-cols-2 divide-x divide-slate-100">
              <div className="p-2.5">
                <p className="text-[9px] font-black uppercase text-slate-400">Event Date</p>

                <p className="mt-1 text-[11px] font-bold text-slate-700">
                  {formatDateTime(reminder.eventDateTime)}
                </p>
              </div>

              <div className="p-2.5">
                <p className="text-[9px] font-black uppercase text-slate-400">Reminder</p>

                <p className="mt-1 text-[11px] font-bold text-slate-700">
                  {formatDateTime(reminder.remindAt)}
                </p>
              </div>
            </div>
          </div>

          {reminder.emailError && (
            <p className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-[10px] font-bold text-rose-700">
              {reminder.emailError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill
              tone={
                reminder.emailStatus === 'failed'
                  ? 'rose'
                  : reminder.emailStatus === 'sent'
                    ? 'emerald'
                    : reminder.emailStatus === 'pending'
                      ? 'cyan'
                      : 'slate'
              }
            >
              Email: {t(`travel.reminders.emailStatus.${reminder.emailStatus || 'disabled'}`)}
            </StatusPill>

            <div className="flex gap-1.5">
              {reminder.whatsappEnabled && (
                <ReminderIconButton
                  icon={FaWhatsapp}
                  title={t('travel.reminders.whatsappAction')}
                  onClick={() => onWhatsApp(reminder)}
                  disabled={actionId === reminder._id}
                  variant="emerald"
                />
              )}

              {reminder.emailEnabled && (
                <ReminderIconButton
                  icon={reminder.emailStatus === 'failed' ? FaRedo : FaEnvelope}
                  title={t('travel.reminders.sendEmail')}
                  onClick={() => onEmail(reminder)}
                  disabled={actionId === reminder._id || reminder.emailStatus === 'sent'}
                  variant={reminder.emailStatus === 'failed' ? 'rose' : 'cyan'}
                />
              )}

              <ReminderIconButton
                icon={FaExternalLinkAlt}
                title={t('travel.reminders.openBooking')}
                onClick={() => onOpenBooking(reminder)}
              />

              {!reminder.isRead && (
                <ReminderIconButton
                  icon={FaCheck}
                  title={t('travel.reminders.markRead')}
                  onClick={() => onRead(reminder)}
                  disabled={actionId === reminder._id}
                />
              )}
            </div>
          </div>
        </div>
      </article>
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/*                           MAIN REMINDER CENTER                             */
/* -------------------------------------------------------------------------- */

const TravelReminderCenter = ({
  isOpen,
  onClose,
  summary = EMPTY_SUMMARY,
  onSummaryRefresh = null,
}) => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('due');
  const [reminders, setReminders] = useState([]);

  const [settingsDraft, setSettingsDraft] = useState(() => normalizeSettingsDraft());

  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [actionId, setActionId] = useState('');
  const [centerError, setCenterError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canManageSettings = hasPermission('travel.settings');

  const normalizedSummary = useMemo(
    () => ({
      ...EMPTY_SUMMARY,
      ...(summary || {}),
    }),
    [summary]
  );

  const loadCenter = useCallback(async () => {
    if (!isOpen) return;

    try {
      setLoading(true);
      setCenterError('');

      const [nextSettings, nextReminders] = await Promise.all([
        fetchTravelReminderSettings(),
        fetchTravelReminders({
          status: activeTab,
        }),
      ]);

      setSettingsDraft(normalizeSettingsDraft(nextSettings));

      setReminders(nextReminders);
    } catch (error) {
      console.error('Travel reminders load failed:', error);

      setCenterError(t('travel.reminders.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [activeTab, isOpen]);

  useEffect(() => {
    loadCenter();
  }, [loadCenter]);

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      setCenterError('');
      setSuccessMessage('');

      const englishTemplate = normalizeTemplate(
        settingsDraft.englishTemplate,
        ENGLISH_TEMPLATE_FALLBACK
      );

      const urduTemplate = normalizeTemplate(settingsDraft.urduTemplate, URDU_TEMPLATE_FALLBACK);

      const saved = await updateTravelReminderSettings({
        automaticRemindersEnabled: settingsDraft.automaticRemindersEnabled,

        defaultLeadMinutes: settingsDraft.defaultLeadMinutes,

        emailEnabled: settingsDraft.emailEnabled,

        whatsappEnabled: settingsDraft.whatsappEnabled,

        englishTemplate,
        urduTemplate,
      });

      setSettingsDraft(normalizeSettingsDraft(saved));

      setSuccessMessage('Reminder settings saved successfully.');

      await onSummaryRefresh?.({
        forceRefresh: true,
      });
    } catch (error) {
      console.error('Travel reminder settings save failed:', error);

      setCenterError(error?.response?.data?.message || t('travel.reminders.settingsSaveFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const refreshAfterAction = async () => {
    await Promise.all([
      loadCenter(),
      onSummaryRefresh?.({
        forceRefresh: true,
      }),
    ]);
  };

  const handleEmail = async (reminder) => {
    try {
      setActionId(reminder._id);
      setCenterError('');
      setSuccessMessage('');

      await sendTravelReminderEmail(reminder._id);

      setSuccessMessage('Reminder email sent successfully.');

      await refreshAfterAction();
    } catch (error) {
      console.error('Travel reminder email action failed:', error);

      setCenterError(error?.response?.data?.message || t('travel.reminders.emailFailed'));
    } finally {
      setActionId('');
    }
  };

  const handleRead = async (reminder) => {
    try {
      setActionId(reminder._id);
      setCenterError('');
      setSuccessMessage('');

      await markTravelReminderRead(reminder._id, true);

      await refreshAfterAction();
    } catch (error) {
      console.error('Travel reminder read action failed:', error);

      setCenterError(error?.response?.data?.message || t('travel.reminders.readFailed'));
    } finally {
      setActionId('');
    }
  };

  const handleWhatsApp = async (reminder) => {
    try {
      setActionId(reminder._id);
      setCenterError('');
      setSuccessMessage('');

      const payload = await fetchTravelReminderWhatsAppMessage(reminder._id, getCurrentLanguage());

      const link = generateWhatsAppLink(payload?.phone, payload?.message);

      if (!link) {
        setCenterError(t('travel.reminders.whatsappMissingPhone'));

        return;
      }

      const opened = window.open(link, '_blank');

      if (!opened) {
        setCenterError(t('alerts.printWindowBlocked'));
      }
    } catch (error) {
      console.error('Travel reminder WhatsApp action failed:', error);

      setCenterError(error?.response?.data?.message || t('travel.reminders.whatsappFailed'));
    } finally {
      setActionId('');
    }
  };

  const openBooking = (reminder) => {
    if (!reminder?.bookingId) return;

    onClose?.();

    navigate(`/travel/bookings/${reminder.bookingId}`);
  };

  const tabCounts = useMemo(
    () => ({
      due: normalizedSummary.dueCount || normalizedSummary.attentionCount || 0,

      upcoming: normalizedSummary.upcomingCount || 0,

      failed: normalizedSummary.failedEmailCount || 0,

      completed: 0,
    }),
    [normalizedSummary]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-2 py-2 backdrop-blur-[2px] sm:px-3 sm:py-4">
      <section className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-2xl">
        {/* HEADER */}

        <div className="relative overflow-hidden border-b border-cyan-100 bg-gradient-to-r from-cyan-700 via-blue-700 to-indigo-700 px-4 py-4 sm:px-5">
          <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 left-24 h-40 w-40 rounded-full bg-cyan-300/10 blur-2xl" />

          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-sm ring-1 ring-white/20 backdrop-blur">
                <FaBell aria-hidden="true" />

                {normalizedSummary.attentionCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber-400 px-1 text-center text-[10px] font-black text-slate-900 shadow">
                    {normalizedSummary.attentionCount}
                  </span>
                )}
              </span>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-white sm:text-xl">
                  {t('travel.reminders.centerTitle')}
                </h2>

                <p className="mt-0.5 truncate text-xs font-semibold text-cyan-100 sm:text-sm">
                  {t('travel.reminders.centerSubtitle')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              title={t('travel.common.close')}
              aria-label={t('travel.common.close')}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* BODY */}

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-3 sm:p-4">
          {(centerError || successMessage) && (
            <div
              className={`mb-3 rounded-xl border px-3 py-2.5 text-sm font-bold ${
                centerError
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {centerError || successMessage}
            </div>
          )}

          {/* SUMMARY */}

          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryMetric
              label={t('travel.reminders.dueNow')}
              value={normalizedSummary.dueCount}
              tone="amber"
            />

            <SummaryMetric
              label={t('travel.reminders.upcoming')}
              value={normalizedSummary.upcomingCount}
              tone="cyan"
            />

            <SummaryMetric
              label={t('travel.reminders.failedEmail')}
              value={normalizedSummary.failedEmailCount}
              tone="rose"
            />

            <SummaryMetric
              label="Attention"
              value={normalizedSummary.attentionCount}
              tone="emerald"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
            {/* LEFT SETTINGS */}

            <aside className="space-y-3">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-gradient-to-r from-cyan-50 via-white to-blue-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">
                        {t('travel.reminders.businessDefaults')}
                      </h3>

                      <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        Travel reminder preferences
                      </p>
                    </div>

                    {canManageSettings && (
                      <button
                        type="button"
                        onClick={saveSettings}
                        disabled={savingSettings}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 px-3 text-xs font-extrabold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      >
                        <FaSave aria-hidden="true" />

                        {savingSettings ? t('travel.common.saving') : t('travel.common.save')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5 p-3">
                  <ToggleField
                    checked={settingsDraft.automaticRemindersEnabled}
                    disabled={!canManageSettings}
                    labelKey="travel.reminders.automaticReminders"
                    description="Automatically create reminders for future travel."
                    onChange={(checked) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        automaticRemindersEnabled: checked,
                      }))
                    }
                  />

                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-cyan-600 shadow-sm">
                        <FaClock className="text-[11px]" />
                      </span>

                      <p className="text-xs font-black text-slate-700">
                        {t('travel.reminders.defaultTiming')}
                      </p>
                    </div>

                    <TimingControl
                      value={{
                        ...settingsDraft,
                        leadMinutes: settingsDraft.defaultLeadMinutes,
                      }}
                      disabled={!canManageSettings}
                      useDefaultKey
                      onChange={(next) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          leadPreset: next.leadPreset,
                          defaultLeadMinutes: next.defaultLeadMinutes ?? next.leadMinutes,
                        }))
                      }
                    />
                  </div>

                  <ToggleField
                    checked={settingsDraft.emailEnabled}
                    disabled={!canManageSettings}
                    labelKey="travel.reminders.emailAutomatic"
                    description="Send email automatically when reminder becomes due."
                    onChange={(checked) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        emailEnabled: checked,
                      }))
                    }
                  />

                  <ToggleField
                    checked={settingsDraft.whatsappEnabled}
                    disabled={!canManageSettings}
                    labelKey="travel.reminders.whatsappManual"
                    description="Allow WhatsApp action from reminder rows."
                    onChange={(checked) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        whatsappEnabled: checked,
                      }))
                    }
                  />
                </div>
              </section>

              {/* LOCKED TEMPLATE EDITORS */}

              <TemplateEditor
                title={t('travel.reminders.englishTemplate')}
                value={settingsDraft.englishTemplate}
                fallback={ENGLISH_TEMPLATE_FALLBACK}
                disabled={!canManageSettings}
                onChange={(nextTemplate) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    englishTemplate: nextTemplate,
                  }))
                }
              />

              <TemplateEditor
                title={t('travel.reminders.urduTemplate')}
                value={settingsDraft.urduTemplate}
                fallback={URDU_TEMPLATE_FALLBACK}
                disabled={!canManageSettings}
                rtl
                onChange={(nextTemplate) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    urduTemplate: nextTemplate,
                  }))
                }
              />
            </aside>

            {/* RIGHT REMINDER INBOX */}

            <main className="min-w-0 space-y-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {reminderTabs.map((tab) => {
                    const active = activeTab === tab.value;

                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setActiveTab(tab.value)}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-extrabold transition ${
                          active
                            ? 'border-cyan-600 bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50'
                        }`}
                      >
                        {t(tab.labelKey)}

                        {tabCounts[tab.value] > 0 && (
                          <span
                            className={`rounded-full px-1.5 text-[10px] ${
                              active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {tabCounts[tab.value]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={refreshAfterAction}
                  disabled={loading}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-60"
                >
                  <FaRedo aria-hidden="true" className={loading ? 'animate-spin' : ''} />

                  {t('travel.common.refresh')}
                </button>
              </div>

              {loading && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-16 text-center shadow-sm">
                  <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
                    <FaRedo className="animate-spin" />
                  </div>

                  <p className="mt-3 text-sm font-bold text-slate-500">
                    {t('travel.common.loading')}
                  </p>
                </div>
              )}

              {!loading && reminders.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center shadow-sm">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <FaBell />
                  </div>

                  <p className="mt-3 text-sm font-bold text-slate-500">
                    {t('travel.reminders.empty')}
                  </p>
                </div>
              )}

              {!loading && reminders.length > 0 && (
                <>
                  <DesktopReminderTable
                    reminders={reminders}
                    actionId={actionId}
                    onWhatsApp={handleWhatsApp}
                    onEmail={handleEmail}
                    onOpenBooking={openBooking}
                    onRead={handleRead}
                  />

                  <MobileReminderCards
                    reminders={reminders}
                    actionId={actionId}
                    onWhatsApp={handleWhatsApp}
                    onEmail={handleEmail}
                    onOpenBooking={openBooking}
                    onRead={handleRead}
                  />
                </>
              )}
            </main>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TravelReminderCenter;
