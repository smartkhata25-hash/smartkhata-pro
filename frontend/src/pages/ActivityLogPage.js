// src/pages/ActivityLogPage.js

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  fetchActivities,
  getActivityById,
  getActivitySummary,
  getActivityUsers,
} from '../services/activityService';

const EMPTY_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  pages: 0,
};

const INITIAL_FILTERS = {
  staffId: '',
  action: '',
  module: '',
  search: '',
  startDate: '',
  endDate: '',
  page: 1,
  limit: 25,
};

const ACTION_LABELS = {
  login: 'Login',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  restore: 'Restore',
  block: 'Block',
  unblock: 'Unblock',
  permission_update: 'Permission Update',
  password_reset: 'Password Reset',
  owner_transfer: 'Owner Transfer',
  import: 'Import',
  export: 'Export',
  print: 'Print',
  convert: 'Convert',
  merge: 'Merge',
  adjust: 'Adjust',
  approve: 'Approve',
  reject: 'Reject',
};

const ACTION_OPTIONS = [
  'login',
  'create',
  'update',
  'delete',
  'restore',
  'block',
  'unblock',
  'permission_update',
  'password_reset',
  'owner_transfer',
  'import',
  'export',
  'print',
  'convert',
  'merge',
  'adjust',
  'approve',
  'reject',
];

const ActivityLogPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isTravelWorkspace = location.pathname.startsWith('/travel');
  const moduleScope = isTravelWorkspace ? 'travel' : 'trading';

  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({
    totalActivities: 0,
    byAction: [],
    byModule: [],
    recentUsers: [],
  });

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);

  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState('');

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const result = await fetchActivities({
        ...appliedFilters,
        moduleScope,
      });

      setActivities(result.activities || []);
      setPagination(result.pagination || EMPTY_PAGINATION);
    } catch (err) {
      console.error('Activity list load error:', err);
      setActivities([]);
      setError(err.message || 'Activity Log load نہیں ہو سکا');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, moduleScope]);

  const loadUsers = useCallback(async () => {
    try {
      const result = await getActivityUsers();
      setUsers(result || []);
    } catch (err) {
      console.error('Activity users load error:', err);
      setUsers([]);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);

      const result = await getActivitySummary({
        moduleScope,
      });

      setSummary({
        totalActivities: result.totalActivities || 0,
        byAction: result.byAction || [],
        byModule: result.byModule || [],
        recentUsers: result.recentUsers || [],
      });
    } catch (err) {
      console.error('Activity summary load error:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [moduleScope]);

  useEffect(() => {
    loadUsers();
    loadSummary();
  }, [loadUsers, loadSummary]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const moduleOptions = useMemo(() => {
    const modules = new Set();

    summary.byModule.forEach((item) => {
      if (item?._id) {
        modules.add(item._id);
      }
    });

    activities.forEach((item) => {
      if (item?.module) {
        modules.add(item.module);
      }
    });

    return Array.from(modules).sort();
  }, [summary.byModule, activities]);

  const updateFilters = (updates) => {
    setFilters((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const applyFilters = () => {
    setAppliedFilters({
      ...filters,
      page: 1,
    });
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
  };

  const handleViewDetail = async (activityId) => {
    if (!activityId) return;

    try {
      setDetailLoading(true);
      setSelectedActivity(null);
      setShowDetail(true);

      const activity = await getActivityById(activityId);

      setSelectedActivity(activity);
    } catch (err) {
      console.error('Activity detail error:', err);
      alert(err.message || 'Activity detail load نہیں ہو سکی');
      setShowDetail(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([loadActivities(), loadSummary(), loadUsers()]);
  };

  const getUserName = (performedBy) => {
    if (!performedBy) return 'Unknown User';

    if (typeof performedBy === 'string') {
      return performedBy;
    }

    return performedBy.fullName || performedBy.name || performedBy.email || 'Unknown User';
  };

  const getActionLabel = (action = '') => {
    return ACTION_LABELS[action] || formatText(action);
  };

  const getActionStyle = (action = '') => {
    const styles = {
      create: {
        background: '#dcfce7',
        color: '#15803d',
      },
      update: {
        background: '#dbeafe',
        color: '#1d4ed8',
      },
      delete: {
        background: '#fee2e2',
        color: '#b91c1c',
      },
      restore: {
        background: '#ecfdf5',
        color: '#047857',
      },
      login: {
        background: '#e0e7ff',
        color: '#4338ca',
      },
      block: {
        background: '#ffedd5',
        color: '#c2410c',
      },
      unblock: {
        background: '#dcfce7',
        color: '#15803d',
      },
      permission_update: {
        background: '#f3e8ff',
        color: '#7e22ce',
      },
      password_reset: {
        background: '#fef3c7',
        color: '#a16207',
      },
      import: {
        background: '#cffafe',
        color: '#0e7490',
      },
      export: {
        background: '#e0f2fe',
        color: '#0369a1',
      },
      print: {
        background: '#f3f4f6',
        color: '#374151',
      },
      convert: {
        background: '#f5f3ff',
        color: '#6d28d9',
      },
      merge: {
        background: '#ede9fe',
        color: '#5b21b6',
      },
      adjust: {
        background: '#fef9c3',
        color: '#854d0e',
      },
      approve: {
        background: '#dcfce7',
        color: '#15803d',
      },
      reject: {
        background: '#fee2e2',
        color: '#b91c1c',
      },
    };

    return (
      styles[action] || {
        background: '#f3f4f6',
        color: '#374151',
      }
    );
  };

  const currentPage = Number(pagination.page || filters.page || 1);
  const totalPages = Number(pagination.pages || 0);

  return (
    <div className="min-h-full bg-gray-50 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 md:p-5 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">Activity Log</h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading || summaryLoading}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  🔄 Refresh
                </button>

                <button
                  type="button"
                  onClick={() => navigate(isTravelWorkspace ? '/travel/dashboard' : '/staff')}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                >
                  {isTravelWorkspace ? '← Travel Dashboard' : '← Staff Management'}
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard
                title="Total Activities"
                value={summary.totalActivities}
                loading={summaryLoading}
              />

              <SummaryCard
                title="Actions"
                value={summary.byAction.length}
                loading={summaryLoading}
              />

              <SummaryCard
                title="Modules"
                value={summary.byModule.length}
                loading={summaryLoading}
              />

              <SummaryCard
                title="Active Users"
                value={summary.recentUsers.length}
                loading={summaryLoading}
              />
            </div>
          </div>

          <div className="p-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                value={filters.search}
                placeholder="Title, Bill No یا Description تلاش کریں"
                onChange={(e) =>
                  updateFilters({
                    search: e.target.value,
                    page: 1,
                  })
                }
                className="lg:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <select
                value={filters.staffId}
                onChange={(e) =>
                  updateFilters({
                    staffId: e.target.value,
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">All Users</option>

                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.fullName || user.name || user.email}
                    {user.accountRole === 'owner' ? ' (Owner)' : ''}
                  </option>
                ))}
              </select>

              <select
                value={filters.action}
                onChange={(e) =>
                  updateFilters({
                    action: e.target.value,
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">All Actions</option>

                {ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {getActionLabel(action)}
                  </option>
                ))}
              </select>

              <select
                value={filters.module}
                onChange={(e) =>
                  updateFilters({
                    module: e.target.value,
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">All Modules</option>

                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {formatText(moduleName)}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  updateFilters({
                    startDate: e.target.value,
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              />

              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate || undefined}
                onChange={(e) =>
                  updateFilters({
                    endDate: e.target.value,
                    page: 1,
                  })
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
              />

              <button
                type="button"
                onClick={applyFilters}
                disabled={loading}
                className="border border-blue-200 bg-blue-50 text-blue-700 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-blue-100 disabled:opacity-50"
              >
                Search / Apply
              </button>

              <button
                type="button"
                onClick={clearFilters}
                className="border border-red-200 bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-red-100"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {error && (
            <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}

              <button
                type="button"
                onClick={loadActivities}
                className="ml-3 underline font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 border-b">Date & Time</th>
                  <th className="text-left px-4 py-3 border-b">User</th>
                  <th className="text-center px-4 py-3 border-b">Action</th>
                  <th className="text-left px-4 py-3 border-b">Module</th>
                  <th className="text-left px-4 py-3 border-b">Title</th>
                  <th className="text-left px-4 py-3 border-b">Bill No</th>
                  <th className="text-center px-4 py-3 border-b">Detail</th>
                </tr>
              </thead>

              <tbody>
                {loading && activities.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-10 text-gray-500">
                      Activity Log load ہو رہا ہے...
                    </td>
                  </tr>
                ) : activities.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-10 text-gray-500">
                      کوئی Activity موجود نہیں
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => (
                    <tr key={activity._id} className="hover:bg-gray-50 border-b border-gray-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">
                          {formatDate(activity.createdAt)}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          {formatTime(activity.createdAt)}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">
                          {getUserName(activity.performedBy)}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          {activity.performedBy?.email || '-'}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          style={getActionStyle(activity.action)}
                          className="inline-flex px-3 py-1 rounded-full text-xs font-bold"
                        >
                          {getActionLabel(activity.action)}
                        </span>
                      </td>

                      <td className="px-4 py-3 capitalize">{formatText(activity.module)}</td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{activity.title || '-'}</div>

                        <div className="text-xs text-gray-500 mt-1 max-w-[260px] truncate">
                          {activity.description || '-'}
                        </div>
                      </td>

                      <td className="px-4 py-3">{activity.billNo || '-'}</td>

                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleViewDetail(activity._id)}
                          className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              Total Activities: {Number(pagination.total || 0)}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filters.limit}
                onChange={(e) => {
                  const nextLimit = Number(e.target.value);

                  setFilters((prev) => ({
                    ...prev,
                    limit: nextLimit,
                    page: 1,
                  }));

                  setAppliedFilters((prev) => ({
                    ...prev,
                    limit: nextLimit,
                    page: 1,
                  }));
                }}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() => {
                  const nextPage = currentPage - 1;

                  setFilters((prev) => ({
                    ...prev,
                    page: nextPage,
                  }));

                  setAppliedFilters((prev) => ({
                    ...prev,
                    page: nextPage,
                  }));
                }}
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
                onClick={() => {
                  const nextPage = currentPage + 1;

                  setFilters((prev) => ({
                    ...prev,
                    page: nextPage,
                  }));

                  setAppliedFilters((prev) => ({
                    ...prev,
                    page: nextPage,
                  }));
                }}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDetail && (
        <ActivityDetailModal
          activity={selectedActivity}
          loading={detailLoading}
          onClose={() => {
            setShowDetail(false);
            setSelectedActivity(null);
          }}
          getActionLabel={getActionLabel}
          getActionStyle={getActionStyle}
          getUserName={getUserName}
        />
      )}
    </div>
  );
};

const SummaryCard = ({ title, value, loading }) => {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
      <div className="text-xs font-semibold text-gray-500 uppercase">{title}</div>

      <div className="text-2xl font-bold text-gray-800 mt-2">
        {loading ? '...' : Number(value || 0)}
      </div>
    </div>
  );
};

const ActivityDetailModal = ({
  activity,
  loading,
  onClose,
  getActionLabel,
  getActionStyle,
  getUserName,
}) => {
  return (
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-3">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-gray-800">Activity Detail</h2>

            <p className="text-xs text-gray-500 mt-1">مکمل Activity Information</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Detail load ہو رہی ہے...</div>
          ) : !activity ? (
            <div className="text-center py-12 text-gray-500">Activity detail موجود نہیں</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailItem label="User" value={getUserName(activity.performedBy)} />

                <DetailItem label="Email" value={activity.performedBy?.email || '-'} />

                <DetailItem label="Module" value={formatText(activity.module)} />

                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Action</div>

                  <span
                    style={getActionStyle(activity.action)}
                    className="inline-flex px-3 py-1 rounded-full text-xs font-bold"
                  >
                    {getActionLabel(activity.action)}
                  </span>
                </div>

                <DetailItem label="Entity Type" value={activity.entityType || '-'} />

                <DetailItem label="Entity ID" value={activity.entityId || '-'} />

                <DetailItem label="Bill No" value={activity.billNo || '-'} />

                <DetailItem
                  label="Date & Time"
                  value={`${formatDate(activity.createdAt)} ${formatTime(activity.createdAt)}`}
                />

                <DetailItem label="IP Address" value={activity.ipAddress || '-'} />

                <DetailItem label="Device ID" value={activity.deviceId || '-'} />
              </div>

              <DetailItem label="Title" value={activity.title || '-'} />

              <DetailItem label="Description" value={activity.description || '-'} />

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">User Agent</div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 break-all">
                  {activity.userAgent || '-'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailItem = ({ label, value }) => {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</div>

      <div className="text-sm text-gray-800 break-all">{value ?? '-'}</div>
    </div>
  );
};

const formatText = (value = '') => {
  return String(value)
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatDate = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString();
};

const formatTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default ActivityLogPage;
