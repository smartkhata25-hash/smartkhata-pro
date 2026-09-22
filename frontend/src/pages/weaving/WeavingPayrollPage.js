import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FaBan,
  FaCalendarAlt,
  FaCheck,
  FaChevronDown,
  FaCoins,
  FaFileInvoiceDollar,
  FaEye,
  FaHistory,
  FaInfoCircle,
  FaMoneyBillWave,
  FaPen,
  FaPlus,
  FaReceipt,
  FaRedo,
  FaRegClock,
  FaSave,
  FaStepBackward,
  FaStepForward,
  FaSync,
  FaTimes,
  FaUserCheck,
  FaUsers,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';
import { getValidPaymentAccounts } from '../../services/accountService';
import {
  earlyCloseWeavingPayrollCycle,
  finalizeWeavingPayroll,
  finalizeWeavingPayrollCycle,
  generateWeavingPayrollCycle,
  getWeavingPayrollCycle,
  payWeavingPayroll,
  resumeWeavingPayrollCycle,
  restoreWeavingPayroll,
  updateWeavingPayroll,
  voidWeavingPayroll,
} from '../../services/weavingPayrollService';
import {
  formatBusinessDateForDisplay,
  formatDateWithOptionalTime,
  formatTimestampForDisplay,
  getBusinessDateInputValue,
  getBusinessTimeInputValue,
} from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';

const CYCLE_KEY_PATTERN = /^(\d{4})-(\d{2})-H([12])$/;

const EMPTY_ENTRY_FORM = {
  type: 'other',
  amount: '',
  description: '',
};

const classNames = (...values) => values.filter(Boolean).join(' ');

const money = (value) => {
  const amount = Number(value || 0);

  return amount.toLocaleString('en-GB', {
    maximumFractionDigits: 2,
  });
};

const numberLabel = (value) =>
  Number(value || 0).toLocaleString('en-GB', {
    maximumFractionDigits: 2,
  });

const getDateParts = (dateKey = '') => {
  const [year, month, day] = String(dateKey || '')
    .slice(0, 10)
    .split('-')
    .map(Number);

  return { year, month, day };
};

const buildDateKey = (year, month, day) =>
  [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');

const getMonthLastDay = (year, month) => new Date(year, month, 0).getDate();

const parseCycleKey = (cycleKey) => {
  const match = String(cycleKey || '').match(CYCLE_KEY_PATTERN);

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    half: match[3] === '2' ? 'H2' : 'H1',
  };
};

const getCurrentCycleKey = () => {
  const dateKey = getBusinessDateInputValue();
  const [, month, day] = dateKey.split('-').map(Number);

  return `${dateKey.slice(0, 4)}-${String(month).padStart(2, '0')}-H${day <= 15 ? 1 : 2}`;
};

