import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Outlet, useLocation } from 'react-router-dom';
import TopHeader from './TopHeader';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';

const EMPTY_DASHBOARD_SUMMARY = {
  totalSales: 0,
  totalExpenses: 0,
  netProfit: 0,
  grossProfit: 0,
  cogs: 0,
  totalCash: 0,
  totalBank: 0,
  totalReceivable: 0,
  totalPayable: 0,
  receivableDetails: [],
  payableDetails: [],
};

const buildSummaryKey = (params = {}) => {
  return JSON.stringify({
    filterType: params.filterType || '',
    startDate: params.startDate || '',
    endDate: params.endDate || '',
  });
};

const getSessionCacheKey = () => {
  const userId = localStorage.getItem('userId') || 'default';

  return `dashboard_summary_session_cache_${userId}`;
};

const readSessionCache = () => {
  try {
    const raw = sessionStorage.getItem(getSessionCacheKey());

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveSessionCache = (cache = {}) => {
  try {
    sessionStorage.setItem(getSessionCacheKey(), JSON.stringify(cache));
  } catch {
    // Session cache failure should never break dashboard.
  }
};

const MainLayout = () => {
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    const savedState = localStorage.getItem('rightPanelOpen');

    try {
      return savedState !== null ? JSON.parse(savedState) : true;
    } catch {
      return true;
    }
  });

  const [dashboardAlerts, setDashboardAlerts] = useState({
    lowStock: 0,
    negativeStock: 0,
    overdueInvoices: 0,
    pendingPayments: 0,
  });

  const [dashboardSummary, setDashboardSummary] = useState(EMPTY_DASHBOARD_SUMMARY);

  const [dashboardSummaryLoading, setDashboardSummaryLoading] = useState(false);

  const rightPanelRef = useRef(null);

  const summaryCacheRef = useRef(readSessionCache());

  const activeRequestsRef = useRef(new Map());

  const isLedgerPage =
    location.pathname.startsWith('/customer-ledger') ||
    location.pathname.startsWith('/supplier-ledger') ||
    location.pathname.startsWith('/party-ledger');

  const fetchDashboardSummary = useCallback(async (options = {}) => {
    const { refresh = false, params = {} } = options;

    const requestKey = buildSummaryKey(params);

    if (!refresh) {
      const cachedData = summaryCacheRef.current[requestKey];

      if (cachedData) {
        setDashboardSummary({
          ...EMPTY_DASHBOARD_SUMMARY,
          ...cachedData,
          receivableDetails: cachedData.receivableDetails || [],
          payableDetails: cachedData.payableDetails || [],
        });

        return cachedData;
      }

      const activeRequest = activeRequestsRef.current.get(requestKey);

      if (activeRequest) {
        return activeRequest;
      }
    }

    const requestPromise = (async () => {
      try {
        setDashboardSummaryLoading(true);

        const token = localStorage.getItem('token');

        const baseUrl = process.env.REACT_APP_API_BASE_URL;

        if (!token) {
          return null;
        }

        const response = await axios.get(`${baseUrl}/api/dashboard-summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },

          params: {
            ...params,
            ...(refresh ? { refresh: 'true' } : {}),
          },
        });

        const data = response.data || {};

        const normalizedData = {
          ...EMPTY_DASHBOARD_SUMMARY,
          ...data,
          receivableDetails: data.receivableDetails || [],
          payableDetails: data.payableDetails || [],
        };

        summaryCacheRef.current = {
          ...summaryCacheRef.current,
          [requestKey]: normalizedData,
        };

        saveSessionCache(summaryCacheRef.current);

        setDashboardSummary(normalizedData);

        return normalizedData;
      } catch (error) {
        console.error('Dashboard summary fetch failed:', error);

        return null;
      } finally {
        setDashboardSummaryLoading(false);

        activeRequestsRef.current.delete(requestKey);
      }
    })();

    activeRequestsRef.current.set(requestKey, requestPromise);

    return requestPromise;
  }, []);

  const fetchDashboardAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');

      const baseUrl = process.env.REACT_APP_API_BASE_URL;

      if (!token) {
        return null;
      }

      const response = await axios.get(`${baseUrl}/api/dashboard-alerts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const summary = response.data?.summary || {};

      setDashboardAlerts({
        lowStock: Number(summary.lowStock || 0),

        negativeStock: Number(summary.negativeStock || 0),

        overdueInvoices: Number(summary.overdueInvoices || 0),

        pendingPayments: Number(summary.pendingPayments || 0),
      });

      return summary;
    } catch (error) {
      console.error('Dashboard alerts fetch failed:', error);

      return null;
    }
  }, []);

  const refreshDashboard = useCallback(
    async (options = {}) => {
      const { params = {} } = options;

      const [summaryResult] = await Promise.all([
        fetchDashboardSummary({
          refresh: true,
          params,
        }),

        fetchDashboardAlerts(),
      ]);

      return summaryResult;
    },
    [fetchDashboardSummary, fetchDashboardAlerts]
  );

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/check-device`)
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          localStorage.removeItem('user');
          localStorage.removeItem('mode');

          alert('Unauthorized device. Please login again.');

          window.location.href = '/#/login';
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('rightPanelOpen', JSON.stringify(isRightPanelOpen));
  }, [isRightPanelOpen]);

  useEffect(() => {
    fetchDashboardAlerts();
  }, [fetchDashboardAlerts]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (event.target.closest('[data-right-panel-toggle="true"]')) {
        return;
      }

      if (
        isRightPanelOpen &&
        rightPanelRef.current &&
        !rightPanelRef.current.contains(event.target)
      ) {
        setIsRightPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);

      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isRightPanelOpen]);

  const outletContext = {
    dashboardSummary,
    dashboardSummaryLoading,
    fetchDashboardSummary,
    refreshDashboard,
    dashboardAlerts,
    fetchDashboardAlerts,
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="flex-shrink-0 z-50">
        <TopHeader
          isRightPanelOpen={isRightPanelOpen}
          setIsRightPanelOpen={setIsRightPanelOpen}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          dashboardAlerts={dashboardAlerts}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {!isLedgerPage && (
          <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <Outlet context={outletContext} />
          </div>
        </div>

        {!isLedgerPage && (
          <>
            {isMobile && (
              <>
                {isRightPanelOpen && (
                  <div
                    className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
                    onClick={() => setIsRightPanelOpen(false)}
                  />
                )}

                <div
                  ref={rightPanelRef}
                  className={`
                    fixed top-0 right-0 h-full z-40 w-64 bg-white shadow-lg
                    transform transition-transform duration-300
                    ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-full'}
                    md:hidden
                  `}
                >
                  {isRightPanelOpen && (
                    <RightPanel
                      dashboardAlerts={dashboardAlerts}
                      dashboardSummary={dashboardSummary}
                      dashboardSummaryLoading={dashboardSummaryLoading}
                      refreshDashboard={refreshDashboard}
                    />
                  )}
                </div>
              </>
            )}

            {!isMobile && (
              <div
                ref={rightPanelRef}
                className={`hidden md:block transition-all duration-300 ${
                  isRightPanelOpen ? 'w-64' : 'w-0'
                } overflow-hidden`}
              >
                {isRightPanelOpen && (
                  <RightPanel
                    dashboardAlerts={dashboardAlerts}
                    dashboardSummary={dashboardSummary}
                    dashboardSummaryLoading={dashboardSummaryLoading}
                    refreshDashboard={refreshDashboard}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MainLayout;
