// src/pages/StaffManagementPage.js

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  activateStaff,
  blockStaff,
  deleteStaff,
  getStaffList,
  resetStaffPassword,
} from '../services/staffService';

import PermissionGuard from '../components/PermissionGuard';
import { FRONTEND_PERMISSIONS } from '../utils/permissionHelper';

const EMPTY_PAGINATION = {
  page: 1,
  limit: 20,
  total: 0,
  pages: 0,
};

const StaffManagementPage = () => {
  const navigate = useNavigate();

  const [staff, setStaff] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    page: 1,
    limit: 20,
  });

  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const result = await getStaffList({
        search: filters.search.trim(),
        status: filters.status,
        page: filters.page,
        limit: filters.limit,
      });

      setStaff(result.staff || []);
      setPagination(result.pagination || EMPTY_PAGINATION);
    } catch (err) {
      console.error('Staff list load error:', err);
      setStaff([]);
      setError(err.message || 'Staff list load نہیں ہو سکی');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStaff();
    }, 300);

    return () => clearTimeout(timer);
  }, [loadStaff]);

  const updateFilters = (updates) => {
    setFilters((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      page: 1,
      limit: 20,
    });
  };

  const handleStatusChange = async (staffUser) => {
    const nextStatus = staffUser.staffStatus === 'blocked' ? 'active' : 'blocked';

    const message =
      nextStatus === 'blocked'
        ? `${staffUser.fullName || staffUser.name} کو Block کرنا ہے؟`
        : `${staffUser.fullName || staffUser.name} کو دوبارہ Active کرنا ہے؟`;

    if (!window.confirm(message)) return;

    try {
      setActionId(staffUser._id);

      if (nextStatus === 'blocked') {
        await blockStaff(staffUser._id);
      } else {
        await activateStaff(staffUser._id);
      }

      await loadStaff();
    } catch (err) {
      alert(err.message || 'Staff status update نہیں ہو سکا');
    } finally {
      setActionId('');
    }
  };

  const handlePasswordReset = async (staffUser) => {
    const newPassword = window.prompt(
      `${staffUser.fullName || staffUser.name} کے لیے نیا Password درج کریں`
    );

    if (newPassword === null) return;

    if (String(newPassword).length < 6) {
      alert('Password کم از کم 6 حروف کا ہونا چاہیے');
      return;
    }

    const confirmed = window.confirm(
      'Password Reset ہونے کے بعد Staff کو دوبارہ Login کرنا ہوگا۔ جاری رکھیں؟'
    );

    if (!confirmed) return;

    try {
      setActionId(staffUser._id);

      await resetStaffPassword(staffUser._id, newPassword);

      alert('Staff Password کامیابی سے Reset ہو گیا');
    } catch (err) {
      alert(err.message || 'Password Reset نہیں ہو سکا');
    } finally {
      setActionId('');
    }
  };

  const handleDelete = async (staffUser) => {
    const confirmed = window.confirm(
      `${staffUser.fullName || staffUser.name} کو Staff List سے Remove کرنا ہے؟`
    );

    if (!confirmed) return;

    try {
      setActionId(staffUser._id);

      await deleteStaff(staffUser._id);

      if (staff.length === 1 && filters.page > 1) {
        updateFilters({
          page: filters.page - 1,
        });
      } else {
        await loadStaff();
      }
    } catch (err) {
      alert(err.message || 'Staff Remove نہیں ہو سکا');
    } finally {
      setActionId('');
    }
  };

  const getStaffName = (staffUser) => {
    return staffUser.fullName || staffUser.name || '-';
  };

  const getStatusStyle = (status) => {
    if (status === 'blocked') {
      return {
        background: '#fee2e2',
        color: '#b91c1c',
        border: '1px solid #fecaca',
      };
    }

    return {
      background: '#dcfce7',
      color: '#15803d',
      border: '1px solid #bbf7d0',
    };
  };

  const getPermissionCount = (permissions) => {
    return Array.isArray(permissions) ? permissions.length : 0;
  };

  const currentPage = Number(pagination.page || filters.page || 1);
  const totalPages = Number(pagination.pages || 0);

  return (
    <div className="min-h-full bg-gray-50 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="p-4 md:p-5 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">Staff Management</h1>

                <p className="text-sm text-gray-500 mt-1">
                  Staff Users، Permissions اور Account Status Manage کریں
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <PermissionGuard permission={FRONTEND_PERMISSIONS.STAFF.VIEW_ACTIVITY}>
                  <button
                    type="button"
                    onClick={() => navigate('/activity-log')}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
                  >
                    📋 Activity Log
                  </button>
                </PermissionGuard>

                <PermissionGuard permission={FRONTEND_PERMISSIONS.STAFF.CREATE}>
                  <button
                    type="button"
                    onClick={() => navigate('/staff/new')}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                  >
                    + Add Staff
                  </button>
                </PermissionGuard>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={filters.search}
                placeholder="Name, Email یا Mobile تلاش کریں"
                onChange={(e) =>
                  updateFilters({
                    search: e.target.value,
                    page: 1,
                  })
                }
                className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <select
                value={filters.status}
                onChange={(e) =>
                  updateFilters({
                    status: e.target.value,
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="all">All Staff</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>

              <button
                type="button"
                onClick={handleClearFilters}
                className="border border-red-200 bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-red-100"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {error && (
            <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}

              <button type="button" onClick={loadStaff} className="ml-3 underline font-semibold">
                Retry
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 border-b">Staff</th>
                  <th className="text-left px-4 py-3 border-b">Contact</th>
                  <th className="text-center px-4 py-3 border-b">Status</th>
                  <th className="text-center px-4 py-3 border-b">Permissions</th>
                  <th className="text-center px-4 py-3 border-b">Password</th>
                  <th className="text-center px-4 py-3 border-b">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading && staff.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-gray-500">
                      Staff List Load ہو رہی ہے...
                    </td>
                  </tr>
                ) : staff.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-gray-500">
                      کوئی Staff User موجود نہیں
                    </td>
                  </tr>
                ) : (
                  staff.map((staffUser) => {
                    const busy = actionId === staffUser._id;

                    return (
                      <tr key={staffUser._id} className="hover:bg-gray-50 border-b border-gray-100">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-800">
                            {getStaffName(staffUser)}
                          </div>

                          <div className="text-xs text-gray-500 mt-1">{staffUser.email || '-'}</div>
                        </td>

                        <td className="px-4 py-3">
                          <div>{staffUser.mobile || '-'}</div>

                          <div className="text-xs text-gray-500 mt-1">
                            Created:{' '}
                            {staffUser.createdAt
                              ? new Date(staffUser.createdAt).toLocaleDateString()
                              : '-'}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span
                            style={getStatusStyle(staffUser.staffStatus)}
                            className="inline-flex px-3 py-1 rounded-full text-xs font-bold capitalize"
                          >
                            {staffUser.staffStatus || 'active'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="font-semibold text-gray-800">
                            {getPermissionCount(staffUser.permissions)}
                          </div>

                          <div className="text-xs text-gray-500">Permissions</div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          {staffUser.mustChangePassword ? (
                            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-semibold">
                              Change Required
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Normal</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-center gap-2">
                            <PermissionGuard permission={FRONTEND_PERMISSIONS.STAFF.EDIT}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => navigate(`/staff/${staffUser._id}/edit`)}
                                className="px-3 py-1.5 rounded-md bg-yellow-100 text-yellow-800 text-xs font-semibold hover:bg-yellow-200 disabled:opacity-50"
                              >
                                Edit
                              </button>
                            </PermissionGuard>

                            <PermissionGuard
                              permission={FRONTEND_PERMISSIONS.STAFF.MANAGE_PERMISSIONS}
                            >
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => navigate(`/staff/${staffUser._id}/permissions`)}
                                className="px-3 py-1.5 rounded-md bg-purple-100 text-purple-700 text-xs font-semibold hover:bg-purple-200 disabled:opacity-50"
                              >
                                Permissions
                              </button>
                            </PermissionGuard>

                            <PermissionGuard permission={FRONTEND_PERMISSIONS.STAFF.BLOCK}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleStatusChange(staffUser)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50 ${
                                  staffUser.staffStatus === 'blocked'
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                }`}
                              >
                                {staffUser.staffStatus === 'blocked' ? 'Activate' : 'Block'}
                              </button>
                            </PermissionGuard>

                            <PermissionGuard permission={FRONTEND_PERMISSIONS.STAFF.RESET_PASSWORD}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handlePasswordReset(staffUser)}
                                className="px-3 py-1.5 rounded-md bg-blue-100 text-blue-700 text-xs font-semibold hover:bg-blue-200 disabled:opacity-50"
                              >
                                Reset Password
                              </button>
                            </PermissionGuard>

                            <PermissionGuard permission={FRONTEND_PERMISSIONS.STAFF.DELETE}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDelete(staffUser)}
                                className="px-3 py-1.5 rounded-md bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </PermissionGuard>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              Total Staff: {Number(pagination.total || 0)}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filters.limit}
                onChange={(e) =>
                  updateFilters({
                    limit: Number(e.target.value),
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() =>
                  updateFilters({
                    page: currentPage - 1,
                  })
                }
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-40"
              >
                Previous
              </button>

              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || 1}
              </span>

              <button
                type="button"
                disabled={loading || totalPages === 0 || currentPage >= totalPages}
                onClick={() =>
                  updateFilters({
                    page: currentPage + 1,
                  })
                }
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffManagementPage;
