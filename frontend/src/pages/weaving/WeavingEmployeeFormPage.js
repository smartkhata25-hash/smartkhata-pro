import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaChevronDown,
  FaChevronUp,
  FaPlus,
  FaSave,
  FaTimes,
  FaUserCircle,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { TravelActionButton, TravelFormModal } from '../../components/travel/master/TravelMasterUI';
import { useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';
import {
  formatBusinessDateForDisplay,
  getBusinessDateInputValue,
} from '../../utils/localDateTime';
import {
  EMPLOYEE_MODULE_SCOPES,
  createEmployee,
  createEmployeeDesignation,
  createWeavingDepartment,
  createWeavingShift,
  createWeavingUnit,
  getEmployeeById,
  getEmployeeFormMeta,
  updateEmployee,
} from '../../services/employeeService';

const MODULE_SCOPE = EMPLOYEE_MODULE_SCOPES.WEAVING;

const EMPTY_FORM = {
  employeeNo: '',
  listOrder: '',
  name: '',
  fatherName: '',
  cnic: '',
  phone: '',
  gender: '',
  unitId: '',
  departmentId: '',
  designationId: '',
  shiftId: '',
  salaryType: 'monthly',
  baseSalary: '',
  knottingPaymentMethod: 'monthly',
  dutyHours: '',
  weeklyOffDays: [],
  paidLeaveAllowance: '0',
  otAllowed: true,
  joiningDate: '',
  address: '',
  emergencyContact: '',
  notes: '',
  openingBalanceAmount: '',
  openingBalanceType: '',
  openingBalanceDeductionIntent: 'future_salary',
  openingBalanceTargetCycleKey: '',
};

const EMPTY_META = {
  units: [],
  departments: [],
  designations: [],
  shifts: [],
};

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const todayInput = () => getBusinessDateInputValue();

const pad2 = (value) => String(value).padStart(2, '0');

const normalizeSalaryType = (value = '') => (value === 'daily' ? 'daily' : 'monthly');

const normalizeWeeklyOffDays = (days = []) => {
  if (!Array.isArray(days)) return [];

  const seen = new Set();

  return days.reduce((normalizedDays, day) => {
    const normalized = String(day || '').trim().toLowerCase();

    if (WEEKDAY_KEYS.includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      normalizedDays.push(normalized);
    }

    return normalizedDays;
  }, []);
};

const getDutyMode = (hours) => {
  const value = String(hours ?? '').trim();
  if (!value || Number(value) <= 0) return '';
  if (value === '8') return '8';
  if (value === '12') return '12';
  return 'custom';
};

const getMonthLastDay = (year, month) => new Date(year, month, 0).getDate();

const buildDateKey = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const getNextMonth = (year, month) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

const parseDateKey = (dateKey = todayInput()) => {
  const [yearText, monthText, dayText] = String(dateKey || '').split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!year || !month || !day) {
    return parseDateKey(getBusinessDateInputValue());
  }

  return { year, month, day };
};

const buildSalaryCycle = (year, month, half) => {
  const normalizedHalf = half === 'H2' ? 'H2' : 'H1';
  const nextMonth = getNextMonth(year, month);
  const payYear = normalizedHalf === 'H1' ? year : nextMonth.year;
  const payMonth = normalizedHalf === 'H1' ? month : nextMonth.month;
  const payDay = normalizedHalf === 'H1' ? 22 : 7;

  return {
    key: `${year}-${pad2(month)}-${normalizedHalf}`,
    periodStart: buildDateKey(year, month, normalizedHalf === 'H1' ? 1 : 16),
    periodEnd: buildDateKey(
      year,
      month,
      normalizedHalf === 'H1' ? 15 : getMonthLastDay(year, month)
    ),
    payDate: buildDateKey(payYear, payMonth, payDay),
  };
};

const getUpcomingSalaryCycles = (dateKey = todayInput(), count = 6) => {
  const start = parseDateKey(dateKey);
  let cursorYear = start.year;
  let cursorMonth = start.month;
  let cursorHalf = start.day <= 15 ? 'H1' : 'H2';
  const cycles = [];

  while (cycles.length < count) {
    cycles.push(buildSalaryCycle(cursorYear, cursorMonth, cursorHalf));

    if (cursorHalf === 'H1') {
      cursorHalf = 'H2';
    } else {
      const nextMonth = getNextMonth(cursorYear, cursorMonth);
      cursorYear = nextMonth.year;
      cursorMonth = nextMonth.month;
      cursorHalf = 'H1';
    }
  }

  return cycles;
};

const deriveSalaryCycle = (cycleKey = '') => {
  const match = String(cycleKey || '').match(/^(\d{4})-(\d{2})-H([12])$/i);
  if (!match) return null;

  return buildSalaryCycle(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    `H${match[3]}`
  );
};

const getSalaryCycleSummary = (cycleKey, cycles = []) => {
  const cycle = cycles.find((item) => item.key === cycleKey) || deriveSalaryCycle(cycleKey);
  if (!cycle) return '';

  return `${formatBusinessDateForDisplay(cycle.periodStart)} - ${formatBusinessDateForDisplay(
    cycle.periodEnd
  )} / ${t('weaving.employees.fields.paymentDate')}: ${formatBusinessDateForDisplay(
    cycle.payDate
  )}`;
};

