import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaCheck,
  FaEnvelope,
  FaExternalLinkAlt,
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

const EMPTY_SUMMARY = {
  attentionCount: 0,
  dueCount: 0,
  upcomingCount: 0,
  failedEmailCount: 0,
  nextReminder: null,
};

const reminderTabs = [
  { value: 'due', labelKey: 'travel.reminders.tabs.due' },
  { value: 'upcoming', labelKey: 'travel.reminders.tabs.upcoming' },
  { value: 'failed', labelKey: 'travel.reminders.tabs.failed' },
  { value: 'completed', labelKey: 'travel.reminders.tabs.completed' },
];

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
    englishTemplate: settings.englishTemplate || '',
    urduTemplate: settings.urduTemplate || '',
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

const leadLabel = (minutes = 0) => {
  const preset = TRAVEL_REMINDER_LEAD_PRESETS.find(
    (option) => option.value !== 'custom' && option.minutes === Number(minutes)
  );

  if (preset) {
    return t(preset.labelKey);
  }

  return `${Number(minutes || 0).toLocaleString('en-GB')} ${t('travel.reminders.minutes')}`;
};

const ToggleField = ({ checked, onChange, labelKey, disabled = false }) => (
  <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
    <span className="text-xs font-extrabold text-slate-700">{t(labelKey)}</span>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-cyan-600 disabled:cursor-not-allowed"
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
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>

      {settings.leadPreset === 'custom' && (
        <label className="block max-w-[160px]">
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
              onChange({
                ...value,
                leadPreset: 'custom',
                [leadField]: Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : 0,
                leadMinutes: Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : 0,
              });
            }}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
        </label>
      )}
    </div>
  );
};

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
            onChange={(checked) => updateSettings({ enabled: checked })}
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
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
            onChange={(checked) => updateSettings({ emailEnabled: checked })}
          />

          <ToggleField
            checked={effectiveSettings.whatsappEnabled}
            disabled={controlsDisabled || !effectiveSettings.enabled}
            labelKey="travel.reminders.whatsappManual"
            onChange={(checked) => updateSettings({ whatsappEnabled: checked })}
          />
        </div>
      </div>
    </section>
  );
};

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
      className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-[11px] font-extrabold ${
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
    slate: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
    cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    rose: 'border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variants[variant] || variants.slate
      }`}
    >
      <Icon aria-hidden="true" />
    </button>
  );
};

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
        fetchTravelReminders({ status: activeTab }),
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

      const saved = await updateTravelReminderSettings({
        automaticRemindersEnabled: settingsDraft.automaticRemindersEnabled,
        defaultLeadMinutes: settingsDraft.defaultLeadMinutes,
        emailEnabled: settingsDraft.emailEnabled,
        whatsappEnabled: settingsDraft.whatsappEnabled,
        englishTemplate: settingsDraft.englishTemplate,
        urduTemplate: settingsDraft.urduTemplate,
      });

      setSettingsDraft(normalizeSettingsDraft(saved));
      await onSummaryRefresh?.({ forceRefresh: true });
    } catch (error) {
      console.error('Travel reminder settings save failed:', error);
      setCenterError(error?.response?.data?.message || t('travel.reminders.settingsSaveFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const refreshAfterAction = async () => {
    await Promise.all([loadCenter(), onSummaryRefresh?.({ forceRefresh: true })]);
  };

  const handleEmail = async (reminder) => {
    try {
      setActionId(reminder._id);
      setCenterError('');
      await sendTravelReminderEmail(reminder._id);
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-3 py-4">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-sky-50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-sm">
              <FaBell aria-hidden="true" />
              {normalizedSummary.attentionCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-black text-white">
                  {normalizedSummary.attentionCount}
                </span>
              )}
            </span>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-slate-950">
                {t('travel.reminders.centerTitle')}
              </h2>
              <p className="text-xs font-bold text-slate-500">
                {t('travel.reminders.centerSubtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title={t('travel.common.close')}
            aria-label={t('travel.common.close')}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {centerError && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {centerError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-black text-amber-700">
                      {normalizedSummary.dueCount || 0}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">
                      {t('travel.reminders.dueNow')}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-cyan-700">
                      {normalizedSummary.upcomingCount || 0}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">
                      {t('travel.reminders.upcoming')}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-rose-700">
                      {normalizedSummary.failedEmailCount || 0}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">
                      {t('travel.reminders.failedEmail')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">
                    {t('travel.reminders.businessDefaults')}
                  </h3>
                  {canManageSettings && (
                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={savingSettings}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-100 bg-cyan-50 px-2.5 text-xs font-extrabold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
                    >
                      <FaSave aria-hidden="true" />
                      {savingSettings ? t('travel.common.saving') : t('travel.common.save')}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <ToggleField
                    checked={settingsDraft.automaticRemindersEnabled}
                    disabled={!canManageSettings}
                    labelKey="travel.reminders.automaticReminders"
                    onChange={(checked) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        automaticRemindersEnabled: checked,
                      }))
                    }
                  />
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-extrabold text-slate-500">
                      {t('travel.reminders.defaultTiming')}
                    </p>
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
                    onChange={(checked) =>
                      setSettingsDraft((current) => ({ ...current, emailEnabled: checked }))
                    }
                  />
                  <ToggleField
                    checked={settingsDraft.whatsappEnabled}
                    disabled={!canManageSettings}
                    labelKey="travel.reminders.whatsappManual"
                    onChange={(checked) =>
                      setSettingsDraft((current) => ({ ...current, whatsappEnabled: checked }))
                    }
                  />
                  <label className="block">
                    <span className="mb-1 block text-xs font-extrabold text-slate-500">
                      {t('travel.reminders.englishTemplate')}
                    </span>
                    <textarea
                      rows={4}
                      disabled={!canManageSettings}
                      value={settingsDraft.englishTemplate}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          englishTemplate: event.target.value,
                        }))
                      }
                      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-extrabold text-slate-500">
                      {t('travel.reminders.urduTemplate')}
                    </span>
                    <textarea
                      rows={4}
                      disabled={!canManageSettings}
                      dir="rtl"
                      value={settingsDraft.urduTemplate}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          urduTemplate: event.target.value,
                        }))
                      }
                      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
                    />
                  </label>
                </div>
              </div>
            </aside>

            <main className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {reminderTabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setActiveTab(tab.value)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-extrabold transition ${
                        activeTab === tab.value
                          ? 'border-cyan-600 bg-cyan-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {t(tab.labelKey)}
                      {tabCounts[tab.value] > 0 && (
                        <span className="rounded-full bg-white/25 px-1.5 text-[10px]">
                          {tabCounts[tab.value]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={refreshAfterAction}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <FaRedo aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                  {t('travel.common.refresh')}
                </button>
              </div>

              {loading && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm font-bold text-slate-500">
                  {t('travel.common.loading')}
                </div>
              )}

              {!loading && reminders.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-500">
                  {t('travel.reminders.empty')}
                </div>
              )}

              {!loading &&
                reminders.map((reminder) => (
                  <article
                    key={reminder._id}
                    className={`rounded-xl border bg-white p-3 shadow-sm ${
                      reminder.isRead ? 'border-slate-200' : 'border-amber-200'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-black text-slate-950">
                            {reminder.customerName || '-'}
                          </h3>
                          <StatusPill tone={reminder.isRead ? 'slate' : 'amber'}>
                            {reminder.isRead
                              ? t('travel.reminders.read')
                              : t('travel.reminders.unread')}
                          </StatusPill>
                          <StatusPill
                            tone={
                              reminder.emailStatus === 'failed'
                                ? 'rose'
                                : reminder.emailStatus === 'sent'
                                  ? 'emerald'
                                  : 'slate'
                            }
                          >
                            {t(
                              `travel.reminders.emailStatus.${reminder.emailStatus || 'disabled'}`
                            )}
                          </StatusPill>
                        </div>

                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {reminder.bookingNumber || '-'} · {reminder.eventLabel || '-'}
                        </p>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 md:grid-cols-3">
                          <span>
                            {t('travel.reminders.event')}: {formatDateTime(reminder.eventDateTime)}
                          </span>
                          <span>
                            {t('travel.reminders.remindAt')}: {formatDateTime(reminder.remindAt)}
                          </span>
                          <span>
                            {t('travel.reminders.timingLabel')}: {leadLabel(reminder.leadMinutes)}
                          </span>
                        </div>

                        {reminder.emailError && (
                          <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">
                            {reminder.emailError}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                        {reminder.whatsappEnabled && (
                          <ReminderIconButton
                            icon={FaWhatsapp}
                            title={t('travel.reminders.whatsappAction')}
                            onClick={() => handleWhatsApp(reminder)}
                            disabled={actionId === reminder._id}
                            variant="emerald"
                          />
                        )}
                        {reminder.emailEnabled && (
                          <ReminderIconButton
                            icon={reminder.emailStatus === 'failed' ? FaRedo : FaEnvelope}
                            title={t('travel.reminders.sendEmail')}
                            onClick={() => handleEmail(reminder)}
                            disabled={actionId === reminder._id || reminder.emailStatus === 'sent'}
                            variant="cyan"
                          />
                        )}
                        <ReminderIconButton
                          icon={FaExternalLinkAlt}
                          title={t('travel.reminders.openBooking')}
                          onClick={() => openBooking(reminder)}
                        />
                        {!reminder.isRead && (
                          <ReminderIconButton
                            icon={FaCheck}
                            title={t('travel.reminders.markRead')}
                            onClick={() => handleRead(reminder)}
                            disabled={actionId === reminder._id}
                            variant="slate"
                          />
                        )}
                      </div>
                    </div>
                  </article>
                ))}
            </main>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TravelReminderCenter;
