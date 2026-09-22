import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaBook, FaEdit, FaRedo, FaTrash, FaUserCircle } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  TravelActionButton,
  TravelCardLine,
  TravelStatusBadge,
  buildTravelConfirmMessage,
} from '../../components/travel/master/TravelMasterUI';
import {
  EMPLOYEE_MODULE_SCOPES,
  deleteEmployee,
  getEmployeeById,
  restoreEmployee,
} from '../../services/employeeService';
import { formatBusinessDateForDisplay } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import {
  requestWeavingConfirmation,
  useWeavingFeedback,
} from '../../components/weaving/WeavingFeedbackModal';

const MODULE_SCOPE = EMPLOYEE_MODULE_SCOPES.WEAVING;
const MISSING_VALUE = '\u2014';
const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const getErrorMessage = (error, fallbackKey) => error?.response?.data?.message || t(fallbackKey);

const getUnitLabel = (employee = {}) => {
  if (!employee.unitNo) return MISSING_VALUE;
  return employee.unitName
    ? `Unit ${employee.unitNo} - ${employee.unitName}`
    : `Unit ${employee.unitNo}`;
};

const formatDate = (value) => {
  if (!value) return MISSING_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-GB');
};

const formatMoney = (value) => Number(value || 0).toLocaleString('en-GB');

const pad2 = (value) => String(value).padStart(2, '0');

const getMonthLastDay = (year, month) => new Date(year, month, 0).getDate();

const buildDateKey = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const getNextMonth = (year, month) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

const deriveSalaryCycle = (cycleKey = '') => {
  const match = String(cycleKey || '').match(/^(\d{4})-(\d{2})-H([12])$/i);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const half = match[3] === '2' ? 'H2' : 'H1';
  const nextMonth = getNextMonth(year, month);

  return {
    periodStart: buildDateKey(year, month, half === 'H1' ? 1 : 16),
    periodEnd: buildDateKey(year, month, half === 'H1' ? 15 : getMonthLastDay(year, month)),
    payDate: buildDateKey(
      half === 'H1' ? year : nextMonth.year,
      half === 'H1' ? month : nextMonth.month,
      half === 'H1' ? 22 : 7
    ),
  };
};

const getGenderLabel = (gender) => {
  if (!gender) return MISSING_VALUE;
  return t(`weaving.employees.gender.${gender}`);
};

const getOpeningBalanceLabel = (openingBalance = {}) => {
  const amount = Number(openingBalance.amount || 0);
  if (!amount) return MISSING_VALUE;

  const typeKey =
    openingBalance.type === 'receivable'
      ? 'weaving.employees.openingBalance.receivable'
      : 'weaving.employees.openingBalance.payable';

  return `${amount.toLocaleString('en-GB')} - ${t(typeKey)}`;
};

const getSalaryTypeLabel = (salaryType) =>
  salaryType === 'daily'
    ? t('weaving.employees.salary.daily')
    : t('weaving.employees.salary.monthly');

const getSalaryValue = (employee = {}) => {
  const amount = formatMoney(employee.baseSalary);
  const unitKey =
    employee.salaryType === 'daily'
      ? 'weaving.employees.salary.day'
      : 'weaving.employees.salary.month';

  return `${amount} / ${t(unitKey)}`;
};

const getDutyHoursLabel = (dutyHours) => {
  const hours = Number(dutyHours || 0);
  if (!hours) return t('weaving.employees.notSet');

  return `${hours} ${t('weaving.employees.duty.hours')}`;
};

const getWeeklyOffDaysLabel = (days = []) => {
  if (!Array.isArray(days) || days.length === 0) return t('weaving.employees.notSet');

  return days
    .map((day) =>
      String(day || '')
        .trim()
        .toLowerCase()
    )
    .filter((day) => WEEKDAY_KEYS.includes(day))
    .map((day) => t(`weaving.employees.weekdays.${day}`))
    .join(', ');
};

