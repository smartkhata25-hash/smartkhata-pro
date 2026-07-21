// src/pages/StaffPermissionsPage.js

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getStaffById, updateStaffPermissions } from '../services/staffService';

const ACTION_LABELS = {
  summary_cards: 'Summary Cards',
  right_panel: 'Right Panel',
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  restore: 'Restore',
  convert: 'Convert',
  merge: 'Merge',
  import: 'Import',
  export: 'Export',
  print: 'Print',
  adjust: 'Adjust',

  receive_payment: 'Receive Payment',
  pay_bill: 'Pay Bill',
  view_cost: 'View Cost',
  bulk_create: 'Bulk Create',
  view_history: 'View History',
  delete_transaction: 'Delete Transaction',
  manage_categories: 'Manage Categories',
  view_ledger: 'View Ledger',
  manage_titles: 'Manage Titles',
  view_transactions: 'View Transactions',

  dashboard: 'Dashboard',
  trial_balance: 'Trial Balance',
  general_ledger: 'General Ledger',
  income_statement: 'Income Statement',
  cash_flow: 'Cash Flow',
  monthly_sales: 'Monthly Sales',
  stock_value: 'Stock Value',
  aging: 'Aging Report',
  profit: 'Profit Report',

  block: 'Block / Activate',
  manage_permissions: 'Manage Permissions',
  reset_password: 'Reset Password',
  view_activity: 'View Activity',
  transfer_owner: 'Transfer Owner',

  personal_info: 'Personal Information',
  business_info: 'Business Information',
  backup: 'Backup',
  lock: 'App Lock',
};

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  sales: 'Sales',
  refunds: 'Sale Refunds',
  purchases: 'Purchases',
  purchase_returns: 'Purchase Returns',
  receive_payments: 'Receive Payments',
  pay_bills: 'Pay Bills',
  products: 'Products',
  inventory: 'Inventory',
  customers: 'Customers',
  suppliers: 'Suppliers',
  parties: 'Parties',
  expenses: 'Expenses',
  accounts: 'Accounts',
  journal: 'Journal Entries',
  reports: 'Reports',
  staff: 'Staff Management',
  settings: 'Settings',
};