const TECHNICAL_ERROR_PATTERN = /(validationerror|casterror|is not defined|objectid|stack)/i;

const getErrorMessage = (error, fallbackKey) => {
  const message = error?.response?.data?.message || '';

  if (!message || TECHNICAL_ERROR_PATTERN.test(message)) {
    return t(fallbackKey);
  }

  return message;
};

const formatCnicInput = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 13);

  if (!digits) return '';
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;

  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
};

const formatDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) && !/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    return String(value).slice(0, 10);
  }

  return getBusinessDateInputValue(value);
};

const getUnitLabel = (unit = {}) =>
  unit.name ? `Unit ${unit.unitNo} - ${unit.name}` : `Unit ${unit.unitNo}`;

const getRecordId = (value) => value?._id || value || '';

const toOptions = (records, getLabel = (record) => record.name) =>
  records.map((record) => ({
    value: record._id,
    label: getLabel(record),
  }));

const normalizeMeta = (meta = {}) => ({
  units: Array.isArray(meta.units) ? meta.units : [],
  departments: Array.isArray(meta.departments) ? meta.departments : [],
  designations: Array.isArray(meta.designations) ? meta.designations : [],
  shifts: Array.isArray(meta.shifts) ? meta.shifts : [],
});

const getDefaultShiftId = (shifts = []) => {
  const generalShift = shifts.find((shift) =>
    String(shift.name || '').toLowerCase().includes('general')
  );

  return generalShift?._id || shifts[0]?._id || '';
};

const buildEmployeeForm = (employee) => {
  const openingBalanceAmount = Number(employee.openingBalance?.amount || 0);
  const openingBalanceType = openingBalanceAmount > 0 ? employee.openingBalance?.type || '' : '';
  const openingBalanceDeductionIntent =
    openingBalanceType === 'receivable'
      ? employee.openingBalance?.deductionIntent || 'future_salary'
      : 'future_salary';
  const openingBalanceTargetCycleKey =
    openingBalanceType === 'receivable' && openingBalanceDeductionIntent === 'manual_review'
      ? employee.openingBalance?.targetCycleKey || ''
      : '';

  return {
    employeeNo: employee.employeeNo || '',
    listOrder: employee.listOrder || '',
    name: employee.name || '',
    fatherName: employee.fatherName || '',
    cnic: employee.cnic || '',
    phone: employee.phone || '',
    gender: employee.gender || '',
    unitId: getRecordId(employee.unitId),
    departmentId: getRecordId(employee.departmentId),
    designationId: getRecordId(employee.designationId),
    shiftId: getRecordId(employee.shiftId),
    salaryType: normalizeSalaryType(employee.salaryType),
    baseSalary: employee.baseSalary || '',
    knottingPaymentMethod: employee.knottingPaymentMethod || 'monthly',
    dutyHours: Number(employee.dutyHours || 0) > 0 ? String(employee.dutyHours) : '',
    weeklyOffDays: normalizeWeeklyOffDays(employee.weeklyOffDays),
    paidLeaveAllowance: String(employee.paidLeaveAllowance ?? 0),
    otAllowed: employee.otAllowed !== false,
    joiningDate: formatDateInput(employee.joiningDate),
    address: employee.address || '',
    emergencyContact: employee.emergencyContact || '',
    notes: employee.notes || '',
    openingBalanceAmount: openingBalanceAmount || '',
    openingBalanceType,
    openingBalanceDeductionIntent,
    openingBalanceTargetCycleKey,
  };
};

const buildDefaultForm = (formMeta = {}, normalizedMeta = EMPTY_META) => ({
  ...EMPTY_FORM,
  employeeNo: formMeta?.nextEmployeeNo || '',
  listOrder: formMeta?.nextListOrder || '',
  joiningDate: todayInput(),
  shiftId: getDefaultShiftId(normalizedMeta.shifts),
});