const getYesNoLabel = (value) =>
  value === false ? t('weaving.employees.no') : t('weaving.employees.yes');

const getRecoveryLabel = (openingBalance = {}) => {
  if (Number(openingBalance.amount || 0) <= 0 || openingBalance.type !== 'receivable') {
    return MISSING_VALUE;
  }

  return openingBalance.deductionIntent === 'manual_review'
    ? t('weaving.employees.openingBalance.manualReview')
    : t('weaving.employees.openingBalance.futureSalary');
};

const getSalaryCycleLabel = (openingBalance = {}) => {
  if (
    Number(openingBalance.amount || 0) <= 0 ||
    openingBalance.type !== 'receivable' ||
    openingBalance.deductionIntent !== 'manual_review'
  ) {
    return MISSING_VALUE;
  }

  const cycle = deriveSalaryCycle(openingBalance.targetCycleKey);
  const payDate = openingBalance.targetPayDate || cycle?.payDate;

  if (!openingBalance.targetCycleKey && !payDate) return MISSING_VALUE;

  const period = cycle
    ? `${formatBusinessDateForDisplay(cycle.periodStart)} - ${formatBusinessDateForDisplay(
        cycle.periodEnd
      )}`
    : t('weaving.employees.notSet');

  return `${openingBalance.targetCycleKey || t('weaving.employees.notSet')} - ${period} / ${t(
    'weaving.employees.fields.paymentDate'
  )}: ${formatBusinessDateForDisplay(payDate, { fallback: MISSING_VALUE })}`;
};

const WeavingEmployeeProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });

  const canEdit = hasPermission('employees.edit');
  const canDelete = hasPermission('employees.delete');
  const canViewLedger = hasPermission('employees.view_ledger');

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const employeeData = await getEmployeeById(id, {
        moduleScope: MODULE_SCOPE,
        params: { includeHidden: 'true' },
      });
      setEmployee(employeeData || null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'weaving.employees.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  const infoFields = useMemo(() => {
    if (!employee) return [];

    return [
      ['weaving.employees.fields.employeeNo', employee.employeeNo],
      ['weaving.employees.fields.listOrder', employee.listOrder],
      ['weaving.employees.fields.fatherName', employee.fatherName],
      ['weaving.employees.fields.cnic', employee.cnic],
      ['weaving.employees.fields.phone', employee.phone],
      ['weaving.employees.fields.gender', getGenderLabel(employee.gender)],
      ['weaving.employees.fields.unit', getUnitLabel(employee)],
      [
        'weaving.employees.fields.department',
        employee.departmentName || employee.departmentId?.name,
      ],
      [
        'weaving.employees.fields.designation',
        employee.designationName || employee.designationId?.name,
      ],
      ['weaving.employees.fields.shift', employee.shiftName || employee.shiftId?.name],
      ['weaving.employees.fields.salaryType', getSalaryTypeLabel(employee.salaryType)],
      [
        employee.salaryType === 'daily'
          ? 'weaving.employees.fields.perDayRate'
          : 'weaving.employees.fields.monthlySalary',
        getSalaryValue(employee),
      ],
      ['weaving.employees.fields.dutyHours', getDutyHoursLabel(employee.dutyHours)],
      ['weaving.employees.fields.weeklyOffDays', getWeeklyOffDaysLabel(employee.weeklyOffDays)],
      ['weaving.employees.fields.paidLeaveAllowance', employee.paidLeaveAllowance ?? 0],
      ['weaving.employees.fields.otAllowed', getYesNoLabel(employee.otAllowed)],
      ['weaving.employees.fields.openingBalance', getOpeningBalanceLabel(employee.openingBalance)],
      ['weaving.employees.fields.recoveryMethod', getRecoveryLabel(employee.openingBalance)],
      ['weaving.employees.fields.salaryCycle', getSalaryCycleLabel(employee.openingBalance)],
      ['weaving.employees.fields.joiningDate', formatDate(employee.joiningDate)],
      ['weaving.employees.fields.emergencyContact', employee.emergencyContact],
      ['weaving.employees.fields.address', employee.address],
      ['weaving.employees.fields.notes', employee.notes],
    ];
  }, [employee]);

  const hideEmployee = async () => {
    if (!employee?._id) return;

    if (
      !(await requestWeavingConfirmation({
        message: buildTravelConfirmMessage('weaving.employees.messages.hideConfirm', employee.name),
      }))
    ) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await deleteEmployee(employee._id, { moduleScope: MODULE_SCOPE });
      setEmployee(response || { ...employee, isDeleted: true, status: 'inactive' });
    } catch (hideError) {
      setError(getErrorMessage(hideError, 'weaving.employees.messages.hideFailed'));
    } finally {
      setSaving(false);
    }
  };

  const restoreHiddenEmployee = async () => {
    if (!employee?._id) return;

    if (
      !(await requestWeavingConfirmation({
        message: buildTravelConfirmMessage(
          'weaving.employees.messages.restoreConfirm',
          employee.name
        ),
      }))
    ) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await restoreEmployee(employee._id, { moduleScope: MODULE_SCOPE });
      setEmployee(response || { ...employee, isDeleted: false, status: 'active' });
    } catch (restoreError) {
      setError(getErrorMessage(restoreError, 'weaving.employees.messages.restoreFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-3 sm:p-4 md:p-5 lg:p-6">
      <section className="mb-3 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
        <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
        <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between md:px-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate('/weaving/employees')}
              className="mb-2 inline-flex items-center gap-2 text-xs font-extrabold text-cyan-700"
            >
              {t('common.back')}
            </button>
            <h1 className="text-lg font-extrabold leading-tight text-slate-950 md:text-xl">
              {t('weaving.employees.profile')}
            </h1>
          </div>
          {employee && (
            <div className="flex flex-wrap gap-2">
              {canEdit && !employee.isDeleted && (
                <TravelActionButton
                  icon={FaEdit}
                  variant="secondary"
                  onClick={() => navigate(`/weaving/employees/${employee._id}/edit`)}
                >
                  {t('travel.common.edit')}
                </TravelActionButton>
              )}
              {canViewLedger && (
                <TravelActionButton
                  icon={FaBook}
                  variant="soft"
                  onClick={() => navigate(`/weaving/employees/${employee._id}/ledger`)}
                >
                  {t('weaving.employees.actions.viewLedger')}
                </TravelActionButton>
              )}
              {canEdit && employee.isDeleted && (
                <TravelActionButton
                  icon={FaRedo}
                  variant="success"
                  onClick={restoreHiddenEmployee}
                  disabled={saving}
                >
                  {t('weaving.employees.actions.restore')}
                </TravelActionButton>
              )}
              {canDelete && !employee.isDeleted && (
                <TravelActionButton
                  icon={FaTrash}
                  variant="danger"
                  onClick={hideEmployee}
                  disabled={saving}
                >
                  {t('weaving.employees.actions.hide')}
                </TravelActionButton>
              )}
            </div>
          )}
        </div>
      </section>

      {!employee ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          {t('weaving.employees.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <FaUserCircle
                  className="h-16 w-16 flex-shrink-0 text-cyan-700"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black text-slate-950">{employee.name}</h2>
                  <p className="truncate text-sm font-bold text-slate-500">
                    {employee.employeeNo || MISSING_VALUE}
                  </p>
                </div>
              </div>
              <TravelStatusBadge active={!employee.isDeleted && employee.status !== 'inactive'} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {infoFields.map(([labelKey, value]) => (
              <div
                key={labelKey}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <TravelCardLine
                  labelKey={labelKey}
                  value={
                    value === undefined || value === null || value === '' ? MISSING_VALUE : value
                  }
                />
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
};

export default WeavingEmployeeProfilePage;
