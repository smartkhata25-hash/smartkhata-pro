import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBook,
  FaBuilding,
  FaClock,
  FaEdit,
  FaEye,
  FaEyeSlash,
  FaPlus,
  FaRedo,
  FaTrash,
  FaUserCircle,
  FaUsers,
  FaWarehouse,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  TravelActionButton,
  TravelCardLine,
  TravelFilterSelect,
  TravelFormModal,
  TravelSearchInput,
  TravelSegmentedControl,
  TravelStatusBadge,
  buildTravelConfirmMessage,
} from '../../components/travel/master/TravelMasterUI';
import {
  EMPLOYEE_MODULE_SCOPES,
  createWeavingUnit,
  deleteEmployee,
  deleteWeavingUnit,
  getEmployeeFormMeta,
  getEmployees,
  restoreEmployee,
  updateWeavingUnit,
} from '../../services/employeeService';
import { hasPermission } from '../../utils/permissionHelper';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

const MODULE_SCOPE = EMPLOYEE_MODULE_SCOPES.WEAVING;

const EMPTY_UNIT_FORM = {
  unitNo: '',
  name: '',
};

const getErrorMessage = (error, fallbackKey) =>
  error?.response?.data?.message || t(fallbackKey);

const getUnitLabel = (unit = {}) =>
  unit.name ? `Unit ${unit.unitNo} - ${unit.name}` : `Unit ${unit.unitNo}`;

const getInitials = (name = '') =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'E';

const formatMoney = (value) => Number(value || 0).toLocaleString('en-GB');

const formatEmployeeSalary = (employee = {}) => {
  const unitKey =
    employee.salaryType === 'daily'
      ? 'weaving.employees.salary.day'
      : 'weaving.employees.salary.month';

  return `${formatMoney(employee.baseSalary)} / ${t(unitKey)}`;
};

const buildOptions = (records, getLabel = (record) => record.name) =>
  records.map((record) => ({
    value: record._id,
    label: getLabel(record),
  }));

const statIconClasses = 'text-[11px] text-cyan-700';

const StatChip = ({ icon: Icon, labelKey, value }) => (
  <div className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5">
    <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white text-cyan-700 shadow-sm">
      <Icon aria-hidden="true" className={statIconClasses} />
    </span>
    <span className="min-w-0">
      <span className="block truncate text-[11px] font-extrabold uppercase tracking-normal text-slate-500">
        {t(labelKey)}
      </span>
      <span className="block text-sm font-black leading-tight text-slate-950">{value}</span>
    </span>
  </div>
);