const shiftCycleKey = (cycleKey, delta) => {
  const parsed = parseCycleKey(cycleKey) || parseCycleKey(getCurrentCycleKey());

  let { year, month, half } = parsed;
  let steps = Number(delta || 0);

  while (steps > 0) {
    if (half === 'H1') {
      half = 'H2';
    } else {
      half = 'H1';
      month += 1;

      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    steps -= 1;
  }

  while (steps < 0) {
    if (half === 'H2') {
      half = 'H1';
    } else {
      half = 'H2';
      month -= 1;

      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }

    steps += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}-${half}`;
};

const resolveCycleFromKey = (cycleKey) => {
  const parsed = parseCycleKey(cycleKey);

  if (!parsed) return {};

  const nextMonth =
    parsed.month === 12
      ? {
          year: parsed.year + 1,
          month: 1,
        }
      : {
          year: parsed.year,
          month: parsed.month + 1,
        };

  return {
    key: cycleKey,

    periodStart: buildDateKey(parsed.year, parsed.month, parsed.half === 'H1' ? 1 : 16),

    periodEnd: buildDateKey(
      parsed.year,
      parsed.month,
      parsed.half === 'H1' ? 15 : getMonthLastDay(parsed.year, parsed.month)
    ),

    dueDate: buildDateKey(
      parsed.half === 'H1' ? parsed.year : nextMonth.year,
      parsed.half === 'H1' ? parsed.month : nextMonth.month,
      parsed.half === 'H1' ? 22 : 7
    ),
  };
};

const formatPeriodRange = (start, end) => {
  if (!start || !end) return '';

  const startParts = getDateParts(start);
  const endParts = getDateParts(end);

  const startText = formatBusinessDateForDisplay(start);
  const endText = formatBusinessDateForDisplay(end);

  if (startParts.month === endParts.month && startParts.year === endParts.year) {
    return `${String(startParts.day).padStart(2, '0')}–${endText}`;
  }

  return `${startText} – ${endText}`;
};

const getEmployee = (payroll = {}) =>
  payroll.employee ||
  (payroll.employeeId && typeof payroll.employeeId === 'object' ? payroll.employeeId : {});

const getEmployeeName = (payroll = {}) => getEmployee(payroll)?.name || t('weaving.payroll.none');

const getEmployeeNo = (payroll = {}) =>
  getEmployee(payroll)?.employeeNo || payroll.employeeNo || t('weaving.payroll.noEmployeeNo');

const getEmployeeMeta = (payroll = {}) => {
  const employee = getEmployee(payroll);

  const parts = [
    employee.unitName || (employee.unitNo ? `${t('weaving.payroll.unit')} ${employee.unitNo}` : ''),
    employee.departmentName,
    employee.designationName,
  ].filter(Boolean);

  return parts.join(' / ');
};

const getInitials = (name = '') =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'SK';

const getStatusTone = (status) => {
  const tones = {
    draft: 'border-slate-200 bg-slate-50 text-slate-700',
    due: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    overdue: 'border-rose-200 bg-rose-50 text-rose-700',
    partially_paid: 'border-amber-200 bg-amber-50 text-amber-800',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    void: 'border-slate-200 bg-slate-100 text-slate-500',
  };

  return tones[status] || tones.draft;
};

const statusLabel = (payroll = {}) => {
  const status = payroll.displayStatus || payroll.status || 'draft';
  const key = `weaving.payroll.status.${status}`;
  const value = t(key);

  return value === key ? status.replace(/_/g, ' ') : value;
};

const getBalanceTone = (payroll = {}) => {
  const remaining = Number(payroll.remainingDue || 0);

  if (remaining <= 0) {
    return 'bg-emerald-50/70 text-emerald-800';
  }

  if ((payroll.displayStatus || payroll.status) === 'overdue') {
    return 'bg-rose-50/80 text-rose-800';
  }

  return 'bg-amber-50/80 text-amber-900';
};

const findDefaultPaymentAccount = (accounts = []) =>
  accounts.find((account) => String(account.code || '').toUpperCase() === 'HANDCASH') ||
  accounts.find((account) =>
    String(account.name || '')
      .toUpperCase()
      .includes('HANDCASH')
  ) ||
  accounts[0] ||
  null;

const getAccountLabel = (account = {}) =>
  [account.name || account.code, account.code ? `(${account.code})` : ''].filter(Boolean).join(' ');

const getPaymentHistoryAccountLabel = (item = {}) =>
  item.paymentAccountId && typeof item.paymentAccountId === 'object'
    ? getAccountLabel(item.paymentAccountId)
    : item.paymentType || '-';

const getErrorMessage = (error, fallbackKey) =>
  error?.response?.data?.message || error?.message || t(fallbackKey);

const fieldClass =
  'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100';

const textareaClass =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100';

const labelClass = 'text-xs font-black uppercase text-slate-500';

const StatChip = ({ labelKey, value, tone = 'slate', icon: Icon }) => {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-700',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
  };

  return (
    <span
      className={classNames(
        'inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 text-xs font-extrabold shadow-sm',
        tones[tone] || tones.slate
      )}
    >
      {Icon ? <Icon className="shrink-0" /> : null}

      <span className="whitespace-nowrap">{t(labelKey)}</span>

      <span className="text-sm font-black tabular-nums md:text-base">{value}</span>
    </span>
  );
};

const IconButton = ({ title, icon: Icon, tone = 'slate', disabled, onClick }) => {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-40',
        tones[tone] || tones.slate
      )}
    >
      <Icon />
    </button>
  );
};

const BreakdownPopover = ({ id, title, items = [], children, activeId, onOpenChange }) => {
  const open = activeId === id;

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const visibleItems = items.filter(
    (item) => item && item.value !== undefined && item.value !== null && item.value !== ''
  );

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();

    const width = Math.min(272, Math.max(228, window.innerWidth - 24));

    const left = Math.min(Math.max(rect.left, 12), window.innerWidth - width - 12);

    setPosition({
      top: rect.bottom + 6,
      left,
      width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const close = () => onOpenChange('');

    const handleOutside = (event) => {
      const clickedButton = buttonRef.current?.contains(event.target);
      const clickedPanel = panelRef.current?.contains(event.target);

      if (!clickedButton && !clickedPanel) {
        close();
      }
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, onOpenChange]);

  if (!visibleItems.length) {
    return children;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(open ? '' : id);
        }}
        className="group inline-flex max-w-full items-center justify-center gap-1 rounded-lg text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
      >
        {children}

        <FaChevronDown
          className={classNames(
            'text-[9px] text-slate-400 transition-transform group-hover:text-cyan-700',
            open && 'rotate-180 text-cyan-700'
          )}
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-2xl shadow-slate-900/20"
              style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${position.width || 272}px`,
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 px-3 py-2 text-xs font-black uppercase tracking-wide text-white">
                {title}
              </div>

              <div className="p-2">
                {visibleItems.map((item, index) => (
                  <div
                    key={`${title}-${item.label}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 odd:bg-slate-50"
                  >
                    <span className="text-xs font-bold text-slate-500">{item.label}</span>

                    <span className="text-right text-xs font-black tabular-nums text-slate-950">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};

const ModalShell = ({ title, subtitle, children, footer, onClose, size = 'max-w-4xl' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3">
    <div className={classNames('w-full overflow-hidden rounded-xl bg-white shadow-2xl', size)}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900">{title}</h2>

          {subtitle ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
          ) : null}
        </div>

        <button
          type="button"
          title={t('weaving.payroll.close')}
          aria-label={t('weaving.payroll.close')}
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
        >
          <FaTimes />
        </button>
      </div>

      <div className="max-h-[72vh] overflow-y-auto px-4 py-4">{children}</div>

      {footer ? <div className="border-t border-slate-200 bg-white px-4 py-3">{footer}</div> : null}
    </div>
  </div>
);

const Section = ({ title, icon: Icon, children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
      {Icon ? <Icon className="text-cyan-700" /> : null}

      {title}
    </div>

    {children}
  </section>
);

const DetailLine = ({ labelKey, label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-slate-50 text-slate-900',
    cyan: 'bg-cyan-50 text-cyan-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-900',
  };

  return (
    <div
      className={classNames(
        'rounded-lg border border-slate-200 px-3 py-2',
        tones[tone] || tones.slate
      )}
    >
      <div className="text-[11px] font-bold uppercase text-slate-500">{label || t(labelKey)}</div>
      <div className="mt-1 break-words text-sm font-black">{value}</div>
    </div>
  );
};

const EntryList = ({ entries = [], emptyKey }) => {
  if (!entries.length) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
        {t(emptyKey)}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div
          key={`${entry.description || entry.reason || 'entry'}-${index}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-800">
              {entry.description || entry.reason || t('weaving.payroll.manualAdjustment')}
            </div>

            {entry.type ? (
              <div className="text-xs font-semibold capitalize text-slate-500">{entry.type}</div>
            ) : null}
          </div>

          <div className="shrink-0 text-sm font-black tabular-nums text-slate-900">
            {money(entry.amount)}
          </div>
        </div>
      ))}
    </div>
  );
};

const PaymentHistory = ({ payments = [] }) => {
  if (!payments.length) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
        {t('weaving.payroll.noPaymentsYet')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((payment, index) => (
        <div
          key={`${payment.paidAt || payment.paymentDate || 'payment'}-${index}`}
          className="rounded-lg border border-slate-200 px-3 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black tabular-nums text-emerald-700">
              {money(payment.amount)}
            </div>

            <div className="text-xs font-bold text-slate-500">
              {formatDateWithOptionalTime(payment.paymentDate, payment.paymentTime)}
            </div>
          </div>

          <div className="mt-1 grid gap-1 text-xs font-semibold text-slate-500 sm:grid-cols-2">
            <span>{getPaymentHistoryAccountLabel(payment)}</span>

            <span>
              {payment.receivedBy === 'other'
                ? `${t('weaving.payroll.otherPerson')}: ${payment.receiverName || '-'}`
                : t('weaving.payroll.self')}
            </span>

            {payment.receiverPhone ? <span>{payment.receiverPhone}</span> : null}
            {payment.paidAt ? <span>{formatTimestampForDisplay(payment.paidAt)}</span> : null}
          </div>

          {payment.note ? (
            <div className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
              {payment.note}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const EarlyCloseModal = ({
  cycle,
  draftCount,
  throughDate,
  reason,
  saving,
  error,
  onReasonChange,
  onClose,
  onConfirm,
}) => (
  <ModalShell
    title={t('weaving.payroll.earlyClose.title')}
    subtitle={t('weaving.payroll.earlyClose.subtitle')}
    onClose={onClose}
    size="max-w-2xl"
    footer={
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || !String(reason || '').trim()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-sm font-black text-white shadow-md shadow-amber-950/10 transition hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FaRegClock />
          {t('weaving.payroll.earlyClose.confirm')}
        </button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <DetailLine
          label={t('weaving.payroll.earlyClose.originalCycle')}
          value={formatPeriodRange(cycle?.periodStart, cycle?.periodEnd) || cycle?.key || '-'}
        />

        <DetailLine
          label={t('weaving.payroll.earlyClose.closeThrough')}
          value={formatBusinessDateForDisplay(throughDate)}
          tone="amber"
        />

        <DetailLine
          label={t('weaving.payroll.earlyClose.draftEmployees')}
          value={numberLabel(draftCount)}
          tone="cyan"
        />
      </div>

      <p className="flex items-start gap-2 text-sm font-semibold text-slate-600">
        <FaInfoCircle className="mt-0.5 shrink-0 text-amber-600" />
        <span>{t('weaving.payroll.earlyClose.warning')}</span>
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-black uppercase text-slate-500">
          {t('weaving.payroll.earlyClose.reason')}
        </span>

        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          placeholder={t('weaving.payroll.earlyClose.reasonPlaceholder')}
        />
      </label>

    </div>
  </ModalShell>
);

const ResumePayrollModal = ({
  cycle,
  resume,
  form,
  saving,
  error,
  onChange,
  onClose,
  onConfirm,
}) => (
  <ModalShell
    title={t('weaving.payroll.resume.title')}
    subtitle={t('weaving.payroll.resume.subtitle')}
    onClose={onClose}
    size="max-w-2xl"
    footer={
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || !form.resumeFrom}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-4 text-sm font-black text-white shadow-md shadow-cyan-950/10 transition hover:from-cyan-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FaSync />
          {t('weaving.payroll.resume.confirm')}
        </button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <DetailLine
          label={t('weaving.payroll.originalCycle')}
          value={formatPeriodRange(cycle?.originalPeriodStart, cycle?.originalPeriodEnd)}
        />

        <DetailLine
          label={t('weaving.payroll.resume.lastClosing')}
          value={formatBusinessDateForDisplay(resume?.lastClosingThroughDate)}
          tone="amber"
        />

        <DetailLine
          label={t('weaving.payroll.resume.nextClosing')}
          value={numberLabel(resume?.nextSegmentNo)}
          tone="cyan"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">
            {t('weaving.payroll.resume.from')}
          </span>
          <input
            type="date"
            value={form.resumeFrom}
            min={resume?.resumeFromMin || ''}
            max={resume?.maxResumeDate || ''}
            onChange={(event) => onChange({ ...form, resumeFrom: event.target.value })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">
            {t('weaving.payroll.resume.calculateThrough')}
          </span>
          <input
            type="date"
            value={form.calculateThrough}
            min={form.resumeFrom || resume?.resumeFromMin || ''}
            max={resume?.maxResumeDate || ''}
            onChange={(event) => onChange({ ...form, calculateThrough: event.target.value })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-black uppercase text-slate-500">
          {t('weaving.payroll.resume.note')}
        </span>
        <textarea
          value={form.note}
          onChange={(event) => onChange({ ...form, note: event.target.value })}
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          placeholder={t('weaving.payroll.resume.notePlaceholder')}
        />
      </label>

      <p className="text-sm font-semibold text-slate-600">{t('weaving.payroll.resume.warning')}</p>
    </div>
  </ModalShell>
);

const PayrollDetailsModal = ({ payroll, cycle, onClose }) => {
  if (!payroll) return null;

  const employee = getEmployee(payroll);

  return (
    <ModalShell
      title={getEmployeeName(payroll)}
      subtitle={formatPeriodRange(
        payroll.periodStart || cycle?.periodStart,
        payroll.periodEnd || cycle?.periodEnd
      )}
      onClose={onClose}
      size="max-w-5xl"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('weaving.payroll.employeePeriod')} icon={FaUserCheck}>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailLine labelKey="weaving.payroll.employeeNo" value={getEmployeeNo(payroll)} />

            <DetailLine
              labelKey="weaving.payroll.department"
              value={employee.departmentName || '-'}
            />

            <DetailLine
              labelKey="weaving.payroll.salary"
              value={money(payroll.salaryRateSnapshot)}
            />

            <DetailLine
              labelKey="weaving.payroll.payrollCycle"
              value={formatPeriodRange(
                payroll.periodStart || cycle?.periodStart,
                payroll.periodEnd || cycle?.periodEnd
              )}
            />
          </div>
        </Section>

        <Section title={t('weaving.payroll.attendance')} icon={FaCalendarAlt}>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailLine
              labelKey="weaving.payroll.present"
              value={numberLabel(payroll.presentDays)}
              tone="emerald"
            />

            <DetailLine
              labelKey="weaving.payroll.absent"
              value={numberLabel(payroll.absentDays)}
              tone="rose"
            />

            <DetailLine
              labelKey="weaving.payroll.leave"
              value={numberLabel(payroll.leaveDays)}
              tone="amber"
            />

            <DetailLine
              labelKey="weaving.payroll.paidLeave"
              value={numberLabel(payroll.paidLeaveDays)}
            />

            <DetailLine
              labelKey="weaving.payroll.unpaidLeave"
              value={numberLabel(payroll.unpaidLeaveDays)}
            />

            <DetailLine
              labelKey="weaving.payroll.weeklyOff"
              value={numberLabel(payroll.weeklyOffDaysInPeriod)}
            />
          </div>

          {payroll.attendanceIncomplete ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {t('weaving.payroll.attendanceIncomplete')}:{' '}
              {(payroll.missingAttendanceDates || []).join(', ')}
            </div>
          ) : null}
        </Section>

        <Section title={t('weaving.payroll.earnings')} icon={FaCoins}>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <DetailLine labelKey="weaving.payroll.baseSalary" value={money(payroll.baseSalary)} />

            <DetailLine
              labelKey="weaving.payroll.overtime"
              value={`${numberLabel(payroll.otHours)}h / ${money(payroll.otAmount)}`}
            />

            <DetailLine
              labelKey="weaving.payroll.doubleDuty"
              value={`${numberLabel(payroll.doubleDutyCount)} / ${money(payroll.doubleDutyAmount)}`}
            />

            <DetailLine
              labelKey="weaving.payroll.offDayWorked"
              value={money(payroll.offDayWorkedAmount)}
            />

            <DetailLine
              labelKey="weaving.payroll.totalAdditions"
              value={money(payroll.totalAdditions)}
              tone="emerald"
            />

            <DetailLine
              labelKey="weaving.payroll.grossSalary"
              value={money(payroll.grossSalary)}
              tone="cyan"
            />
          </div>

          <EntryList entries={payroll.additions || []} emptyKey="weaving.payroll.noAdjustments" />
        </Section>

        <Section title={t('weaving.payroll.deductions')} icon={FaReceipt}>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <DetailLine
              labelKey="weaving.payroll.absentDeduction"
              value={money(payroll.absentDeductionAmount)}
            />

            <DetailLine
              labelKey="weaving.payroll.unpaidLeaveDeduction"
              value={money(payroll.unpaidLeaveDeductionAmount)}
            />

            <DetailLine
              labelKey="weaving.payroll.openingBalance"
              value={money(payroll.openingBalanceRecovery?.amount)}
            />

            <DetailLine
              labelKey="weaving.payroll.totalDeductions"
              value={money(payroll.totalDeductions)}
              tone="rose"
            />
          </div>

          <EntryList entries={payroll.deductions || []} emptyKey="weaving.payroll.noAdjustments" />

          {(payroll.recoveryApplications || []).length ? (
            <div className="mt-3 space-y-2">
              {(payroll.recoveryApplications || []).map((entry, index) => (
                <div
                  key={`${entry.advanceLoanId || index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2"
                >
                  <span className="text-sm font-black text-slate-800">
                    {entry.kind === 'loan'
                      ? t('weaving.employeeFinance.loanInstallment')
                      : t('weaving.employeeFinance.advanceRecovery')}
                  </span>
                  <span className="text-sm font-black tabular-nums text-cyan-800">
                    {entry.isSkipped ? t('weaving.employeeFinance.skipped') : money(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title={t('weaving.payroll.payment')} icon={FaMoneyBillWave}>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailLine
              labelKey="weaving.payroll.netSalary"
              value={money(payroll.netSalary)}
              tone="cyan"
            />

            <DetailLine
              labelKey="weaving.payroll.paidAmount"
              value={money(payroll.paidAmount)}
              tone="emerald"
            />

            <DetailLine
              labelKey="weaving.payroll.remaining"
              value={money(payroll.remainingDue)}
              tone={Number(payroll.remainingDue || 0) > 0 ? 'amber' : 'emerald'}
            />

            <DetailLine labelKey="weaving.payroll.statusLabel" value={statusLabel(payroll)} />
          </div>
        </Section>

        <Section title={t('weaving.payroll.paymentHistory')} icon={FaHistory}>
          <PaymentHistory payments={payroll.paymentHistory || []} />
        </Section>
      </div>
    </ModalShell>
  );
};

const AdjustmentModal = ({ payroll, saving, error, onClose, onSave }) => {
  const [additions, setAdditions] = useState(payroll?.additions || []);
  const [deductions, setDeductions] = useState(payroll?.deductions || []);
  const [recoveries, setRecoveries] = useState(payroll?.recoveryApplications || []);
  const [notes, setNotes] = useState(payroll?.notes || '');
  const [earningForm, setEarningForm] = useState(EMPTY_ENTRY_FORM);

  const [deductionForm, setDeductionForm] = useState({
    amount: '',
    description: '',
  });

  const [localError, setLocalError] = useState('');
  useWeavingFeedback(localError, setLocalError, { type: 'error' });

  useEffect(() => {
    setAdditions(payroll?.additions || []);
    setDeductions(payroll?.deductions || []);
    setRecoveries(payroll?.recoveryApplications || []);
    setNotes(payroll?.notes || '');
    setEarningForm(EMPTY_ENTRY_FORM);

    setDeductionForm({
      amount: '',
      description: '',
    });

    setLocalError('');
  }, [payroll]);

  if (!payroll) return null;

  const addEarning = () => {
    const amount = Number(earningForm.amount || 0);

    if (amount <= 0 || !earningForm.description.trim()) {
      setLocalError(t('weaving.payroll.adjustmentRequired'));
      return;
    }

    setAdditions((current) => [
      ...current,
      {
        type: earningForm.type || 'other',
        amount,
        description: earningForm.description.trim(),
      },
    ]);

    setEarningForm(EMPTY_ENTRY_FORM);
    setLocalError('');
  };

  const addDeduction = () => {
    const amount = Number(deductionForm.amount || 0);

    if (amount <= 0 || !deductionForm.description.trim()) {
      setLocalError(t('weaving.payroll.adjustmentRequired'));
      return;
    }

    setDeductions((current) => [
      ...current,
      {
        amount,
        description: deductionForm.description.trim(),
      },
    ]);

    setDeductionForm({
      amount: '',
      description: '',
    });

    setLocalError('');
  };

  const removeEntry = (kind, index) => {
    if (kind === 'addition') {
      setAdditions((current) => current.filter((_, itemIndex) => itemIndex !== index));
    } else {
      setDeductions((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
  };

  const updateRecovery = (index, updates) => {
    setRecoveries((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...updates,
              isManualOverride: true,
            }
          : entry
      )
    );
  };

  const getRecoveryLabel = (entry) =>
    entry.kind === 'loan'
      ? t('weaving.employeeFinance.loanInstallment')
      : t('weaving.employeeFinance.advanceRecovery');

  const renderEditableEntries = (entries, kind) => (
    <div className="space-y-2">
      {entries.length ? (
        entries.map((entry, index) => (
          <div
            key={`${kind}-${entry.description || index}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-800">{entry.description}</div>

              {entry.type ? (
                <div className="text-xs font-bold capitalize text-slate-500">{entry.type}</div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-black tabular-nums text-slate-900">
                {money(entry.amount)}
              </span>

              <IconButton
                title={t('weaving.payroll.remove')}
                icon={FaTimes}
                tone="rose"
                onClick={() => removeEntry(kind, index)}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
          {t('weaving.payroll.noAdjustments')}
        </p>
      )}
    </div>
  );

  return (
    <ModalShell
      title={t('weaving.payroll.addAdjustment')}
      subtitle={getEmployeeName(payroll)}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 hover:bg-slate-50"
          >
            <FaTimes />
            {t('weaving.payroll.cancel')}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({
                additions,
                deductions,
                recoveryApplications: recoveries,
                notes,
              })
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-black text-white shadow-sm hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaSave />
            {t('weaving.payroll.saveAdjustments')}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-3 text-sm font-black text-slate-900">
            {t('weaving.payroll.earnings')}
          </h3>

          <div className="grid gap-2">
            <select
              value={earningForm.type}
              onChange={(event) =>
                setEarningForm((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
              className={fieldClass}
            >
              <option value="bonus">{t('weaving.payroll.adjustment.bonus')}</option>
              <option value="commission">{t('weaving.payroll.adjustment.commission')}</option>
              <option value="overtime">{t('weaving.payroll.adjustment.overtime')}</option>
              <option value="other">{t('weaving.payroll.adjustment.other')}</option>
            </select>

            <input
              type="number"
              min="0"
              step="0.01"
              value={earningForm.amount}
              onChange={(event) =>
                setEarningForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder={t('weaving.payroll.amount')}
              className={fieldClass}
            />

            <input
              type="text"
              value={earningForm.description}
              onChange={(event) =>
                setEarningForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder={t('weaving.payroll.reason')}
              className={fieldClass}
            />

            <button
              type="button"
              onClick={addEarning}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-700 hover:bg-emerald-100"
            >
              <FaPlus />
              {t('weaving.payroll.addEarning')}
            </button>
          </div>

          <div className="mt-3">{renderEditableEntries(additions, 'addition')}</div>
        </section>

        <section className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-3 text-sm font-black text-slate-900">
            {t('weaving.payroll.deductions')}
          </h3>

          <div className="grid gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={deductionForm.amount}
              onChange={(event) =>
                setDeductionForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder={t('weaving.payroll.amount')}
              className={fieldClass}
            />

            <input
              type="text"
              value={deductionForm.description}
              onChange={(event) =>
                setDeductionForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder={t('weaving.payroll.reason')}
              className={fieldClass}
            />

            <button
              type="button"
              onClick={addDeduction}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-black text-amber-800 hover:bg-amber-100"
            >
              <FaPlus />
              {t('weaving.payroll.addDeduction')}
            </button>
          </div>

          <div className="mt-3">{renderEditableEntries(deductions, 'deduction')}</div>
        </section>
      </div>

      {recoveries.length ? (
        <section className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/60 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900">
              {t('weaving.employeeFinance.employeeRecovery')}
            </h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-cyan-700 ring-1 ring-cyan-100">
              {t('weaving.payroll.netSalary')}:{' '}
              {money(Number(payroll.netSalary || 0) + Number(payroll.recoveryAmount || 0))}
            </span>
          </div>

          <div className="grid gap-2">
            {recoveries.map((entry, index) => (
              <div
                key={`${entry.advanceLoanId || index}`}
                className="grid gap-2 rounded-lg border border-white bg-white/90 p-3 sm:grid-cols-[minmax(180px,1fr)_140px_140px_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">
                    {getRecoveryLabel(entry)}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {t('weaving.employeeFinance.scheduled')}:{' '}
                    {money(entry.scheduledAmount || entry.amount)}
                  </p>
                </div>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={entry.isSkipped}
                  value={entry.isSkipped ? '0' : (entry.amount ?? '')}
                  onChange={(event) =>
                    updateRecovery(index, {
                      amount: Number(event.target.value || 0),
                      isSkipped: false,
                    })
                  }
                  className={fieldClass}
                />

                <button
                  type="button"
                  onClick={() =>
                    updateRecovery(index, {
                      amount: entry.isSkipped ? Number(entry.scheduledAmount || 0) : 0,
                      isSkipped: !entry.isSkipped,
                    })
                  }
                  className={`inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-black ${
                    entry.isSkipped
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {entry.isSkipped
                    ? t('weaving.employeeFinance.skipped')
                    : t('weaving.employeeFinance.skipThisCycle')}
                </button>

                <span className="text-xs font-bold text-slate-500">
                  {entry.isManualOverride
                    ? t('weaving.employeeFinance.manualOverride')
                    : t('weaving.employeeFinance.autoScheduled')}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <label className="mt-4 block">
        <span className={labelClass}>{t('weaving.payroll.paymentNote')}</span>

        <textarea
          rows="3"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={textareaClass}
        />
      </label>
    </ModalShell>
  );
};

const PayModal = ({ payroll, accounts, saving, error, onClose, onPay }) => {
  const defaultAccount = useMemo(() => findDefaultPaymentAccount(accounts), [accounts]);

  const [form, setForm] = useState({
    amount: '',
    paymentAccountId: '',
    paymentDate: getBusinessDateInputValue(),
    paymentTime: getBusinessTimeInputValue(),
    receivedBy: 'self',
    receiverName: '',
    receiverPhone: '',
    note: '',
  });

  const [localError, setLocalError] = useState('');
  useWeavingFeedback(localError, setLocalError, { type: 'error' });

  useEffect(() => {
    setForm({
      amount: payroll ? String(Number(payroll.remainingDue || 0)) : '',
      paymentAccountId: defaultAccount?._id || '',
      paymentDate: getBusinessDateInputValue(),
      paymentTime: getBusinessTimeInputValue(),
      receivedBy: 'self',
      receiverName: '',
      receiverPhone: '',
      note: '',
    });

    setLocalError('');
  }, [defaultAccount, payroll]);

  if (!payroll) return null;

  const setValue = (name, value) =>
    setForm((current) => ({
      ...current,
      [name]: value,
    }));

  const submit = (event) => {
    event.preventDefault();

    const amount = Number(form.amount || 0);
    const remaining = Number(payroll.remainingDue || 0);

    if (amount <= 0) {
      setLocalError(t('weaving.payroll.amountInvalid'));
      return;
    }

    if (amount > remaining) {
      setLocalError(t('weaving.payroll.payAmountTooHigh'));
      return;
    }

    if (!form.paymentAccountId) {
      setLocalError(t('weaving.payroll.paymentAccountRequired'));
      return;
    }

    if (form.receivedBy === 'other' && !form.receiverName.trim()) {
      setLocalError(t('weaving.payroll.receiverNameRequired'));
      return;
    }

    setLocalError('');

    onPay({
      amount,
      paymentAccountId: form.paymentAccountId,
      paymentDate: form.paymentDate,
      paymentTime: form.paymentTime,
      receivedBy: form.receivedBy,
      receiverName: form.receivedBy === 'other' ? form.receiverName.trim() : '',
      receiverPhone: form.receivedBy === 'other' ? form.receiverPhone.trim() : '',
      note: form.note,
    });
  };

  return (
    <ModalShell
      title={t('weaving.payroll.paySalary')}
      subtitle={getEmployeeName(payroll)}
      onClose={onClose}
      size="max-w-3xl"
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <DetailLine
          labelKey="weaving.payroll.netSalary"
          value={money(payroll.netSalary)}
          tone="cyan"
        />

        <DetailLine
          labelKey="weaving.payroll.alreadyPaid"
          value={money(payroll.paidAmount)}
          tone="emerald"
        />

        <DetailLine
          labelKey="weaving.payroll.balance"
          value={money(payroll.remainingDue)}
          tone="amber"
        />
      </div>

      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className={labelClass}>{t('weaving.payroll.amount')}</span>

            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setValue('amount', event.target.value)}
              className={fieldClass}
            />
          </label>

          <label>
            <span className={labelClass}>{t('weaving.payroll.paymentAccount')}</span>

            <select
              value={form.paymentAccountId}
              onChange={(event) => setValue('paymentAccountId', event.target.value)}
              className={fieldClass}
            >
              <option value="">{t('weaving.payroll.paymentAccountRequired')}</option>

              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {getAccountLabel(account)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className={labelClass}>{t('weaving.payroll.paymentDate')}</span>

            <input
              type="date"
              value={form.paymentDate}
              onChange={(event) => setValue('paymentDate', event.target.value)}
              className={fieldClass}
            />
          </label>

          <label>
            <span className={labelClass}>{t('weaving.payroll.paymentTime')}</span>

            <input
              type="time"
              value={form.paymentTime}
              onChange={(event) => setValue('paymentTime', event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <div>
          <span className={labelClass}>{t('weaving.payroll.salaryReceivedBy')}</span>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              ['self', t('weaving.payroll.self')],
              ['other', t('weaving.payroll.otherPerson')],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue('receivedBy', value)}
                className={classNames(
                  'inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-black transition',
                  form.receivedBy === value
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {form.receivedBy === 'other' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className={labelClass}>{t('weaving.payroll.receiverName')}</span>

              <input
                type="text"
                value={form.receiverName}
                onChange={(event) => setValue('receiverName', event.target.value)}
                className={fieldClass}
              />
            </label>

            <label>
              <span className={labelClass}>{t('weaving.payroll.receiverPhone')}</span>

              <input
                type="text"
                value={form.receiverPhone}
                onChange={(event) => setValue('receiverPhone', event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
        ) : null}

        <label>
          <span className={labelClass}>{t('weaving.payroll.paymentNote')}</span>

          <textarea
            rows="3"
            value={form.note}
            onChange={(event) => setValue('note', event.target.value)}
            className={textareaClass}
          />
        </label>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 hover:bg-slate-50"
          >
            <FaTimes />
            {t('weaving.payroll.cancel')}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaMoneyBillWave />
            {t('weaving.payroll.paySalary')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const SalaryBadge = ({ payroll }) => {
  const salaryType = payroll.salaryTypeSnapshot || '-';

  const typeKey = salaryType === 'monthly' ? 'weaving.payroll.monthly' : 'weaving.payroll.perDay';

  return (
    <div className="min-w-0 text-center">
      <div className="text-sm font-black tabular-nums tracking-tight text-slate-950">
        {money(payroll.salaryRateSnapshot)}
      </div>

      <span className="mt-1 inline-flex rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-700">
        {t(typeKey)}
      </span>
    </div>
  );
};

const WeavingPayrollPage = () => {
  const navigate = useNavigate();
  const [cycleKey, setCycleKey] = useState(getCurrentCycleKey());
  const [segmentNo, setSegmentNo] = useState('');
  const [recordState, setRecordState] = useState('active');
  const [cycleData, setCycleData] = useState(null);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [detailsPayroll, setDetailsPayroll] = useState(null);
  const [adjustmentPayroll, setAdjustmentPayroll] = useState(null);
  const [paymentPayroll, setPaymentPayroll] = useState(null);
  const [modalError, setModalError] = useState('');
  useWeavingFeedback(pageError, setPageError, { type: 'error' });
  useWeavingFeedback(modalError, setModalError, { type: 'error' });
  const [activePopover, setActivePopover] = useState('');
  const [earlyCloseOpen, setEarlyCloseOpen] = useState(false);
  const [earlyCloseReason, setEarlyCloseReason] = useState('');
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeForm, setResumeForm] = useState({
    resumeFrom: '',
    calculateThrough: '',
    note: '',
  });

  const canCreate = hasPermission('payroll.create');
  const canEdit = hasPermission('payroll.edit');
  const canPay = hasPermission('payroll.pay');
  const canDelete = hasPermission('payroll.delete');

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError('');

    try {
      const [payrollResponse, accountsResponse] = await Promise.all([
        getWeavingPayrollCycle({
          cycleKey,
          segmentNo,
          recordState,
        }),

        getValidPaymentAccounts({
          moduleScope: 'weaving',
        }),
      ]);

      setCycleData(payrollResponse || null);
      setPaymentAccounts(Array.isArray(accountsResponse) ? accountsResponse : []);
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.payroll.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [cycleKey, segmentNo, recordState]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setActivePopover('');
  }, [cycleKey, segmentNo]);

  useEffect(() => {
    if (detailsPayroll || adjustmentPayroll || paymentPayroll || earlyCloseOpen || resumeOpen) {
      setActivePopover('');
    }
  }, [detailsPayroll, adjustmentPayroll, paymentPayroll, earlyCloseOpen, resumeOpen]);

  const payrolls = Array.isArray(cycleData?.payrolls) ? cycleData.payrolls : [];
  const summary = cycleData?.summary || {};
  const cycle = cycleData?.cycle || {};
  const cycleOptions = Array.isArray(cycleData?.cycles) ? cycleData.cycles : [];
  const segments = Array.isArray(cycleData?.segments) ? cycleData.segments : [];
  const resume = cycleData?.resume || {};

  const draftRows = payrolls.filter((payroll) => payroll.status === 'draft');

  const eligibleDraftRows = draftRows.filter(
    (payroll) => !payroll.attendanceIncomplete && !(payroll.finalizeBlockedReasons || []).length
  );

  const hasDraftRows = draftRows.length > 0;
  const isFutureCycle = Boolean(cycle.isFuture);
  const isProvisional = Boolean(cycle.isProvisional);
  const isEarlyClosed = Boolean(
    cycle.earlyClosed || payrolls.some((payroll) => payroll.earlyClosed)
  );
  const effectiveProvisional = isProvisional && !isEarlyClosed;
  const draftThroughDates = [
    ...new Set(draftRows.map((payroll) => payroll.calculationThroughDate).filter(Boolean)),
  ];
  const earlyCloseThroughDate =
    cycle.earlyCloseThroughDate ||
    (draftThroughDates.length === 1 ? draftThroughDates[0] : cycle.calculationThroughDate || '');
  const canFinalizeCycle = !isProvisional && !isFutureCycle && !isEarlyClosed;
  const canEarlyClose = canEdit && effectiveProvisional && hasDraftRows && !isFutureCycle;
  const canResumePayroll = canEdit && Boolean(resume.canResume);

  const fallbackCycle = useMemo(() => resolveCycleFromKey(cycleKey), [cycleKey]);
  const displayCycle = cycle.periodStart ? cycle : fallbackCycle;

  const showSuccess = () => undefined;

  const applyCyclePayload = (payload) => {
    setCycleData(payload || null);

    if (payload?.cycle?.key) {
      setCycleKey(payload.cycle.key);
    }

    if (payload?.cycle?.segmentNo) {
      setSegmentNo(String(payload.cycle.segmentNo));
    }
  };

  const handleGenerate = async () => {
    if (isFutureCycle || isEarlyClosed) {
      return;
    }

    setSaving(true);
    setPageError('');

    try {
      const payload = await generateWeavingPayrollCycle({
        cycleKey,
        segmentNo: cycle.segmentNo || segmentNo,
      });

      applyCyclePayload(payload);

      showSuccess(
        hasDraftRows ? t('weaving.payroll.recalculated') : t('weaving.payroll.generated')
      );
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.payroll.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async (payroll) => {
    if (isProvisional) {
      setPageError(t('weaving.payroll.cannotFinalizeBeforeCycleEnd'));
      return;
    }

    if (!await requestWeavingConfirmation({ message: t('weaving.payroll.confirmFinalize') })) {
      return;
    }

    setSaving(true);
    setPageError('');

    try {
      const payload = await finalizeWeavingPayroll(payroll._id);

      applyCyclePayload(payload);
      showSuccess(t('weaving.payroll.finalizedMessage'));
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.payroll.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeAll = async () => {
    if (isProvisional) {
      setPageError(t('weaving.payroll.cannotFinalizeBeforeCycleEnd'));
      return;
    }

    if (!await requestWeavingConfirmation({ message: t('weaving.payroll.finalizeAllConfirm') })) {
      return;
    }

    setSaving(true);
    setPageError('');

    try {
      const payload = await finalizeWeavingPayrollCycle({
        cycleKey,
        segmentNo: cycle.segmentNo || segmentNo,
      });

      applyCyclePayload(payload);
      showSuccess(t('weaving.payroll.finalizedMessage'));
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.payroll.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openEarlyCloseModal = () => {
    setModalError('');
    setEarlyCloseReason('');
    setEarlyCloseOpen(true);
  };

  const handleEarlyClose = async () => {
    const reason = earlyCloseReason.trim();

    if (!reason) {
      setModalError(t('weaving.payroll.earlyClose.reasonRequired'));
      return;
    }

    setSaving(true);
    setModalError('');
    setPageError('');

    try {
      const payload = await earlyCloseWeavingPayrollCycle({
        cycleKey,
        segmentNo: cycle.segmentNo || segmentNo,
        reason,
      });

      applyCyclePayload(payload);
      setEarlyCloseOpen(false);
      setEarlyCloseReason('');
      showSuccess(
        `${t('weaving.payroll.earlyClose.successPrefix')} ${formatBusinessDateForDisplay(
          payload?.earlyCloseThroughDate ||
            payload?.cycle?.earlyCloseThroughDate ||
            earlyCloseThroughDate
        )}`
      );
    } catch (error) {
      setModalError(getErrorMessage(error, 'weaving.payroll.earlyClose.failed'));
    } finally {
      setSaving(false);
    }
  };

  const openResumeModal = () => {
    setModalError('');
    setResumeForm({
      resumeFrom: resume.resumeFromDefault || resume.resumeFromMin || '',
      calculateThrough: resume.calculateThroughDefault || '',
      note: '',
    });
    setResumeOpen(true);
  };

  const handleResumePayroll = async () => {
    setSaving(true);
    setModalError('');
    setPageError('');

    try {
      const payload = await resumeWeavingPayrollCycle({
        cycleKey,
        resumeFrom: resumeForm.resumeFrom,
        calculateThrough: resumeForm.calculateThrough,
        note: resumeForm.note,
      });

      applyCyclePayload(payload);
      setResumeOpen(false);
      showSuccess(t('weaving.payroll.resume.success'));
    } catch (error) {
      setModalError(getErrorMessage(error, 'weaving.payroll.resume.failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustmentSave = async (payload) => {
    if (!adjustmentPayroll) {
      return;
    }

    setSaving(true);
    setModalError('');

    try {
      const result = await updateWeavingPayroll(adjustmentPayroll._id, payload);

      applyCyclePayload(result);
      setAdjustmentPayroll(null);
      showSuccess(t('weaving.payroll.adjusted'));
    } catch (error) {
      setModalError(getErrorMessage(error, 'weaving.payroll.adjustmentRequired'));
    } finally {
      setSaving(false);
    }
  };

  const handlePay = async (payload) => {
    if (!paymentPayroll) {
      return;
    }

    setSaving(true);
    setModalError('');

    try {
      const result = await payWeavingPayroll(paymentPayroll._id, payload);

      applyCyclePayload(result);
      setPaymentPayroll(null);
      showSuccess(t('weaving.payroll.paymentSaved'));
    } catch (error) {
      setModalError(getErrorMessage(error, 'weaving.payroll.paymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (payroll) => {
    const reason = await requestWeavingConfirmation({
      message: t('weaving.payroll.voidReason'),
      inputLabel: t('weaving.payroll.voidReason'),
      inputRequired: true,
    });

    if (!reason) {
      return;
    }

    setSaving(true);
    setPageError('');

    try {
      const payload = await voidWeavingPayroll(payroll._id, {
        reason,
      });

      applyCyclePayload(payload);
      showSuccess(t('weaving.payroll.voided'));
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.payroll.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (payroll) => {
    if (!await requestWeavingConfirmation({ message: t('weaving.payroll.restoreConfirm') })) return;

    setSaving(true);
    setPageError('');
    try {
      const payload = await restoreWeavingPayroll(payroll._id);
      setRecordState('active');
      applyCyclePayload(payload);
      showSuccess(t('weaving.payroll.restored'));
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.payroll.restoreFailed'));
    } finally {
      setSaving(false);
    }
  };

  const periodTitle =
    formatPeriodRange(displayCycle.periodStart, displayCycle.periodEnd) || cycleKey;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 text-slate-900">
      <section className="w-full overflow-hidden border-y border-slate-200 bg-white shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-slate-950 via-cyan-600 to-emerald-500" />

        <div className="flex flex-col gap-3 px-3 py-3 md:px-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-950 via-slate-800 to-cyan-700 text-white shadow-md shadow-cyan-950/10 ring-1 ring-cyan-200">
                <FaMoneyBillWave />
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="text-2xl font-black leading-none text-slate-950 md:text-3xl">
                    {periodTitle}
                  </h1>

                  <span className="whitespace-nowrap text-sm font-black text-slate-500 md:text-base">
                    {t('weaving.payroll.due')}: {formatBusinessDateForDisplay(displayCycle.dueDate)}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                  {isEarlyClosed ? (
                    <span
                      title={cycle.earlyCloseReason || undefined}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-black text-amber-900"
                    >
                      <FaRegClock />
                      {t('weaving.payroll.earlyClosed')}
                    </span>
                  ) : null}

                  {effectiveProvisional ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-black text-amber-800">
                      <FaRegClock />
                      {t('weaving.payroll.provisional')}
                    </span>
                  ) : null}

                  {isEarlyClosed && cycle.earlyCloseThroughDate ? (
                    <span>
                      {t('weaving.payroll.through')}{' '}
                      {formatBusinessDateForDisplay(cycle.earlyCloseThroughDate)}
                    </span>
                  ) : null}

                  {effectiveProvisional && cycle.calculationThroughDate ? (
                    <span>
                      {t('weaving.payroll.through')}{' '}
                      {formatBusinessDateForDisplay(cycle.calculationThroughDate)}
                    </span>
                  ) : null}

                  {cycle.segmentNo ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-cyan-100 bg-cyan-50 px-2 py-0.5 font-black text-cyan-800">
                      {cycle.segmentNo > 1
                        ? `${t('weaving.payroll.continuation')} ${cycle.segmentNo}`
                        : `${t('weaving.payroll.closing')} ${cycle.segmentNo}`}
                    </span>
                  ) : null}

                  {cycle.originalPeriodStart && cycle.originalPeriodEnd ? (
                    <span>
                      {t('weaving.payroll.originalCycle')}:{' '}
                      {formatPeriodRange(cycle.originalPeriodStart, cycle.originalPeriodEnd)}
                    </span>
                  ) : null}

                  {isFutureCycle ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-black text-slate-600">
                      <FaInfoCircle />
                      {t('weaving.payroll.futureCycle')}
                    </span>
                  ) : null}

                  {isFutureCycle ? <span>{t('weaving.payroll.cycleNotStarted')}</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            <StatChip
              labelKey="weaving.payroll.employees"
              value={summary.employees || 0}
              icon={FaUsers}
            />

            <StatChip
              labelKey="weaving.payroll.netSalary"
              value={money(summary.netPayroll)}
              tone="cyan"
              icon={FaCoins}
            />

            <StatChip
              labelKey="weaving.payroll.paidAmount"
              value={money(summary.paid)}
              tone="emerald"
              icon={FaMoneyBillWave}
            />

            <StatChip
              labelKey="weaving.payroll.balance"
              value={money(summary.remaining)}
              tone="amber"
              icon={FaReceipt}
            />

            <StatChip
              labelKey="weaving.payroll.overdue"
              value={summary.overdue || 0}
              tone="rose"
              icon={FaRegClock}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 md:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <IconButton
                title={t('weaving.payroll.previousCycle')}
                icon={FaStepBackward}
                onClick={() => {
                  setCycleKey((current) => shiftCycleKey(current, -1));
                  setSegmentNo('');
                }}
              />

              <IconButton
                title={t('weaving.payroll.nextCycle')}
                icon={FaStepForward}
                onClick={() => {
                  setCycleKey((current) => shiftCycleKey(current, 1));
                  setSegmentNo('');
                }}
              />
            </div>

            <label className="flex min-w-0 items-center gap-2">
              <span className="sr-only">{t('weaving.payroll.payrollCycle')}</span>

              <FaCalendarAlt className="shrink-0 text-cyan-700" />

              {cycleOptions.length ? (
                <select
                  value={cycle.key || cycleKey}
                  onChange={(event) => {
                    setCycleKey(event.target.value);
                    setSegmentNo('');
                  }}
                  className="h-10 min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  {cycleOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {formatPeriodRange(item.periodStart, item.periodEnd) ||
                        item.label ||
                        item.key}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={cycleKey}
                  onChange={(event) => {
                    setCycleKey(event.target.value.toUpperCase());
                    setSegmentNo('');
                  }}
                  className="h-10 w-36 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              )}
            </label>

            {segments.length > 1 ? (
              <label className="flex min-w-0 items-center gap-2">
                <span className="sr-only">{t('weaving.payroll.currentSegment')}</span>
                <FaChevronDown className="shrink-0 text-cyan-700" />
                <select
                  value={String(cycle.segmentNo || segmentNo || 1)}
                  onChange={(event) => setSegmentNo(event.target.value)}
                  className="h-10 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  {segments.map((segment) => (
                    <option key={segment.segmentNo} value={segment.segmentNo}>
                      {segment.earlyClosed
                        ? `${t('weaving.payroll.closing')} ${segment.segmentNo} - ${formatBusinessDateForDisplay(segment.effectiveEnd)}`
                        : `${t('weaving.payroll.continuation')} ${segment.segmentNo} - ${formatPeriodRange(segment.segmentStart, segment.periodEnd)}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              {['active', 'inactive'].map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setRecordState(state)}
                  className={classNames(
                    'h-8 rounded-md px-3 text-xs font-black transition',
                    recordState === state
                      ? 'bg-cyan-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  {t(`travel.common.${state}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/weaving/reports?cycleKey=${cycle.baseCycleKey || cycle.key || cycleKey}&segmentNo=${cycle.segmentNo || segmentNo || 1}`
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <FaFileInvoiceDollar />
              {t('weaving.reports.report')}
            </button>

            {recordState === 'active' ? (
              <button
                type="button"
                disabled={saving || !canCreate || isFutureCycle || isEarlyClosed}
                onClick={handleGenerate}
                title={
                  isEarlyClosed
                    ? t('weaving.payroll.earlyClose.locked')
                    : isFutureCycle
                      ? t('weaving.payroll.futureCycleHelp')
                      : undefined
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 px-4 text-sm font-black text-cyan-800 shadow-sm transition hover:border-cyan-300 hover:from-cyan-100 hover:to-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaSync />
                {hasDraftRows
                  ? t('weaving.payroll.recalculate')
                  : t('weaving.payroll.generatePayroll')}
              </button>
            ) : null}

            {recordState === 'active' && canEarlyClose ? (
              <button
                type="button"
                disabled={saving}
                onClick={openEarlyCloseModal}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 text-sm font-black text-amber-800 shadow-sm transition hover:border-amber-300 hover:from-amber-100 hover:to-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaRegClock />
                {t('weaving.payroll.earlyClose.button')}
              </button>
            ) : null}

            {recordState === 'active' && canResumePayroll ? (
              <button
                type="button"
                disabled={saving}
                onClick={openResumeModal}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 text-sm font-black text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:from-emerald-100 hover:to-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaSync />
                {t('weaving.payroll.resume.button')}
              </button>
            ) : null}

            {recordState === 'active' ? (
              <button
                type="button"
                disabled={saving || !canEdit || !canFinalizeCycle || eligibleDraftRows.length === 0}
                onClick={handleFinalizeAll}
                title={
                  effectiveProvisional ? t('weaving.payroll.cannotFinalizeBeforeCycleEnd') : undefined
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-sm font-black text-white shadow-md shadow-emerald-950/10 transition hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaCheck />
                {t('weaving.payroll.finalizeAll')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="w-full overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[1180px] table-fixed border-collapse text-center text-[13px] font-semibold xl:min-w-full">
            <colgroup>
              <col className="w-[38px]" />
              <col className="w-[170px]" />
              <col className="w-[100px]" />
              <col className="w-[92px]" />
              <col className="w-[78px]" />
              <col className="w-[96px]" />
              <col className="w-[100px]" />
              <col className="w-[108px]" />
              <col className="w-[105px]" />
              <col className="w-[88px]" />
              <col className="w-[112px]" />
              <col className="w-[88px]" />
              <col className="w-[118px]" />
            </colgroup>

            <thead className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-900 text-white shadow-sm">
              <tr>
                <th className="border-r border-white/10 px-2 py-3 text-center text-xs font-black">
                  #
                </th>

                <th className="border-r border-white/10 px-2.5 py-3 text-center text-xs font-black uppercase tracking-[0.02em]">
                  {t('weaving.payroll.employee')}
                </th>

                <th className="border-r border-white/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em]">
                  {t('weaving.payroll.salary')}
                </th>

                <th className="border-r border-white/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em]">
                  P/A/L
                </th>

                <th className="border-r border-white/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em]">
                  {t('weaving.payroll.overtimeShort')}
                </th>

                <th className="border-r border-white/10 bg-emerald-400/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em] text-emerald-50">
                  {t('weaving.payroll.extras')}
                </th>

                <th className="border-r border-white/10 bg-indigo-400/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em] text-indigo-50">
                  {t('weaving.payroll.gross')}
                </th>

                <th className="border-r border-white/10 bg-rose-400/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em] text-rose-50">
                  {t('weaving.payroll.deductions')}
                </th>

                <th className="border-r border-white/10 bg-cyan-400/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em] text-cyan-50">
                  {t('weaving.payroll.netSalary')}
                </th>

                <th className="border-r border-white/10 bg-emerald-400/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em] text-emerald-50">
                  {t('weaving.payroll.paidAmount')}
                </th>

                <th className="border-r border-white/10 bg-amber-400/15 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em] text-amber-100">
                  {t('weaving.payroll.balance')}
                </th>

                <th className="border-r border-white/10 px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em]">
                  {t('weaving.payroll.statusLabel')}
                </th>

                <th className="px-2 py-3 text-center text-xs font-black uppercase tracking-[0.02em]">
                  {t('weaving.payroll.actions')}
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="13"
                    className="px-4 py-10 text-center text-sm font-bold text-slate-500"
                  >
                    {t('weaving.payroll.loading')}
                  </td>
                </tr>
              ) : payrolls.length ? (
                payrolls.map((payroll, index) => {
                  const status = payroll.displayStatus || payroll.status || 'draft';
                  const employeeName = getEmployeeName(payroll);
                  const rowKey = payroll._id || `${payroll.employeeId}-${index}`;

                  const canFinalizeRow =
                    recordState === 'active' &&
                    canEdit &&
                    !isEarlyClosed &&
                    !isProvisional &&
                    payroll.status === 'draft' &&
                    !payroll.attendanceIncomplete &&
                    !(payroll.finalizeBlockedReasons || []).length;

                  const canAdjustRow =
                    recordState === 'active' &&
                    canEdit &&
                    ((payroll.status === 'draft' && !isEarlyClosed) ||
                      ['posted', 'finalized', 'partially_paid', 'paid'].includes(payroll.status));

                  const canPayRow =
                    recordState === 'active' &&
                    canPay &&
                    Number(payroll.remainingDue || 0) > 0 &&
                    ['posted', 'finalized', 'partially_paid', 'paid'].includes(payroll.status);

                  const canVoidRow =
                    recordState === 'active' &&
                    canDelete && payroll.status !== 'draft' && payroll.status !== 'void';

                  const palItems = [
                    {
                      label: t('weaving.payroll.present'),
                      value: numberLabel(payroll.presentDays),
                    },
                    {
                      label: t('weaving.payroll.absent'),
                      value: numberLabel(payroll.absentDays),
                    },
                    {
                      label: t('weaving.payroll.leave'),
                      value: numberLabel(payroll.leaveDays),
                    },
                    {
                      label: t('weaving.payroll.paidLeave'),
                      value: numberLabel(payroll.paidLeaveDays),
                    },
                    {
                      label: t('weaving.payroll.unpaidLeave'),
                      value: numberLabel(payroll.unpaidLeaveDays),
                    },
                    {
                      label: t('weaving.payroll.weeklyOff'),
                      value: numberLabel(payroll.weeklyOffDaysInPeriod),
                    },
                  ];

                  const otItems = [
                    {
                      label: t('weaving.payroll.otHours'),
                      value: `${numberLabel(payroll.otHours)}h`,
                    },
                    {
                      label: t('weaving.payroll.hourlyRate'),
                      value: money(payroll.hourlyRateSnapshot),
                    },
                    {
                      label: t('weaving.payroll.overtime'),
                      value: money(payroll.otAmount),
                    },
                    {
                      label: t('weaving.payroll.doubleDuty'),
                      value: `${numberLabel(payroll.doubleDutyCount)} / ${money(
                        payroll.doubleDutyAmount
                      )}`,
                    },
                  ];

                  const additionItems = [
                    {
                      label: t('weaving.payroll.overtime'),
                      value: money(payroll.otAmount),
                    },
                    {
                      label: t('weaving.payroll.offDayWorked'),
                      value: money(payroll.offDayWorkedAmount),
                    },
                    {
                      label: t('weaving.payroll.doubleDuty'),
                      value: money(payroll.doubleDutyAmount),
                    },
                    {
                      label: t('weaving.payroll.manualAdjustment'),
                      value: money(payroll.manualAdditionAmount),
                    },
                    {
                      label: t('weaving.payroll.totalAdditions'),
                      value: money(payroll.totalAdditions),
                    },
                  ];

                  const deductionItems = [
                    {
                      label: t('weaving.payroll.absentDeduction'),
                      value: money(payroll.absentDeductionAmount),
                    },
                    {
                      label: t('weaving.payroll.unpaidLeaveDeduction'),
                      value: money(payroll.unpaidLeaveDeductionAmount),
                    },
                    {
                      label: t('weaving.payroll.openingBalance'),
                      value: money(payroll.openingBalanceRecovery?.amount),
                    },
                    {
                      label: t('weaving.payroll.manualAdjustment'),
                      value: money(payroll.manualDeductionAmount),
                    },
                    ...(payroll.recoveryApplications || []).map((entry) => ({
                      label:
                        entry.kind === 'loan'
                          ? t('weaving.employeeFinance.loanInstallment')
                          : t('weaving.employeeFinance.advanceRecovery'),
                      value: entry.isSkipped
                        ? t('weaving.employeeFinance.skipped')
                        : money(entry.amount),
                    })),
                    {
                      label: t('weaving.payroll.totalDeductions'),
                      value: money(payroll.totalDeductions),
                    },
                  ];

                  return (
                    <tr
                      key={rowKey}
                      className="border-b border-slate-200 bg-white transition-colors even:bg-slate-50/55 hover:bg-cyan-50/70"
                    >
                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-middle text-sm font-black text-slate-500">
                        {index + 1}
                      </td>

                      <td className="border-r border-slate-200 px-2.5 py-2.5 text-left align-middle">
                        <button
                          type="button"
                          title={getEmployeeMeta(payroll) || employeeName}
                          onClick={() => setDetailsPayroll(payroll)}
                          className="flex w-full min-w-0 items-center justify-start gap-2.5 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                        >
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 via-teal-500 to-emerald-500 text-xs font-black text-white shadow-sm ring-1 ring-cyan-200">
                            {getInitials(employeeName)}
                          </span>

                          <span className="min-w-0 text-left">
                            <span className="block truncate text-sm font-black leading-tight text-slate-950">
                              {employeeName}
                            </span>

                            <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-500">
                              {getEmployeeNo(payroll)}
                            </span>

                            {payroll.attendanceIncomplete ? (
                              <span className="mt-1 inline-flex rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-black text-rose-700">
                                {t('weaving.payroll.attendanceIncomplete')}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </td>

                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-middle">
                        <SalaryBadge payroll={payroll} />
                      </td>

                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-middle">
                        <BreakdownPopover
                          id={`${rowKey}-pal`}
                          title="P/A/L"
                          items={palItems}
                          activeId={activePopover}
                          onOpenChange={setActivePopover}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              title={t('weaving.payroll.present')}
                              className="inline-flex min-w-7 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-xs font-black tabular-nums text-emerald-700"
                            >
                              {numberLabel(payroll.presentDays)}
                            </span>

                            <span
                              title={t('weaving.payroll.absent')}
                              className={classNames(
                                'inline-flex min-w-7 items-center justify-center rounded-md border px-1.5 py-1 text-xs font-black tabular-nums',
                                Number(payroll.absentDays || 0) > 0
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-400'
                              )}
                            >
                              {numberLabel(payroll.absentDays)}
                            </span>

                            <span
                              title={t('weaving.payroll.leave')}
                              className={classNames(
                                'inline-flex min-w-7 items-center justify-center rounded-md border px-1.5 py-1 text-xs font-black tabular-nums',
                                Number(payroll.leaveDays || 0) > 0
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 bg-slate-50 text-slate-400'
                              )}
                            >
                              {numberLabel(payroll.leaveDays)}
                            </span>
                          </span>
                        </BreakdownPopover>
                      </td>

                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-middle">
                        <BreakdownPopover
                          id={`${rowKey}-ot`}
                          title={t('weaving.payroll.overtime')}
                          items={otItems}
                          activeId={activePopover}
                          onOpenChange={setActivePopover}
                        >
                          <span className="text-sm font-black tabular-nums tracking-tight text-cyan-900">
                            {numberLabel(payroll.otHours)}h
                          </span>
                        </BreakdownPopover>
                      </td>

                      <td className="border-r border-slate-200 bg-emerald-50/20 px-2 py-2.5 text-center align-middle">
                        <BreakdownPopover
                          id={`${rowKey}-extras`}
                          title={t('weaving.payroll.extras')}
                          items={additionItems}
                          activeId={activePopover}
                          onOpenChange={setActivePopover}
                        >
                          <span className="text-sm font-black tabular-nums tracking-tight text-emerald-800">
                            {money(payroll.totalAdditions)}
                          </span>
                        </BreakdownPopover>
                      </td>

                      <td className="border-r border-slate-200 bg-indigo-50/45 px-2 py-2.5 text-center align-middle text-sm font-black tabular-nums tracking-tight text-indigo-950">
                        {money(payroll.grossSalary)}
                      </td>

                      <td className="border-r border-slate-200 bg-rose-50/20 px-2 py-2.5 text-center align-middle">
                        <BreakdownPopover
                          id={`${rowKey}-deductions`}
                          title={t('weaving.payroll.deductions')}
                          items={deductionItems}
                          activeId={activePopover}
                          onOpenChange={setActivePopover}
                        >
                          <span className="text-sm font-black tabular-nums tracking-tight text-rose-800">
                            {money(payroll.totalDeductions)}
                          </span>
                        </BreakdownPopover>
                      </td>

                      <td className="border-r border-slate-200 bg-cyan-50/55 px-2 py-2.5 text-center align-middle text-sm font-black tabular-nums tracking-tight text-cyan-950">
                        {money(payroll.netSalary)}
                      </td>

                      <td className="border-r border-slate-200 bg-emerald-50/45 px-2 py-2.5 text-center align-middle text-sm font-black tabular-nums tracking-tight text-emerald-800">
                        {money(payroll.paidAmount)}
                      </td>

                      <td
                        className={classNames(
                          'border-r border-slate-200 px-2 py-2.5 text-center align-middle text-base font-black tabular-nums tracking-tight',
                          getBalanceTone(payroll)
                        )}
                      >
                        {money(payroll.remainingDue)}
                      </td>

                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-middle">
                        <span
                          className={classNames(
                            'inline-flex rounded-lg border px-2 py-1 text-[10px] font-black capitalize',
                            getStatusTone(status)
                          )}
                        >
                          {statusLabel(payroll)}
                        </span>
                      </td>

                      <td className="px-2 py-2.5 text-center align-middle">
                        <div className="flex flex-nowrap items-center justify-center gap-1">
                          <IconButton
                            title={t('weaving.payroll.viewDetails')}
                            icon={FaEye}
                            onClick={() => {
                              setActivePopover('');
                              setDetailsPayroll(payroll);
                            }}
                          />

                          {canAdjustRow ? (
                            <IconButton
                              title={t('weaving.payroll.addAdjustment')}
                              icon={FaPen}
                              tone="cyan"
                              disabled={saving}
                              onClick={() => {
                                setActivePopover('');
                                setModalError('');
                                setAdjustmentPayroll(payroll);
                              }}
                            />
                          ) : null}

                          {canFinalizeRow ? (
                            <IconButton
                              title={t('weaving.payroll.finalize')}
                              icon={FaCheck}
                              tone="emerald"
                              disabled={saving}
                              onClick={() => {
                                setActivePopover('');
                                handleFinalize(payroll);
                              }}
                            />
                          ) : null}

                          {canPayRow ? (
                            <IconButton
                              title={t('weaving.payroll.paySalary')}
                              icon={FaMoneyBillWave}
                              tone="amber"
                              disabled={saving}
                              onClick={() => {
                                setActivePopover('');
                                setModalError('');
                                setPaymentPayroll(payroll);
                              }}
                            />
                          ) : null}

                          {canVoidRow ? (
                            <IconButton
                              title={t('weaving.payroll.voidPayroll')}
                              icon={FaBan}
                              tone="rose"
                              disabled={saving}
                              onClick={() => {
                                setActivePopover('');
                                handleVoid(payroll);
                              }}
                            />
                          ) : null}

                          {recordState === 'inactive' && canEdit ? (
                            <IconButton
                              title={t('weaving.payroll.restore')}
                              icon={FaRedo}
                              tone="emerald"
                              disabled={saving}
                              onClick={() => handleRestore(payroll)}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="13" className="px-4 py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-cyan-800 text-white shadow-md">
                      <FaMoneyBillWave />
                    </div>

                    <div className="text-base font-black text-slate-900">
                      {isFutureCycle
                        ? t('weaving.payroll.futureCycle')
                        : t('weaving.payroll.noPayroll')}
                    </div>

                    <div className="mt-1 text-sm font-semibold text-slate-500">
                      {isFutureCycle
                        ? t('weaving.payroll.futureCycleHelp')
                        : t('weaving.payroll.cycleHelp')}
                    </div>

                    {recordState === 'active' && !isFutureCycle && canCreate ? (
                      <button
                        type="button"
                        disabled={saving || isEarlyClosed}
                        onClick={handleGenerate}
                        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-4 text-sm font-black text-white shadow-md transition hover:from-cyan-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FaSync />
                        {t('weaving.payroll.generatePayroll')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PayrollDetailsModal
        payroll={detailsPayroll}
        cycle={cycle}
        onClose={() => setDetailsPayroll(null)}
      />

      <AdjustmentModal
        payroll={adjustmentPayroll}
        saving={saving}
        error={modalError}
        onClose={() => setAdjustmentPayroll(null)}
        onSave={handleAdjustmentSave}
      />

      <PayModal
        payroll={paymentPayroll}
        accounts={paymentAccounts}
        saving={saving}
        error={modalError}
        onClose={() => setPaymentPayroll(null)}
        onPay={handlePay}
      />

      {earlyCloseOpen ? (
        <EarlyCloseModal
          cycle={displayCycle}
          draftCount={draftRows.length}
          throughDate={earlyCloseThroughDate}
          reason={earlyCloseReason}
          saving={saving}
          error={modalError}
          onReasonChange={setEarlyCloseReason}
          onClose={() => {
            setEarlyCloseOpen(false);
            setModalError('');
          }}
          onConfirm={handleEarlyClose}
        />
      ) : null}

      {resumeOpen ? (
        <ResumePayrollModal
          cycle={cycle}
          resume={resume}
          form={resumeForm}
          saving={saving}
          error={modalError}
          onChange={setResumeForm}
          onClose={() => {
            setResumeOpen(false);
            setModalError('');
          }}
          onConfirm={handleResumePayroll}
        />
      ) : null}
    </div>
  );
};

export default WeavingPayrollPage;