const InputField = ({
  labelKey,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  inputMode,
  min,
  step,
  placeholderKey,
  className = '',
  error = '',
}) => (
  <label className={`block min-w-0 ${className}`}>
    <span className="mb-1 block text-xs font-extrabold text-slate-500">
      {t(labelKey)}
    </span>
    <input
      type={type}
      name={name}
      value={value ?? ''}
      onChange={(event) => onChange(name, event.target.value)}
      required={required}
      inputMode={inputMode}
      min={min}
      step={step}
      placeholder={placeholderKey ? t(placeholderKey) : ''}
      aria-invalid={Boolean(error)}
      className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${
        error ? 'border-rose-300' : 'border-slate-200'
      }`}
    />
    {error && <p className="mt-1 text-xs font-bold text-rose-600">{error}</p>}
  </label>
);

const TextAreaField = ({ labelKey, name, value, onChange }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-xs font-extrabold text-slate-500">
      {t(labelKey)}
    </span>
    <textarea
      value={value || ''}
      onChange={(event) => onChange(name, event.target.value)}
      rows={3}
      className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
    />
  </label>
);

const SelectWithAdd = ({
  labelKey,
  name,
  value,
  onChange,
  options,
  placeholderKey,
  onAdd,
  addTitleKey,
  required = false,
  error = '',
}) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-xs font-extrabold text-slate-500">
      {t(labelKey)}
    </span>
    <div className="flex min-w-0 gap-2">
      <select
        value={value || ''}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        aria-invalid={Boolean(error)}
        className={`h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${
          error ? 'border-rose-300' : 'border-slate-200'
        }`}
      >
        <option value="">{t(placeholderKey)}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onAdd}
        title={t(addTitleKey || 'weaving.employees.actions.addMaster')}
        className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-100 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
      >
        <FaPlus aria-hidden="true" />
      </button>
    </div>
    {error && <p className="mt-1 text-xs font-bold text-rose-600">{error}</p>}
  </label>
);

const WeavingEmployeeFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [meta, setMeta] = useState(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [listOrderTouched, setListOrderTouched] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [masterModal, setMasterModal] = useState(null);
  const [masterForm, setMasterForm] = useState({ name: '', unitNo: '' });
  const [masterError, setMasterError] = useState('');
  useWeavingFeedback(masterError, setMasterError, { type: 'error' });
  const [photoPreview, setPhotoPreview] = useState('');
  const [dutyMode, setDutyMode] = useState('');
  const [cyclePickerOpen, setCyclePickerOpen] = useState(false);
  const [pendingCycleKey, setPendingCycleKey] = useState('');

  const loadMeta = useCallback(async (unitId = '') => {
    const formMeta = await getEmployeeFormMeta({ moduleScope: MODULE_SCOPE, unitId });
    const normalized = normalizeMeta(formMeta);
    setMeta(normalized);
    return { ...formMeta, ...normalized };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      setLoading(true);
      setError('');

      try {
        const formMeta = await getEmployeeFormMeta({ moduleScope: MODULE_SCOPE });
        const normalizedMeta = normalizeMeta(formMeta);

        if (cancelled) return;

        setMeta(normalizedMeta);

        if (isEdit) {
          const employee = await getEmployeeById(id, {
            moduleScope: MODULE_SCOPE,
            params: { includeHidden: 'true' },
          });

          if (!cancelled) {
            const employeeForm = buildEmployeeForm(employee);
            setForm(employeeForm);
            setDutyMode(getDutyMode(employeeForm.dutyHours));
            setListOrderTouched(false);
          }
        } else {
          setForm(buildDefaultForm(formMeta, normalizedMeta));
          setDutyMode('');
          setListOrderTouched(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'weaving.employees.messages.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  useEffect(() => {
    if (!form.unitId || form.listOrder || isEdit) return undefined;

    let cancelled = false;

    const loadListOrder = async () => {
      try {
        const formMeta = await loadMeta(form.unitId);

        if (!cancelled) {
          setForm((current) =>
            current.unitId === form.unitId && !current.listOrder
              ? { ...current, listOrder: formMeta?.nextListOrder || '' }
              : current
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'weaving.employees.messages.loadFailed'));
        }
      }
    };

    loadListOrder();

    return () => {
      cancelled = true;
    };
  }, [form.unitId, form.listOrder, isEdit, loadMeta]);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const unitOptions = useMemo(() => toOptions(meta.units, getUnitLabel), [meta.units]);
  const departmentOptions = useMemo(() => toOptions(meta.departments), [meta.departments]);
  const designationOptions = useMemo(() => toOptions(meta.designations), [meta.designations]);
  const selectedDesignation = useMemo(
    () => meta.designations.find((item) => getRecordId(item) === form.designationId),
    [form.designationId, meta.designations]
  );
  const isKnottingWorker = selectedDesignation?.name === 'Beam Knotting Worker';
  const isPieceOnlyKnotting =
    isKnottingWorker && ['per_beam', 'per_set'].includes(form.knottingPaymentMethod);
  const shiftOptions = useMemo(() => toOptions(meta.shifts), [meta.shifts]);
  const salaryCycles = useMemo(() => getUpcomingSalaryCycles(todayInput(), 6), []);
  const hasOpeningBalance = Number(form.openingBalanceAmount || 0) > 0;
  const selectedCycleSummary = getSalaryCycleSummary(
    form.openingBalanceTargetCycleKey,
    salaryCycles
  );

  const handleChange = (name, value) => {
    if (name === 'openingBalanceDeductionIntent' && value === 'manual_review') {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.openingBalanceTargetCycleKey;
        return next;
      });
      setPendingCycleKey(form.openingBalanceTargetCycleKey || salaryCycles[0]?.key || '');
      setCyclePickerOpen(true);
      return;
    }

    const nextValue = name === 'cnic' ? formatCnicInput(value) : value;

    if (name === 'listOrder') {
      setListOrderTouched(true);
    }

    setFieldErrors((current) => {
      const next = { ...current };
      [
        name,
        ...(name.startsWith('openingBalance') ? ['openingBalanceType', 'openingBalanceTargetCycleKey'] : []),
      ].forEach((field) => {
        delete next[field];
      });
      return next;
    });
    setForm((current) => {
      const next = {
        ...current,
        [name]: nextValue,
        ...(name === 'unitId' && !isEdit && !listOrderTouched ? { listOrder: '' } : {}),
      };

      if (name === 'salaryType') {
        next.salaryType = normalizeSalaryType(nextValue);
      }

      if (name === 'openingBalanceAmount') {
        const amount = Number(nextValue || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
          next.openingBalanceType = '';
          next.openingBalanceDeductionIntent = 'future_salary';
          next.openingBalanceTargetCycleKey = '';
        }
      }

      if (name === 'openingBalanceType') {
        if (nextValue === 'receivable') {
          next.openingBalanceDeductionIntent = current.openingBalanceDeductionIntent || 'future_salary';
        } else {
          next.openingBalanceDeductionIntent = '';
          next.openingBalanceTargetCycleKey = '';
        }
      }

      if (name === 'openingBalanceDeductionIntent') {
        next.openingBalanceDeductionIntent = 'future_salary';
        next.openingBalanceTargetCycleKey = '';
      }

      return next;
    });
  };

  const handleDutyModeChange = (mode) => {
    setDutyMode(mode);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.dutyHours;
      return next;
    });
    setForm((current) => ({
      ...current,
      dutyHours: mode === 'custom' ? '' : mode,
    }));
  };

  const toggleWeeklyOffDay = (day) => {
    setForm((current) => {
      const days = normalizeWeeklyOffDays(current.weeklyOffDays);
      const nextDays = days.includes(day)
        ? days.filter((item) => item !== day)
        : [...days, day];

      return { ...current, weeklyOffDays: nextDays };
    });
  };

  const openCyclePicker = () => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.openingBalanceTargetCycleKey;
      return next;
    });
    setPendingCycleKey(form.openingBalanceTargetCycleKey || salaryCycles[0]?.key || '');
    setCyclePickerOpen(true);
  };

  const cancelCyclePicker = () => {
    setCyclePickerOpen(false);
    setPendingCycleKey('');
  };

  const confirmCyclePicker = () => {
    if (!pendingCycleKey) return;

    setForm((current) => ({
      ...current,
      openingBalanceDeductionIntent: 'manual_review',
      openingBalanceTargetCycleKey: pendingCycleKey,
    }));
    setCyclePickerOpen(false);
    setPendingCycleKey('');
  };

  const openMasterModal = (type) => {
    const nextUnitNo =
      type === 'unit'
        ? Math.max(0, ...meta.units.map((unit) => Number(unit.unitNo || 0))) + 1
        : '';

    setMasterModal(type);
    setMasterError('');
    setMasterForm({ name: '', unitNo: nextUnitNo || '' });
  };

  const closeMasterModal = () => {
    setMasterModal(null);
    setMasterError('');
    setMasterForm({ name: '', unitNo: '' });
  };

  const saveMaster = async (event) => {
    event.preventDefault();
    if (!masterModal) return;

    setSaving(true);
    setMasterError('');

    const createMap = {
      unit: createWeavingUnit,
      department: createWeavingDepartment,
      designation: createEmployeeDesignation,
      shift: createWeavingShift,
    };
    const fieldMap = {
      unit: 'unitId',
      department: 'departmentId',
      designation: 'designationId',
      shift: 'shiftId',
    };

    try {
      const payload =
        masterModal === 'unit'
          ? { unitNo: Number(masterForm.unitNo || 0), name: masterForm.name }
          : { name: masterForm.name };
      const created = await createMap[masterModal](payload, { moduleScope: MODULE_SCOPE });
      await loadMeta(form.unitId);

      setForm((current) => ({
        ...current,
        [fieldMap[masterModal]]: created?._id || current[fieldMap[masterModal]],
        ...(masterModal === 'unit' && !isEdit ? { listOrder: 1 } : {}),
      }));
      closeMasterModal();
    } catch (saveError) {
      setMasterError(getErrorMessage(saveError, 'weaving.employees.messages.masterSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview('');
  };

  const resetFormToDefaults = async () => {
    setSaving(true);
    setError('');
    setFieldErrors({});

    try {
      const formMeta = await loadMeta('');
      setForm(buildDefaultForm(formMeta, normalizeMeta(formMeta)));
      setDutyMode('');
      setListOrderTouched(false);
      removePhoto();
    } catch (resetError) {
      setError(getErrorMessage(resetError, 'weaving.employees.messages.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const clearForm = async () => {
    if (!isEdit) {
      await resetFormToDefaults();
      return;
    }

    setSaving(true);
    setError('');
    setFieldErrors({});

    try {
      const employee = await getEmployeeById(id, {
        moduleScope: MODULE_SCOPE,
        params: { includeHidden: 'true' },
      });
      const employeeForm = buildEmployeeForm(employee);
      setForm(employeeForm);
      setDutyMode(getDutyMode(employeeForm.dutyHours));
      setListOrderTouched(false);
      removePhoto();
    } catch (clearError) {
      setError(getErrorMessage(clearError, 'weaving.employees.messages.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const applyServerFieldError = (saveError) => {
    const message = getErrorMessage(saveError, 'weaving.employees.messages.saveFailed');
    const lowerMessage = message.toLowerCase();
    const mappedErrors = {};

    if (lowerMessage.includes('employee name')) {
      mappedErrors.name = message;
    } else if (lowerMessage.includes('employee number')) {
      mappedErrors.employeeNo = message;
    } else if (lowerMessage.includes('cnic')) {
      mappedErrors.cnic = message;
    } else if (lowerMessage.includes('father')) {
      mappedErrors.fatherName = message;
    } else if (lowerMessage.includes('phone')) {
      mappedErrors.phone = message;
    } else if (lowerMessage.includes('unit')) {
      mappedErrors.unitId = message;
    } else if (lowerMessage.includes('department')) {
      mappedErrors.departmentId = message;
    } else if (lowerMessage.includes('shift')) {
      mappedErrors.shiftId = message;
    } else if (lowerMessage.includes('opening balance')) {
      mappedErrors.openingBalanceType = message;
    } else if (lowerMessage.includes('duty')) {
      mappedErrors.dutyHours = message;
    } else if (lowerMessage.includes('paid leave')) {
      mappedErrors.paidLeaveAllowance = message;
    } else if (lowerMessage.includes('salary cycle')) {
      mappedErrors.openingBalanceTargetCycleKey = message;
    }

    if (Object.keys(mappedErrors).length > 0) {
      setFieldErrors(mappedErrors);
      setError('');
      return;
    }

    setError(message);
  };

  const validateForm = () => {
    const nextErrors = {};
    const requiredFields = [
      ['name', 'weaving.employees.messages.nameRequired'],
      ['fatherName', 'weaving.employees.messages.fatherNameRequired'],
      ['phone', 'weaving.employees.messages.phoneRequired'],
      ['unitId', 'weaving.employees.messages.unitRequired'],
      ['departmentId', 'weaving.employees.messages.departmentRequired'],
      ['shiftId', 'weaving.employees.messages.shiftRequired'],
    ];

    requiredFields.forEach(([field, key]) => {
      if (!String(form[field] || '').trim()) {
        nextErrors[field] = t(key);
      }
    });

    if (form.cnic && !/^\d{5}-?\d{7}-?\d$/.test(form.cnic)) {
      nextErrors.cnic = t('weaving.employees.messages.invalidCnic');
    }

    const dutyHoursText = String(form.dutyHours ?? '').trim();
    const dutyHours = Number(dutyHoursText);

    if (!isEdit && !dutyHoursText) {
      nextErrors.dutyHours = t('weaving.employees.messages.dutyHoursRequired');
    } else if (
      dutyHoursText &&
      (!Number.isFinite(dutyHours) || dutyHours <= 0 || dutyHours > 24)
    ) {
      nextErrors.dutyHours = t('weaving.employees.messages.dutyHoursInvalid');
    }

    const paidLeaveAllowanceText = String(form.paidLeaveAllowance ?? '').trim();
    const paidLeaveAllowance = Number(paidLeaveAllowanceText || 0);

    if (
      paidLeaveAllowanceText &&
      (!Number.isFinite(paidLeaveAllowance) ||
        paidLeaveAllowance < 0 ||
        !Number.isInteger(paidLeaveAllowance))
    ) {
      nextErrors.paidLeaveAllowance = t('weaving.employees.messages.paidLeaveAllowanceInvalid');
    }

    if (Number(form.openingBalanceAmount || 0) < 0) {
      nextErrors.openingBalanceAmount = t('weaving.employees.messages.openingBalanceAmountInvalid');
    }

    if (Number(form.openingBalanceAmount || 0) > 0 && !form.openingBalanceType) {
      nextErrors.openingBalanceType = t('weaving.employees.messages.openingBalanceTypeRequired');
    }

    if (
      Number(form.openingBalanceAmount || 0) > 0 &&
      form.openingBalanceType === 'receivable' &&
      form.openingBalanceDeductionIntent === 'manual_review' &&
      !form.openingBalanceTargetCycleKey
    ) {
      nextErrors.openingBalanceTargetCycleKey = t(
        'weaving.employees.messages.salaryCycleRequired'
      );
    }

    setFieldErrors(nextErrors);
    return nextErrors;
  };

  const saveEmployee = async ({ saveAndNew = false } = {}) => {
    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setError(t('weaving.employees.messages.checkFieldErrors'));
      return false;
    }

    setSaving(true);
    setError('');

    try {
      const openingBalanceAmount = Number(form.openingBalanceAmount || 0);
      const openingBalanceType = openingBalanceAmount > 0 ? form.openingBalanceType : '';
      const openingBalanceDeductionIntent =
        openingBalanceType === 'receivable'
          ? form.openingBalanceDeductionIntent || 'future_salary'
          : '';
      const openingBalanceTargetCycleKey =
        openingBalanceType === 'receivable' &&
        openingBalanceDeductionIntent === 'manual_review'
          ? form.openingBalanceTargetCycleKey
          : '';
      const payload = {
        ...form,
        moduleScope: MODULE_SCOPE,
        listOrder: Number(form.listOrder || 0),
        salaryType: normalizeSalaryType(form.salaryType),
        baseSalary: Number(form.baseSalary || 0),
        knottingPaymentMethod: form.knottingPaymentMethod || 'monthly',
        dutyHours: Number(form.dutyHours || 0),
        weeklyOffDays: normalizeWeeklyOffDays(form.weeklyOffDays),
        paidLeaveAllowance: Number(form.paidLeaveAllowance || 0),
        otAllowed: form.otAllowed !== false,
        joiningDate: form.joiningDate || todayInput(),
        openingBalance: {
          amount: openingBalanceAmount,
          type: openingBalanceType,
          deductionIntent: openingBalanceDeductionIntent,
          targetCycleKey: openingBalanceTargetCycleKey,
        },
        status: 'active',
      };
      const savedEmployee = isEdit
        ? await updateEmployee(id, payload, { moduleScope: MODULE_SCOPE })
        : await createEmployee(payload, { moduleScope: MODULE_SCOPE });

      if (saveAndNew && !isEdit) {
        await resetFormToDefaults();
        return true;
      }

      navigate(`/weaving/employees/${savedEmployee?._id || id}`);
      return true;
    } catch (saveError) {
      applyServerFieldError(saveError);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await saveEmployee();
  };

  const masterTitleKey = masterModal
    ? `weaving.employees.${masterModal}Master`
    : 'weaving.employees.departmentMaster';

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
              {isEdit ? t('weaving.employees.edit') : t('weaving.employees.add')}
            </h1>
          </div>
          <TravelActionButton icon={FaSave} onClick={handleSubmit} disabled={saving}>
            {saving ? t('travel.common.saving') : t('travel.common.save')}
          </TravelActionButton>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-3">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt=""
                  className="h-28 w-28 rounded-lg object-cover"
                />
              ) : (
                <FaUserCircle className="h-28 w-28 text-cyan-700" aria-hidden="true" />
              )}
              <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
                {t('weaving.employees.fields.photo')}
                <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
              </label>
              {photoPreview && (
                <button
                  type="button"
                  onClick={removePhoto}
                  title={t('travel.common.delete')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                >
                  <FaTimes aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <InputField
                labelKey="weaving.employees.fields.employeeNo"
                name="employeeNo"
                value={form.employeeNo}
                onChange={handleChange}
                error={fieldErrors.employeeNo}
              />
              <InputField
                labelKey="weaving.employees.fields.listOrder"
                name="listOrder"
                type="number"
                min="1"
                value={form.listOrder}
                onChange={handleChange}
                error={fieldErrors.listOrder}
              />
              <InputField
                labelKey="employees.fields.name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholderKey="employees.placeholders.name"
                error={fieldErrors.name}
              />
              <InputField
                labelKey="weaving.employees.fields.fatherName"
                name="fatherName"
                value={form.fatherName}
                onChange={handleChange}
                required
                error={fieldErrors.fatherName}
              />
              <InputField
                labelKey="weaving.employees.fields.cnic"
                name="cnic"
                value={form.cnic}
                onChange={handleChange}
                placeholderKey="weaving.employees.placeholders.cnic"
                inputMode="numeric"
                error={fieldErrors.cnic}
              />
              <InputField
                labelKey="weaving.employees.fields.phone"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                required
                error={fieldErrors.phone}
              />
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-extrabold text-slate-500">
                  {t('weaving.employees.fields.gender')}
                </span>
                <select
                  value={form.gender || ''}
                  onChange={(event) => handleChange('gender', event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">{t('weaving.employees.placeholders.gender')}</option>
                  <option value="male">{t('weaving.employees.gender.male')}</option>
                  <option value="female">{t('weaving.employees.gender.female')}</option>
                  <option value="other">{t('weaving.employees.gender.other')}</option>
                </select>
              </label>
              <InputField
                labelKey="weaving.employees.fields.joiningDate"
                name="joiningDate"
                type="date"
                value={form.joiningDate}
                onChange={handleChange}
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SelectWithAdd
              labelKey="weaving.employees.fields.unit"
              name="unitId"
              value={form.unitId}
              onChange={handleChange}
              options={unitOptions}
              placeholderKey="weaving.employees.placeholders.unit"
              onAdd={() => openMasterModal('unit')}
              addTitleKey="weaving.employees.actions.addUnit"
              required
              error={fieldErrors.unitId}
            />
            <SelectWithAdd
              labelKey="weaving.employees.fields.department"
              name="departmentId"
              value={form.departmentId}
              onChange={handleChange}
              options={departmentOptions}
              placeholderKey="weaving.employees.placeholders.department"
              onAdd={() => openMasterModal('department')}
              addTitleKey="weaving.employees.actions.addDepartment"
              required
              error={fieldErrors.departmentId}
            />
            <SelectWithAdd
              labelKey="weaving.employees.fields.designation"
              name="designationId"
              value={form.designationId}
              onChange={handleChange}
              options={designationOptions}
              placeholderKey="employees.placeholders.designation"
              onAdd={() => openMasterModal('designation')}
              addTitleKey="weaving.employees.actions.addDesignation"
              error={fieldErrors.designationId}
            />
            <SelectWithAdd
              labelKey="weaving.employees.fields.shift"
              name="shiftId"
              value={form.shiftId}
              onChange={handleChange}
              options={shiftOptions}
              placeholderKey="weaving.employees.placeholders.shift"
              onAdd={() => openMasterModal('shift')}
              addTitleKey="weaving.employees.actions.addShift"
              required
              error={fieldErrors.shiftId}
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <h2 className="mb-3 text-sm font-extrabold text-slate-800">
            {t('weaving.employees.sections.salaryDuty')}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isKnottingWorker && (
              <label className="block min-w-0 xl:col-span-2">
                <span className="mb-1 block text-xs font-extrabold text-slate-500">
                  Knotting Payment Method
                </span>
                <select
                  value={form.knottingPaymentMethod || 'monthly'}
                  onChange={(event) => handleChange('knottingPaymentMethod', event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="monthly">Monthly</option>
                  <option value="per_beam">Per Beam</option>
                  <option value="per_set">Per Set</option>
                  <option value="monthly_per_beam">Monthly + Per Beam Bonus</option>
                  <option value="monthly_per_set">Monthly + Per Set Bonus</option>
                </select>
              </label>
            )}
            {!isPieceOnlyKnotting && <>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('weaving.employees.fields.salaryType')}
              </span>
              <select
                value={form.salaryType || 'monthly'}
                onChange={(event) => handleChange('salaryType', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="monthly">{t('weaving.employees.salary.monthly')}</option>
                <option value="daily">{t('weaving.employees.salary.daily')}</option>
              </select>
            </label>
            <InputField
              labelKey={
                form.salaryType === 'daily'
                  ? 'weaving.employees.fields.perDayRate'
                  : 'weaving.employees.fields.monthlySalary'
              }
              name="baseSalary"
              type="number"
              min="0"
              step="0.01"
              value={form.baseSalary}
              onChange={handleChange}
              error={fieldErrors.baseSalary}
            />
            </>}
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <span className="block text-xs font-extrabold text-slate-500">
                {t('weaving.employees.fields.dutyHours')}
                {!isEdit && <span className="text-rose-500"> *</span>}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['8', 'weaving.employees.duty.eightHours'],
                  ['12', 'weaving.employees.duty.twelveHours'],
                  ['custom', 'weaving.employees.duty.custom'],
                ].map(([mode, labelKey]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={dutyMode === mode}
                    onClick={() => handleDutyModeChange(mode)}
                    className={`h-10 rounded-lg border px-2 text-xs font-extrabold transition ${
                      dutyMode === mode
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
              {dutyMode === 'custom' && (
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  value={form.dutyHours || ''}
                  onChange={(event) => handleChange('dutyHours', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.dutyHours)}
                  className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${
                    fieldErrors.dutyHours ? 'border-rose-300' : 'border-slate-200'
                  }`}
                />
              )}
              {fieldErrors.dutyHours && (
                <p className="text-xs font-bold text-rose-600">{fieldErrors.dutyHours}</p>
              )}
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2 xl:col-span-4">
              <span className="block text-xs font-extrabold text-slate-500">
                {t('weaving.employees.fields.weeklyOffDays')}
              </span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_KEYS.map((day) => {
                  const selected = form.weeklyOffDays.includes(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWeeklyOffDay(day)}
                      className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {t(`weaving.employees.weekdays.${day}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <InputField
              labelKey="weaving.employees.fields.paidLeaveAllowance"
              name="paidLeaveAllowance"
              type="number"
              min="0"
              step="1"
              value={form.paidLeaveAllowance}
              onChange={handleChange}
              error={fieldErrors.paidLeaveAllowance}
            />
            <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
              <span className="text-xs font-extrabold text-slate-600">
                {t('weaving.employees.fields.otAllowed')}
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-extrabold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.otAllowed !== false}
                  onChange={(event) => handleChange('otAllowed', event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                {form.otAllowed !== false ? t('weaving.employees.yes') : t('weaving.employees.no')}
              </span>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:col-span-2 xl:col-span-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InputField
                  labelKey="weaving.employees.fields.openingBalanceAmount"
                  name="openingBalanceAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.openingBalanceAmount}
                  onChange={handleChange}
                  error={fieldErrors.openingBalanceAmount}
                />
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-extrabold text-slate-500">
                    {t('weaving.employees.fields.openingBalanceType')}
                  </span>
                  <select
                    value={form.openingBalanceType || ''}
                    onChange={(event) => handleChange('openingBalanceType', event.target.value)}
                    disabled={!hasOpeningBalance}
                    aria-invalid={Boolean(fieldErrors.openingBalanceType)}
                    className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-400 ${
                      fieldErrors.openingBalanceType ? 'border-rose-300' : 'border-slate-200'
                    }`}
                  >
                    <option value="">{t('weaving.employees.openingBalance.none')}</option>
                    <option value="payable">{t('weaving.employees.openingBalance.payable')}</option>
                    <option value="receivable">{t('weaving.employees.openingBalance.receivable')}</option>
                  </select>
                  {fieldErrors.openingBalanceType && (
                    <p className="mt-1 text-xs font-bold text-rose-600">
                      {fieldErrors.openingBalanceType}
                    </p>
                  )}
                </label>
                {hasOpeningBalance && form.openingBalanceType === 'receivable' && (
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-extrabold text-slate-500">
                      {t('weaving.employees.fields.recoveryMethod')}
                    </span>
                    <select
                      value={form.openingBalanceDeductionIntent || 'future_salary'}
                      onChange={(event) =>
                        handleChange('openingBalanceDeductionIntent', event.target.value)
                      }
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    >
                      <option value="future_salary">
                        {t('weaving.employees.openingBalance.futureSalary')}
                      </option>
                      <option value="manual_review">
                        {t('weaving.employees.openingBalance.manualReview')}
                      </option>
                    </select>
                  </label>
                )}
                {hasOpeningBalance &&
                  form.openingBalanceType === 'receivable' &&
                  form.openingBalanceDeductionIntent === 'manual_review' && (
                    <div className="min-w-0 rounded-lg border border-cyan-100 bg-white p-3 sm:col-span-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-500">
                            {t('weaving.employees.fields.salaryCycle')}
                          </p>
                          <p className="text-sm font-bold text-slate-800">
                            {selectedCycleSummary || t('weaving.employees.notSet')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={openCyclePicker}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-cyan-100 bg-cyan-50 px-3 text-xs font-extrabold text-cyan-800 hover:bg-cyan-100"
                        >
                          {t('weaving.employees.actions.selectSalaryCycle')}
                        </button>
                      </div>
                      {fieldErrors.openingBalanceTargetCycleKey && (
                        <p className="mt-2 text-xs font-bold text-rose-600">
                          {fieldErrors.openingBalanceTargetCycleKey}
                        </p>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-extrabold text-slate-800 md:px-4"
          >
            {t('weaving.employees.moreDetails')}
            {detailsOpen ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
          </button>
          {detailsOpen && (
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 md:p-4 lg:grid-cols-3">
              <TextAreaField
                labelKey="weaving.employees.fields.address"
                name="address"
                value={form.address}
                onChange={handleChange}
              />
              <TextAreaField
                labelKey="weaving.employees.fields.emergencyContact"
                name="emergencyContact"
                value={form.emergencyContact}
                onChange={handleChange}
              />
              <TextAreaField
                labelKey="weaving.employees.fields.notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
              />
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          <TravelActionButton
            icon={FaTimes}
            variant="secondary"
            onClick={clearForm}
            disabled={saving}
          >
            {t('clear')}
          </TravelActionButton>
          <TravelActionButton
            variant="secondary"
            onClick={() => navigate('/weaving/employees')}
            disabled={saving}
          >
            {t('travel.common.cancel')}
          </TravelActionButton>
          {!isEdit && (
            <TravelActionButton
              type="button"
              icon={FaPlus}
              variant="soft"
              onClick={() => saveEmployee({ saveAndNew: true })}
              disabled={saving}
            >
              {t('saveNew')}
            </TravelActionButton>
          )}
          <TravelActionButton type="submit" icon={FaSave} disabled={saving}>
            {saving ? t('travel.common.saving') : t('travel.common.save')}
          </TravelActionButton>
        </div>
      </form>

      {cyclePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-black text-slate-950">
                {t('weaving.employees.actions.selectSalaryCycle')}
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {t('weaving.employees.cycle.pickerHelp')}
              </p>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-auto p-3">
              {salaryCycles.map((cycle) => {
                const selected = pendingCycleKey === cycle.key;

                return (
                  <button
                    key={cycle.key}
                    type="button"
                    onClick={() => setPendingCycleKey(cycle.key)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selected
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm font-black text-slate-900">{cycle.key}</span>
                    <span className="mt-1 block text-xs font-bold text-slate-600">
                      {t('weaving.employees.fields.salaryPeriod')}: {' '}
                      {formatBusinessDateForDisplay(cycle.periodStart)} - {' '}
                      {formatBusinessDateForDisplay(cycle.periodEnd)}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-cyan-800">
                      {t('weaving.employees.fields.paymentDate')}: {' '}
                      {formatBusinessDateForDisplay(cycle.payDate)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <TravelActionButton variant="secondary" onClick={cancelCyclePicker}>
                {t('travel.common.cancel')}
              </TravelActionButton>
              <TravelActionButton onClick={confirmCyclePicker} disabled={!pendingCycleKey}>
                {t('weaving.employees.actions.confirmSalaryCycle')}
              </TravelActionButton>
            </div>
          </div>
        </div>
      )}

      {masterModal && (
        <TravelFormModal
          open={Boolean(masterModal)}
          titleKey={masterTitleKey}
          modeKey="travel.common.addWithDetails"
          fields={
            masterModal === 'unit'
              ? [
                  {
                    name: 'unitNo',
                    labelKey: 'weaving.employees.fields.unitNo',
                    type: 'number',
                    min: 1,
                    required: true,
                  },
                  {
                    name: 'name',
                    labelKey: 'weaving.employees.fields.unitName',
                  },
                ]
              : [
                  {
                    name: 'name',
                    labelKey: `weaving.employees.fields.${masterModal}`,
                    required: true,
                  },
                ]
          }
          values={masterForm}
          onChange={(name, value) => setMasterForm((current) => ({ ...current, [name]: value }))}
          onClose={closeMasterModal}
          onSubmit={saveMaster}
          submitting={saving}
          error=""
        />
      )}
    </div>
  );
};

export default WeavingEmployeeFormPage;
