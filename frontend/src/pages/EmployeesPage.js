import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBook, FaBriefcase, FaEdit, FaPlus, FaTrash } from 'react-icons/fa';

import { t } from '../i18n/i18n';
import {
  TravelActionButton,
  TravelCardLine,
  TravelFilterSelect,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  TravelStatusBadge,
  buildTravelConfirmMessage,
  formatTravelMoney,
} from '../components/travel/master/TravelMasterUI';
import {
  createEmployee,
  createEmployeeDesignation,
  deleteEmployee,
  deleteEmployeeDesignation,
  getEmployeeDesignations,
  getEmployeeSummary,
  getEmployees,
  updateEmployee,
} from '../services/employeeService';
import { hasPermission } from '../utils/permissionHelper';

const EMPTY_EMPLOYEE_FORM = {
  name: '',
  phone: '',
  cnic: '',
  designationId: '',
  designationName: '',
  joiningDate: '',
  salaryType: 'monthly',
  baseSalary: '',
  status: 'active',
  address: '',
  notes: '',
};

const formatDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const getBalanceLabel = (employee) => {
  const payable = Number(employee.payableBalance || 0);
  const recoverable = Number(employee.recoverableBalance || 0);

  if (payable > 0) return `${formatTravelMoney(payable)} ${t('employees.payable')}`;
  if (recoverable > 0) {
    return `${formatTravelMoney(recoverable)} ${t('employees.recoverable')}`;
  }
  return t('employees.settled');
};