const formatLabel = (value = '') => {
  return String(value)
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const groupPermissions = (permissions = []) => {
  return permissions.reduce((groups, permission) => {
    const [moduleName, ...actionParts] = String(permission).split('.');

    if (!moduleName || actionParts.length === 0) {
      return groups;
    }

    const action = actionParts.join('.');

    if (!groups[moduleName]) {
      groups[moduleName] = [];
    }

    groups[moduleName].push({
      value: permission,
      action,
      label: ACTION_LABELS[action] || formatLabel(action),
    });

    return groups;
  }, {});
};

const StaffPermissionsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [staff, setStaff] = useState(null);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [originalPermissions, setOriginalPermissions] = useState([]);

  const [search, setSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState({});
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setPageLoading(true);
        setError('');

        const result = await getStaffById(id);

        if (!result.staff) {
          setError('Staff user نہیں ملا');
          return;
        }

        const permissions = Array.isArray(result.staff.permissions) ? result.staff.permissions : [];

        const available = Array.isArray(result.availablePermissions)
          ? result.availablePermissions
          : [];

        setStaff(result.staff);
        setAvailablePermissions(available);
        setSelectedPermissions(permissions);
        setOriginalPermissions(permissions);

        const grouped = groupPermissions(available);

        const initialExpanded = Object.keys(grouped).reduce(
          (acc, moduleName) => ({
            ...acc,
            [moduleName]: true,
          }),
          {}
        );

        setExpandedModules(initialExpanded);
      } catch (err) {
        console.error('Permission page load error:', err);
        setError(err.message || 'Permissions load نہیں ہو سکیں');
      } finally {
        setPageLoading(false);
      }
    };

    if (id) {
      loadData();
    }
  }, [id]);

  const groupedPermissions = useMemo(
    () => groupPermissions(availablePermissions),
    [availablePermissions]
  );

  const filteredModules = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return groupedPermissions;
    }

    return Object.entries(groupedPermissions).reduce((result, [moduleName, permissions]) => {
      const moduleLabel = MODULE_LABELS[moduleName] || formatLabel(moduleName);

      const moduleMatches = moduleLabel.toLowerCase().includes(query);

      const matchedPermissions = permissions.filter(
        (permission) =>
          permission.label.toLowerCase().includes(query) ||
          permission.value.toLowerCase().includes(query)
      );

      if (moduleMatches || matchedPermissions.length > 0) {
        result[moduleName] = moduleMatches ? permissions : matchedPermissions;
      }

      return result;
    }, {});
  }, [groupedPermissions, search]);

  const isDirty = useMemo(() => {
    const selected = [...selectedPermissions].sort();
    const original = [...originalPermissions].sort();

    return JSON.stringify(selected) !== JSON.stringify(original);
  }, [selectedPermissions, originalPermissions]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!isDirty) return;

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  const togglePermission = (permission) => {
    setSelectedPermissions((current) => {
      if (current.includes(permission)) {
        return current.filter((item) => item !== permission);
      }

      return [...current, permission];
    });
  };

  const getModulePermissionValues = (moduleName) => {
    return (groupedPermissions[moduleName] || []).map((permission) => permission.value);
  };

  const isModuleFullySelected = (moduleName) => {
    const modulePermissions = getModulePermissionValues(moduleName);

    return (
      modulePermissions.length > 0 &&
      modulePermissions.every((permission) => selectedPermissions.includes(permission))
    );
  };

  const isModulePartiallySelected = (moduleName) => {
    const modulePermissions = getModulePermissionValues(moduleName);

    const selectedCount = modulePermissions.filter((permission) =>
      selectedPermissions.includes(permission)
    ).length;

    return selectedCount > 0 && selectedCount < modulePermissions.length;
  };

  const toggleModule = (moduleName) => {
    const modulePermissions = getModulePermissionValues(moduleName);
    const fullySelected = isModuleFullySelected(moduleName);

    setSelectedPermissions((current) => {
      if (fullySelected) {
        return current.filter((permission) => !modulePermissions.includes(permission));
      }

      return [...new Set([...current, ...modulePermissions])];
    });
  };

  const selectAllPermissions = () => {
    setSelectedPermissions([...availablePermissions]);
  };

  const clearAllPermissions = () => {
    setSelectedPermissions([]);
  };

  const restoreOriginalPermissions = () => {
    setSelectedPermissions([...originalPermissions]);
  };

  const toggleExpandedModule = (moduleName) => {
    setExpandedModules((current) => ({
      ...current,
      [moduleName]: !current[moduleName],
    }));
  };

  const handleBack = () => {
    if (isDirty && !window.confirm('Permissions میں تبدیلی Save نہیں ہوئی۔ واپس جانا ہے؟')) {
      return;
    }

    navigate('/staff');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      const result = await updateStaffPermissions(id, selectedPermissions);

      const savedPermissions = Array.isArray(result.permissions)
        ? result.permissions
        : selectedPermissions;

      setSelectedPermissions(savedPermissions);
      setOriginalPermissions(savedPermissions);

      alert('Staff Permissions کامیابی سے Save ہو گئیں');
    } catch (err) {
      console.error('Permission save error:', err);
      setError(err.message || 'Permissions Save نہیں ہو سکیں');
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-6 py-5 text-gray-600">
          Permissions Load ہو رہی ہیں...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-3 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">Staff Permissions</h1>

                <p className="text-sm text-gray-500 mt-1">
                  {staff?.fullName || staff?.name || '-'} — {staff?.email || '-'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                ← Back
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Permission یا Module تلاش کریں"
                className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                type="button"
                onClick={selectAllPermissions}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-100 disabled:opacity-50"
              >
                Select All
              </button>

              <button
                type="button"
                onClick={clearAllPermissions}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-100 disabled:opacity-50"
              >
                Clear All
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-gray-600">
                Selected Permissions: <strong>{selectedPermissions.length}</strong> /{' '}
                {availablePermissions.length}
              </div>

              {isDirty && (
                <span className="text-xs px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 font-semibold">
                  Unsaved Changes
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="p-4 md:p-6 space-y-4">
            {Object.keys(filteredModules).length === 0 ? (
              <div className="text-center py-10 text-gray-500">کوئی Permission نہیں ملی</div>
            ) : (
              Object.entries(filteredModules).map(([moduleName, permissions]) => {
                const fullySelected = isModuleFullySelected(moduleName);

                const partiallySelected = isModulePartiallySelected(moduleName);

                const isExpanded = expandedModules[moduleName] !== false;

                return (
                  <div
                    key={moduleName}
                    className="border border-gray-200 rounded-xl overflow-hidden"
                  >
                    <div className="flex items-center gap-3 bg-gray-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={fullySelected}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = partiallySelected;
                          }
                        }}
                        onChange={() => toggleModule(moduleName)}
                        disabled={saving}
                        className="w-4 h-4 cursor-pointer"
                      />

                      <button
                        type="button"
                        onClick={() => toggleExpandedModule(moduleName)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h2 className="font-bold text-gray-800">
                              {MODULE_LABELS[moduleName] || formatLabel(moduleName)}
                            </h2>

                            <p className="text-xs text-gray-500 mt-0.5">
                              {
                                getModulePermissionValues(moduleName).filter((permission) =>
                                  selectedPermissions.includes(permission)
                                ).length
                              }{' '}
                              of {getModulePermissionValues(moduleName).length} selected
                            </p>
                          </div>

                          <span className="text-gray-500">{isExpanded ? '▾' : '▸'}</span>
                        </div>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                        {permissions.map((permission) => {
                          const checked = selectedPermissions.includes(permission.value);

                          return (
                            <label
                              key={permission.value}
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                checked
                                  ? 'border-blue-300 bg-blue-50'
                                  : 'border-gray-200 bg-white hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving}
                                onChange={() => togglePermission(permission.value)}
                                className="mt-1 w-4 h-4 cursor-pointer"
                              />

                              <div>
                                <div className="text-sm font-semibold text-gray-800">
                                  {permission.label}
                                </div>

                                <div className="text-xs text-gray-500 mt-1 break-all">
                                  {permission.value}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={restoreOriginalPermissions}
                disabled={!isDirty || saving}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 disabled:opacity-40"
              >
                Revert Changes
              </button>

              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`px-5 py-2 rounded-lg text-white font-semibold ${
                  !isDirty || saving
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffPermissionsPage;