const IconActionButton = ({
  icon: Icon,
  title,
  onClick,
  disabled = false,
  variant = 'secondary',
}) => {
  const variantClasses = {
    secondary: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    soft: 'border-cyan-100 bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  };

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-45 ${
        variantClasses[variant] || variantClasses.secondary
      }`}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </button>
  );
};

const WeavingEmployeesPage = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [meta, setMeta] = useState({
    units: [],
    departments: [],
    designations: [],
    shifts: [],
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [filters, setFilters] = useState({
    unitId: '',
    departmentId: '',
    designationId: '',
    shiftId: '',
  });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [unitMasterOpen, setUnitMasterOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [unitForm, setUnitForm] = useState(EMPTY_UNIT_FORM);
  const [unitError, setUnitError] = useState('');
  useWeavingFeedback(pageError, setPageError, { type: 'error' });
  useWeavingFeedback(unitError, setUnitError, { type: 'error' });
  const [savingUnit, setSavingUnit] = useState(false);
  const [actingId, setActingId] = useState('');

  const canCreate = hasPermission('employees.create');
  const canEdit = hasPermission('employees.edit');
  const canDelete = hasPermission('employees.delete');
  const canViewLedger = hasPermission('employees.view_ledger');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError('');

    try {
      const [employeeRows, formMeta] = await Promise.all([
        getEmployees({
          moduleScope: MODULE_SCOPE,
          search,
          status,
          ...filters,
        }),
        getEmployeeFormMeta({ moduleScope: MODULE_SCOPE }),
      ]);

      setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
      setMeta({
        units: Array.isArray(formMeta?.units) ? formMeta.units : [],
        departments: Array.isArray(formMeta?.departments) ? formMeta.departments : [],
        designations: Array.isArray(formMeta?.designations) ? formMeta.designations : [],
        shifts: Array.isArray(formMeta?.shifts) ? formMeta.shifts : [],
      });
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.employees.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filters, search, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const unitOptions = useMemo(() => buildOptions(meta.units, getUnitLabel), [meta.units]);
  const departmentOptions = useMemo(() => buildOptions(meta.departments), [meta.departments]);
  const designationOptions = useMemo(() => buildOptions(meta.designations), [meta.designations]);
  const shiftOptions = useMemo(() => buildOptions(meta.shifts), [meta.shifts]);
  const filtersActive = Boolean(searchInput || Object.values(filters).some(Boolean));

  const handleFilterChange = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilters({
      unitId: '',
      departmentId: '',
      designationId: '',
      shiftId: '',
    });
  };

  const openUnitMaster = () => {
    setEditingUnit(null);
    setUnitForm(EMPTY_UNIT_FORM);
    setUnitError('');
    setUnitMasterOpen(true);
  };

  const editUnit = (event, unit) => {
    event.stopPropagation();
    setEditingUnit(unit);
    setUnitForm({
      unitNo: unit.unitNo || '',
      name: unit.name || '',
    });
    setUnitError('');
  };

  const saveUnit = async (event) => {
    event.preventDefault();
    setSavingUnit(true);
    setUnitError('');

    try {
      const payload = {
        unitNo: Number(unitForm.unitNo || 0),
        name: unitForm.name,
      };

      if (editingUnit?._id) {
        await updateWeavingUnit(editingUnit._id, payload, { moduleScope: MODULE_SCOPE });
      } else {
        await createWeavingUnit(payload, { moduleScope: MODULE_SCOPE });
      }

      setEditingUnit(null);
      setUnitForm(EMPTY_UNIT_FORM);
      await loadData();
    } catch (error) {
      setUnitError(getErrorMessage(error, 'weaving.employees.messages.masterSaveFailed'));
    } finally {
      setSavingUnit(false);
    }
  };

  const removeUnit = async (event, unit) => {
    event.stopPropagation();

    if (!await requestWeavingConfirmation({ message: buildTravelConfirmMessage('weaving.employees.messages.deleteUnit', getUnitLabel(unit)) })) {
      return;
    }

    setActingId(unit._id);
    setUnitError('');

    try {
      await deleteWeavingUnit(unit._id, { moduleScope: MODULE_SCOPE });
      await loadData();
    } catch (error) {
      setUnitError(getErrorMessage(error, 'weaving.employees.messages.masterDeleteFailed'));
    } finally {
      setActingId('');
    }
  };

  const handleHideEmployee = async (event, employee) => {
    event.stopPropagation();

    if (!await requestWeavingConfirmation({ message: buildTravelConfirmMessage('weaving.employees.messages.hideConfirm', employee.name) })) {
      return;
    }

    setActingId(employee._id);

    try {
      await deleteEmployee(employee._id, { moduleScope: MODULE_SCOPE });
      await loadData();
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.employees.messages.hideFailed'));
    } finally {
      setActingId('');
    }
  };

  const handleRestoreEmployee = async (event, employee) => {
    event.stopPropagation();

    if (!await requestWeavingConfirmation({ message: buildTravelConfirmMessage('weaving.employees.messages.restoreConfirm', employee.name) })) {
      return;
    }

    setActingId(employee._id);

    try {
      await restoreEmployee(employee._id, { moduleScope: MODULE_SCOPE });
      await loadData();
    } catch (error) {
      setPageError(getErrorMessage(error, 'weaving.employees.messages.restoreFailed'));
    } finally {
      setActingId('');
    }
  };

  const columns = [
    {
      key: 'order',
      labelKey: 'weaving.employees.columns.order',
      className: 'w-[5%]',
      render: (employee) => employee.listOrder || '-',
    },
    {
      key: 'employee',
      labelKey: 'weaving.employees.columns.employee',
      className: 'w-[20%]',
      render: (employee) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-xs font-black text-cyan-700">
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-extrabold text-slate-900">{employee.name}</p>
            <p className="truncate text-xs font-semibold text-slate-500">{employee.employeeNo || '-'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'unit',
      labelKey: 'weaving.employees.columns.unit',
      render: (employee) =>
        employee.unitNo ? getUnitLabel({ unitNo: employee.unitNo, name: employee.unitName }) : '-',
    },
    {
      key: 'department',
      labelKey: 'weaving.employees.columns.department',
      render: (employee) => employee.departmentName || employee.departmentId?.name || '-',
    },
    {
      key: 'designation',
      labelKey: 'weaving.employees.columns.designation',
      render: (employee) => employee.designationName || employee.designationId?.name || '-',
    },
    {
      key: 'shift',
      labelKey: 'weaving.employees.columns.shift',
      render: (employee) => employee.shiftName || employee.shiftId?.name || '-',
    },
    {
      key: 'phone',
      labelKey: 'weaving.employees.columns.phone',
      render: (employee) => employee.phone || '-',
    },
    {
      key: 'salary',
      labelKey: 'weaving.employees.columns.basicSalary',
      render: (employee) => formatEmployeeSalary(employee),
    },
    {
      key: 'actions',
      labelKey: 'travel.common.actions',
      className: 'w-[13%]',
      render: (employee) => (
        <div className="flex flex-wrap gap-1">
          <IconActionButton
            icon={FaEye}
            variant="soft"
            title={t('weaving.employees.actions.viewProfile')}
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/weaving/employees/${employee._id}`);
            }}
          />
          {canEdit && status === 'active' && (
            <IconActionButton
              icon={FaEdit}
              variant="secondary"
              title={t('weaving.employees.actions.editEmployee')}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/weaving/employees/${employee._id}/edit`);
              }}
            />
          )}
          {canViewLedger && (
            <IconActionButton
              icon={FaBook}
              variant="secondary"
              title={t('weaving.employees.actions.viewLedger')}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/weaving/employees/${employee._id}/ledger`);
              }}
            />
          )}
          {canEdit && status === 'inactive' && (
            <IconActionButton
              icon={FaRedo}
              variant="success"
              disabled={actingId === employee._id}
              title={t('weaving.employees.actions.restore')}
              onClick={(event) => handleRestoreEmployee(event, employee)}
            />
          )}
          {canDelete && status === 'active' && (
            <IconActionButton
              icon={FaEyeSlash}
              variant="danger"
              disabled={actingId === employee._id}
              title={t('weaving.employees.actions.hideEmployee')}
              onClick={(event) => handleHideEmployee(event, employee)}
            />
          )}
        </div>
      ),
    },
  ];

  const stats = [
    ['weaving.employees.summary.employees', employees.length, FaUsers],
    ['weaving.employees.summary.units', meta.units.length, FaWarehouse],
    ['weaving.employees.summary.departments', meta.departments.length, FaBuilding],
    ['weaving.employees.summary.shifts', meta.shifts.length, FaClock],
  ];

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-3 sm:p-4 md:p-5 lg:p-6">
      <section className="mb-3 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
        <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
        <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(180px,1fr)_minmax(360px,520px)_auto] lg:items-center md:px-4">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight text-slate-950 md:text-xl">
              {t('weaving.employees.title')}
            </h1>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 md:text-sm">
              {t('weaving.employees.subtitle')}
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {stats.map(([labelKey, value, Icon]) => (
              <StatChip key={labelKey} icon={Icon} labelKey={labelKey} value={value} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {canEdit && (
              <TravelActionButton icon={FaWarehouse} variant="secondary" onClick={openUnitMaster}>
                {t('weaving.employees.unitMaster')}
              </TravelActionButton>
            )}
            {canCreate && (
              <TravelActionButton icon={FaPlus} onClick={() => navigate('/weaving/employees/new')}>
                {t('weaving.employees.add')}
              </TravelActionButton>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 md:px-4">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="min-w-[220px] flex-[1.6]">
              <TravelSearchInput
                value={searchInput}
                onChange={setSearchInput}
                placeholderKey="weaving.employees.search"
              />
            </div>
            <div className="grid min-w-0 flex-[2] grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:flex xl:items-center">
              <TravelFilterSelect
                value={filters.unitId}
                onChange={(value) => handleFilterChange('unitId', value)}
                placeholderKey="weaving.employees.filters.allUnits"
                options={unitOptions}
                className="w-full xl:w-36"
              />
              <TravelFilterSelect
                value={filters.departmentId}
                onChange={(value) => handleFilterChange('departmentId', value)}
                placeholderKey="weaving.employees.filters.allDepartments"
                options={departmentOptions}
                className="w-full xl:w-40"
              />
              <TravelFilterSelect
                value={filters.designationId}
                onChange={(value) => handleFilterChange('designationId', value)}
                placeholderKey="weaving.employees.filters.allDesignations"
                options={designationOptions}
                className="w-full xl:w-40"
              />
              <TravelFilterSelect
                value={filters.shiftId}
                onChange={(value) => handleFilterChange('shiftId', value)}
                placeholderKey="weaving.employees.filters.allShifts"
                options={shiftOptions}
                className="w-full xl:w-36"
              />
              <div className="col-span-2 sm:col-span-1">
                <TravelSegmentedControl
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'active', labelKey: 'weaving.employees.active' },
                    { value: 'inactive', labelKey: 'weaving.employees.inactive' },
                  ]}
                />
              </div>
              {filtersActive && (
                <TravelActionButton variant="secondary" onClick={clearFilters}>
                  {t('reset')}
                </TravelActionButton>
              )}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-auto md:block">
            <table className="min-w-[920px] w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-[11px] font-extrabold uppercase tracking-normal text-slate-600">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={`border border-slate-300 px-2 py-2 ${column.className || ''}`}
                    >
                      {t(column.labelKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr
                    key={employee._id}
                    onClick={() => navigate(`/weaving/employees/${employee._id}`)}
                    className="cursor-pointer border-b border-slate-200 odd:bg-white even:bg-slate-50/40 hover:bg-cyan-50/60"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className="border-x border-slate-200 px-2 py-1.5 align-middle text-slate-700"
                      >
                        {column.render ? column.render(employee) : employee[column.key] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-2 md:hidden">
            {employees.map((employee) => (
              <div
                key={employee._id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/weaving/employees/${employee._id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/weaving/employees/${employee._id}`);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FaUserCircle className="flex-shrink-0 text-2xl text-cyan-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{employee.name}</p>
                      <p className="truncate text-xs font-semibold text-slate-500">
                        {employee.employeeNo || '-'}
                      </p>
                    </div>
                  </div>
                  <TravelStatusBadge active={!employee.isDeleted && employee.status !== 'inactive'} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TravelCardLine
                    labelKey="weaving.employees.columns.unit"
                    value={employee.unitNo ? `Unit ${employee.unitNo}` : '-'}
                  />
                  <TravelCardLine
                    labelKey="weaving.employees.columns.department"
                    value={employee.departmentName || '-'}
                  />
                  <TravelCardLine
                    labelKey="weaving.employees.columns.designation"
                    value={employee.designationName || '-'}
                  />
                  <TravelCardLine
                    labelKey="weaving.employees.columns.shift"
                    value={employee.shiftName || '-'}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <IconActionButton
                    icon={FaEye}
                    variant="soft"
                    title={t('weaving.employees.actions.viewProfile')}
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/weaving/employees/${employee._id}`);
                    }}
                  />
                  {canEdit && status === 'active' && (
                    <IconActionButton
                      icon={FaEdit}
                      variant="secondary"
                      title={t('weaving.employees.actions.editEmployee')}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/weaving/employees/${employee._id}/edit`);
                      }}
                    />
                  )}
                  {canViewLedger && (
                    <IconActionButton
                      icon={FaBook}
                      variant="secondary"
                      title={t('weaving.employees.actions.viewLedger')}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/weaving/employees/${employee._id}/ledger`);
                      }}
                    />
                  )}
                  {canEdit && status === 'inactive' && (
                    <IconActionButton
                      icon={FaRedo}
                      variant="success"
                      disabled={actingId === employee._id}
                      title={t('weaving.employees.actions.restore')}
                      onClick={(event) => handleRestoreEmployee(event, employee)}
                    />
                  )}
                  {canDelete && status === 'active' && (
                    <IconActionButton
                      icon={FaEyeSlash}
                      variant="danger"
                      disabled={actingId === employee._id}
                      title={t('weaving.employees.actions.hideEmployee')}
                      onClick={(event) => handleHideEmployee(event, employee)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {employees.length === 0 && (
            <div className="border-t border-slate-100 px-4 py-10 text-center text-sm font-semibold text-slate-500">
              {t('weaving.employees.empty')}
            </div>
          )}
        </section>
      )}

      {unitMasterOpen && (
        <TravelFormModal
          open={unitMasterOpen}
          titleKey="weaving.employees.unitMaster"
          modeKey={editingUnit ? 'travel.common.edit' : 'travel.common.addWithDetails'}
          fields={[
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
          ]}
          values={unitForm}
          onChange={(name, value) => setUnitForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setUnitMasterOpen(false)}
          onSubmit={saveUnit}
          submitting={savingUnit}
          error=""
        >
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {meta.units.map((unit) => (
              <div
                key={unit._id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">
                  {getUnitLabel(unit)}
                </span>
                <div className="flex flex-shrink-0 gap-1.5">
                  <TravelActionButton icon={FaEdit} variant="secondary" onClick={(event) => editUnit(event, unit)}>
                    {t('travel.common.edit')}
                  </TravelActionButton>
                  <TravelActionButton
                    icon={FaTrash}
                    variant="danger"
                    disabled={actingId === unit._id}
                    onClick={(event) => removeUnit(event, unit)}
                  >
                    {t('travel.common.delete')}
                  </TravelActionButton>
                </div>
              </div>
            ))}
          </div>
        </TravelFormModal>
      )}
    </div>
  );
};

export default WeavingEmployeesPage;