const EmployeesPage = ({ moduleScope = 'trading' }) => {
  const navigate = useNavigate();
  const isTravel = moduleScope === 'travel';
  const [employees, setEmployees] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [designationOpen, setDesignationOpen] = useState(false);
  const [designationName, setDesignationName] = useState('');
  const [pageError, setPageError] = useState('');

  const canManage = hasPermission('employees.create') || hasPermission('employees.edit');
  const canDelete = hasPermission('employees.delete');
  const canViewLedger = hasPermission('employees.view_ledger');

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError('');

    try {
      const [employeeRows, designationRows, summaryData] = await Promise.all([
        getEmployees({ moduleScope, search, status }),
        getEmployeeDesignations({ moduleScope }),
        getEmployeeSummary({ moduleScope }),
      ]);

      setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
      setDesignations(Array.isArray(designationRows) ? designationRows : []);
      setSummary(summaryData || null);
    } catch (error) {
      setPageError(error?.response?.data?.message || t('employees.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [moduleScope, search, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const designationOptions = useMemo(
    () =>
      designations.map((designation) => ({
        value: designation._id,
        label: designation.name,
      })),
    [designations]
  );

  const openCreateForm = () => {
    setEditingEmployee(null);
    setForm(EMPTY_EMPLOYEE_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (employee) => {
    setEditingEmployee(employee);
    setForm({
      name: employee.name || '',
      phone: employee.phone || '',
      cnic: employee.cnic || '',
      designationId: employee.designationId?._id || employee.designationId || '',
      designationName: employee.designationName || '',
      joiningDate: formatDateInput(employee.joiningDate),
      salaryType: employee.salaryType || 'monthly',
      baseSalary: employee.baseSalary || '',
      status: employee.status || 'active',
      address: employee.address || '',
      notes: employee.notes || '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const handleFormChange = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setFormError(t('employees.nameRequired'));
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = {
        ...form,
        moduleScope,
        baseSalary: Number(form.baseSalary || 0),
      };

      if (editingEmployee?._id) {
        await updateEmployee(editingEmployee._id, payload, { moduleScope });
      } else {
        await createEmployee(payload, { moduleScope });
      }

      setFormOpen(false);
      await loadData();
    } catch (error) {
      setFormError(error?.response?.data?.message || t('employees.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (employee) => {
    if (!window.confirm(buildTravelConfirmMessage('employees.deleteConfirm', employee.name))) {
      return;
    }

    await deleteEmployee(employee._id, { moduleScope });
    await loadData();
  };

  const handleCreateDesignation = async (event) => {
    event.preventDefault();
    const name = designationName.trim();

    if (!name) return;

    setSaving(true);
    try {
      await createEmployeeDesignation({ name, moduleScope }, { moduleScope });
      setDesignationName('');
      setDesignationOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDesignation = async (designation) => {
    if (!window.confirm(buildTravelConfirmMessage('employees.deleteDesignation', designation.name))) {
      return;
    }

    await deleteEmployeeDesignation(designation._id, { moduleScope });
    await loadData();
  };

  const openLedger = (employee) => {
    navigate(isTravel ? `/travel/employees/${employee._id}/ledger` : `/employees/${employee._id}/ledger`);
  };

  const employeeFields = [
    {
      name: 'name',
      labelKey: 'employees.fields.name',
      placeholderKey: 'employees.placeholders.name',
      required: true,
    },
    { name: 'phone', labelKey: 'employees.fields.phone' },
    { name: 'cnic', labelKey: 'employees.fields.cnic' },
    {
      name: 'designationId',
      labelKey: 'employees.fields.designation',
      type: 'select',
      placeholderKey: 'employees.placeholders.designation',
      options: designationOptions,
    },
    { name: 'designationName', labelKey: 'employees.fields.customDesignation' },
    { name: 'joiningDate', labelKey: 'employees.fields.joiningDate', type: 'date' },
    {
      name: 'salaryType',
      labelKey: 'employees.fields.salaryType',
      type: 'select',
      options: [
        { value: 'monthly', labelKey: 'employees.salaryTypes.monthly' },
        { value: 'daily', labelKey: 'employees.salaryTypes.daily' },
      ],
    },
    { name: 'baseSalary', labelKey: 'employees.fields.baseSalary', type: 'number', min: 0, step: '0.01' },
    {
      name: 'status',
      labelKey: 'employees.fields.status',
      type: 'select',
      options: [
        { value: 'active', labelKey: 'travel.common.active' },
        { value: 'inactive', labelKey: 'travel.common.inactive' },
      ],
    },
    { name: 'address', labelKey: 'employees.fields.address', type: 'textarea', fullWidth: true },
    { name: 'notes', labelKey: 'employees.fields.notes', type: 'textarea', fullWidth: true },
  ];

  const columns = [
    {
      key: 'employee',
      labelKey: 'employees.columns.employee',
      className: 'w-[24%]',
      render: (employee) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-900">{employee.name}</p>
          <p className="truncate text-xs font-semibold text-slate-500">{employee.phone || '-'}</p>
        </div>
      ),
    },
    {
      key: 'designation',
      labelKey: 'employees.columns.designation',
      render: (employee) => employee.designationName || employee.designationId?.name || '-',
    },
    {
      key: 'baseSalary',
      labelKey: 'employees.columns.baseSalary',
      render: (employee) => formatTravelMoney(employee.baseSalary || 0),
    },
    {
      key: 'balance',
      labelKey: 'employees.columns.balance',
      render: getBalanceLabel,
    },
    {
      key: 'status',
      labelKey: 'employees.columns.status',
      render: (employee) => <TravelStatusBadge active={employee.status !== 'inactive'} />,
    },
    {
      key: 'actions',
      labelKey: 'travel.common.actions',
      className: 'w-[16%]',
      render: (employee) => (
        <div className="flex flex-wrap gap-1.5">
          {canViewLedger && (
            <TravelActionButton icon={FaBook} variant="soft" title={t('employees.actions.ledger')} onClick={() => openLedger(employee)}>
              {t('employees.actions.ledger')}
            </TravelActionButton>
          )}
          {canManage && (
            <TravelActionButton icon={FaEdit} variant="secondary" title={t('travel.common.edit')} onClick={() => openEditForm(employee)}>
              {t('travel.common.edit')}
            </TravelActionButton>
          )}
          {canDelete && (
            <TravelActionButton icon={FaTrash} variant="danger" title={t('travel.common.delete')} onClick={() => handleDelete(employee)}>
              {t('travel.common.delete')}
            </TravelActionButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <TravelMasterPageFrame
      titleKey={isTravel ? 'travel.employees.title' : 'employees.title'}
      subtitleKey={isTravel ? 'travel.employees.subtitle' : 'employees.subtitle'}
      actions={
        canManage && (
          <>
            <TravelActionButton icon={FaBriefcase} variant="secondary" onClick={() => setDesignationOpen(true)}>
              {t('employees.designations')}
            </TravelActionButton>
            <TravelActionButton icon={FaPlus} onClick={openCreateForm}>
              {t('employees.add')}
            </TravelActionButton>
          </>
        )
      }
      filters={
        <TravelMasterToolbar>
          <TravelSearchInput value={search} onChange={setSearch} placeholderKey="employees.search" />
          <TravelFilterSelect
            value={status}
            onChange={setStatus}
            placeholderKey="employees.filters.allStatus"
            options={[
              { value: 'active', labelKey: 'travel.common.active' },
              { value: 'inactive', labelKey: 'travel.common.inactive' },
            ]}
          />
        </TravelMasterToolbar>
      }
    >
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['employees.summary.count', summary?.employeeCount || employees.length],
          ['employees.summary.payable', formatTravelMoney(summary?.totalPayable || 0)],
          ['employees.summary.recoverable', formatTravelMoney(summary?.totalRecoverable || 0)],
          ['employees.summary.netPosition', formatTravelMoney(summary?.netPosition || 0)],
        ].map(([labelKey, value]) => (
          <div key={labelKey} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-normal text-slate-400">{t(labelKey)}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      ) : (
        <TravelMasterList
          columns={columns}
          records={employees}
          emptyKey="employees.empty"
          renderMobileCard={(employee) => (
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{employee.name}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{employee.phone || '-'}</p>
                </div>
                <TravelStatusBadge active={employee.status !== 'inactive'} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TravelCardLine labelKey="employees.columns.designation" value={employee.designationName || '-'} />
                <TravelCardLine labelKey="employees.columns.balance" value={getBalanceLabel(employee)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {canViewLedger && (
                  <TravelActionButton icon={FaBook} variant="soft" onClick={() => openLedger(employee)}>
                    {t('employees.actions.ledger')}
                  </TravelActionButton>
                )}
                {canManage && (
                  <TravelActionButton icon={FaEdit} variant="secondary" onClick={() => openEditForm(employee)}>
                    {t('travel.common.edit')}
                  </TravelActionButton>
                )}
              </div>
            </div>
          )}
        />
      )}

      <TravelFormModal
        open={formOpen}
        titleKey="employees.formTitle"
        modeKey={editingEmployee ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={employeeFields}
        values={form}
        onChange={handleFormChange}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        submitting={saving}
        error={formError}
      />

      {designationOpen && (
        <TravelFormModal
          open={designationOpen}
          titleKey="employees.designations"
          modeKey="employees.designations"
          fields={[]}
          values={{}}
          onChange={() => {}}
          onClose={() => setDesignationOpen(false)}
          onSubmit={handleCreateDesignation}
          submitting={saving}
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold text-slate-500">
                {t('employees.fields.designation')}
              </span>
              <input
                value={designationName}
                onChange={(event) => setDesignationName(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {designations.map((designation) => (
                <div key={designation._id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <span className="truncate text-sm font-bold text-slate-800">{designation.name}</span>
                  <button
                    type="button"
                    className="text-xs font-extrabold text-rose-600"
                    onClick={() => handleDeleteDesignation(designation)}
                  >
                    {t('travel.common.delete')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </TravelFormModal>
      )}
    </TravelMasterPageFrame>
  );
};

export default EmployeesPage;
