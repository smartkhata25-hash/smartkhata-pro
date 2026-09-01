import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Outlet, useLocation } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

import TopHeader from './TopHeader';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import TravelRightPanel from '../components/travel/layout/TravelRightPanel';
import TravelReminderCenter from '../components/travel/reminders/TravelReminderCenter';

import { EMPTY_TRAVEL_DASHBOARD_SUMMARY } from '../components/travel/dashboard/travelDashboardConfig';

import { fetchTravelDashboardSummary as fetchTravelDashboardWorkspaceSummary } from '../services/travelMasterService';
import { fetchTravelReminderSummary as fetchTravelReminderWorkspaceSummary } from '../services/travelReminderService';

import { isTravelContext } from '../utils/travelContext';
import { t } from '../i18n/i18n';

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

const EMPTY_DASHBOARD_ALERTS = {
  lowStock: 0,
  negativeStock: 0,
  overdueInvoices: 0,
  pendingPayments: 0,
};

const EMPTY_TRAVEL_REMINDER_SUMMARY = {
  attentionCount: 0,
  dueCount: 0,
  upcomingCount: 0,
  failedEmailCount: 0,
  nextReminder: null,
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

const getSavedDesktopSidebarVisibility = () => {
  try {
    const savedState = localStorage.getItem('desktopSidebarVisible');

    if (savedState === null) {
      return true;
    }

    return JSON.parse(savedState) !== false;
  } catch {
    return true;
  }
};

const MainLayout = () => {
  const location = useLocation();

  /*
   * Mobile sidebar state.
   * Existing mobile behavior remains unchanged.
   */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  /*
   * Desktop sidebar preference.
   *
   * First use:
   * visible by default.
   *
   * After user hides/shows it:
   * preference is saved in localStorage.
   */
  const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState(
    getSavedDesktopSidebarVisibility
  );

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

  const [travelDashboardSummary, setTravelDashboardSummary] = useState(
    EMPTY_TRAVEL_DASHBOARD_SUMMARY
  );

  const [dashboardSummaryLoading, setDashboardSummaryLoading] = useState(false);

  const [travelDashboardSummaryLoading, setTravelDashboardSummaryLoading] = useState(false);

  const [travelDashboardSummaryLoadedAt, setTravelDashboardSummaryLoadedAt] = useState(0);

  const [travelReminderSummary, setTravelReminderSummary] = useState(EMPTY_TRAVEL_REMINDER_SUMMARY);

  const [travelReminderSummaryLoading, setTravelReminderSummaryLoading] = useState(false);

  const [travelReminderSummaryLoadedAt, setTravelReminderSummaryLoadedAt] = useState(0);

  const [isTravelReminderCenterOpen, setIsTravelReminderCenterOpen] = useState(false);

  const [showTravelReminderBanner, setShowTravelReminderBanner] = useState(false);

  const rightPanelRef = useRef(null);

  const summaryCacheRef = useRef(readSessionCache());

  const activeRequestsRef = useRef(new Map());

  const activeTravelDashboardRequestRef = useRef(null);

  const activeTravelReminderRequestRef = useRef(null);

  const isLedgerPage =
    location.pathname.startsWith('/customer-ledger') ||
    location.pathname.startsWith('/supplier-ledger') ||
    location.pathname.startsWith('/party-ledger');

  const isTravelWorkspace = isTravelContext(location);

  const hideWorkspacePanels = isLedgerPage && !isTravelWorkspace;

  /*
   * Actual desktop sidebar rendering state.
   *
   * Mobile ignores this preference because mobile
   * continues using the normal hamburger sidebar.
   */
  const showSidebar = !hideWorkspacePanels && (isMobile || isDesktopSidebarVisible);

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

  const fetchTravelDashboardSummary = useCallback(async (options = {}) => {
    const forceRefresh = Boolean(options.forceRefresh || options.refresh);

    if (!forceRefresh && activeTravelDashboardRequestRef.current) {
      return activeTravelDashboardRequestRef.current;
    }

    const requestPromise = (async () => {
      try {
        setTravelDashboardSummaryLoading(true);

        const token = localStorage.getItem('token');

        if (!token) {
          return null;
        }

        const data = await fetchTravelDashboardWorkspaceSummary({
          forceRefresh,
        });

        const normalizedData = {
          ...EMPTY_TRAVEL_DASHBOARD_SUMMARY,
          ...(data || {}),

          cashAccounts: Array.isArray(data?.cashAccounts) ? data.cashAccounts : [],

          bankAccounts: Array.isArray(data?.bankAccounts) ? data.bankAccounts : [],

          upcomingBookings: Array.isArray(data?.upcomingBookings) ? data.upcomingBookings : [],
        };

        setTravelDashboardSummary(normalizedData);

        setTravelDashboardSummaryLoadedAt(Date.now());

        return normalizedData;
      } catch (error) {
        console.error('Travel dashboard summary fetch failed:', error);

        return null;
      } finally {
        setTravelDashboardSummaryLoading(false);

        activeTravelDashboardRequestRef.current = null;
      }
    })();

    activeTravelDashboardRequestRef.current = requestPromise;

    return requestPromise;
  }, []);

  const fetchTravelReminderSummary = useCallback(async (options = {}) => {
    const forceRefresh = Boolean(options.forceRefresh || options.refresh);

    if (!forceRefresh && activeTravelReminderRequestRef.current) {
      return activeTravelReminderRequestRef.current;
    }

    const requestPromise = (async () => {
      try {
        setTravelReminderSummaryLoading(true);

        const token = localStorage.getItem('token');

        if (!token) {
          return null;
        }

        const data = await fetchTravelReminderWorkspaceSummary({
          forceRefresh,
        });

        const normalizedData = {
          ...EMPTY_TRAVEL_REMINDER_SUMMARY,
          ...(data || {}),
        };

        setTravelReminderSummary(normalizedData);
        setTravelReminderSummaryLoadedAt(Date.now());

        return normalizedData;
      } catch (error) {
        console.error('Travel reminder summary fetch failed:', error);

        return null;
      } finally {
        setTravelReminderSummaryLoading(false);

        activeTravelReminderRequestRef.current = null;
      }
    })();

    activeTravelReminderRequestRef.current = requestPromise;

    return requestPromise;
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

  /*
   * Device authorization check.
   */
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/check-device`)
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem('token');

          localStorage.removeItem('userId');

          localStorage.removeItem('user');

          localStorage.removeItem('mode');

          /*
           * desktopSidebarVisible intentionally
           * remains untouched.
           */

          alert('Unauthorized device. Please login again.');

          window.location.href = '/#/login';
        }
      })
      .catch(() => {});
  }, []);

  /*
   * Responsive state.
   */
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  /*
   * Persist Right Panel preference.
   */
  useEffect(() => {
    localStorage.setItem('rightPanelOpen', JSON.stringify(isRightPanelOpen));
  }, [isRightPanelOpen]);

  /*
   * Persist Desktop Sidebar preference.
   */
  useEffect(() => {
    localStorage.setItem('desktopSidebarVisible', JSON.stringify(isDesktopSidebarVisible));
  }, [isDesktopSidebarVisible]);

  /*
   * Travel mobile screen should not automatically
   * keep the Right Panel covering the workspace.
   */
  useEffect(() => {
    if (isTravelWorkspace && isMobile) {
      setIsRightPanelOpen(false);
    }
  }, [isTravelWorkspace, isMobile]);

  /*
   * Load correct dashboard data according
   * to active workspace.
   */
  useEffect(() => {
    if (isTravelWorkspace) {
      fetchTravelDashboardSummary();
      fetchTravelReminderSummary();
      return;
    }

    fetchDashboardAlerts();
  }, [
    fetchDashboardAlerts,
    fetchTravelDashboardSummary,
    fetchTravelReminderSummary,
    isTravelWorkspace,
  ]);

  useEffect(() => {
    if (!isTravelWorkspace || Number(travelReminderSummary.attentionCount || 0) <= 0) {
      setShowTravelReminderBanner(false);
      return;
    }

    const seen = sessionStorage.getItem('travelReminderAttentionSeen');

    if (!seen) {
      setShowTravelReminderBanner(true);
    }
  }, [isTravelWorkspace, travelReminderSummary.attentionCount]);

  const openTravelReminderCenter = useCallback(() => {
    sessionStorage.setItem('travelReminderAttentionSeen', 'true');
    setShowTravelReminderBanner(false);
    setIsTravelReminderCenterOpen(true);
  }, []);

  /*
   * Right Panel outside-click handling.
   */
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

    travelDashboardSummary,
    travelDashboardSummaryLoading,
    travelDashboardSummaryLoadedAt,
    fetchTravelDashboardSummary,

    travelReminderSummary,
    travelReminderSummaryLoading,
    travelReminderSummaryLoadedAt,
    fetchTravelReminderSummary,
    openTravelReminderCenter,
  };

  const visibleDashboardAlerts = isTravelWorkspace ? EMPTY_DASHBOARD_ALERTS : dashboardAlerts;

  const rightPanelWidthClass = isTravelWorkspace ? 'w-80 max-w-[86vw]' : 'w-64';

  const rightPanelDesktopWidthClass = isTravelWorkspace ? 'w-72' : 'w-64';

  const renderRightPanel = () => {
    if (isTravelWorkspace) {
      return (
        <TravelRightPanel
          summary={travelDashboardSummary}
          loading={travelDashboardSummaryLoading}
          reminderSummary={travelReminderSummary}
          onOpenReminderCenter={openTravelReminderCenter}
          onRefresh={() =>
            fetchTravelDashboardSummary({
              forceRefresh: true,
            })
          }
        />
      );
    }

    return (
      <RightPanel
        dashboardAlerts={dashboardAlerts}
        dashboardSummary={dashboardSummary}
        dashboardSummaryLoading={dashboardSummaryLoading}
        refreshDashboard={refreshDashboard}
      />
    );
  };

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* ================= TOP HEADER ================= */}
      <div className="z-50 flex-shrink-0">
        <TopHeader
          isRightPanelOpen={isRightPanelOpen}
          setIsRightPanelOpen={setIsRightPanelOpen}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          dashboardAlerts={visibleDashboardAlerts}
          travelReminderSummary={travelReminderSummary}
          onOpenTravelReminderCenter={openTravelReminderCenter}
        />
      </div>

      {showTravelReminderBanner && (
        <div className="fixed right-4 top-16 z-[70] max-w-[320px] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={openTravelReminderCenter}
              className="min-w-0 flex-1 text-left"
            >
              {t('travel.reminders.banner').replace(
                '{{count}}',
                Number(travelReminderSummary.attentionCount || 0).toLocaleString('en-GB')
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('travelReminderAttentionSeen', 'true');
                setShowTravelReminderBanner(false);
              }}
              className="text-amber-700"
              aria-label={t('travel.common.close')}
              title={t('travel.common.close')}
            >
              x
            </button>
          </div>
        </div>
      )}

      <TravelReminderCenter
        isOpen={isTravelReminderCenterOpen}
        onClose={() => setIsTravelReminderCenterOpen(false)}
        summary={travelReminderSummary}
        onSummaryRefresh={fetchTravelReminderSummary}
      />

      {/* ================= WORKSPACE ================= */}
      <div className="relative flex flex-1 overflow-hidden">
        {isSidebarOpen && isMobile && (
          <div
            className="fixed inset-0 z-30 bg-black bg-opacity-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {showSidebar && (
          <Sidebar
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            isDesktopSidebarVisible={isDesktopSidebarVisible}
            setIsDesktopSidebarVisible={setIsDesktopSidebarVisible}
          />
        )}

        {/* ================= DESKTOP SIDEBAR SHOW BUTTON ================= */}
        {!hideWorkspacePanels && !isMobile && !isDesktopSidebarVisible && (
          <button
            type="button"
            onClick={() => setIsDesktopSidebarVisible(true)}
            title="Show Sidebar"
            aria-label="Show Sidebar"
            className="
              absolute top-2 z-40 hidden
              h-9 w-7 items-center justify-center
              border border-slate-300
              bg-gradient-to-b from-white to-slate-100
              text-slate-600 shadow-md
              transition-all duration-300
              hover:bg-white hover:text-cyan-700
              focus:outline-none focus:ring-2 focus:ring-cyan-300
              md:flex
            "
            style={{
              ...(document.documentElement.dir === 'rtl'
                ? {
                    right: 0,
                    borderRightWidth: 0,
                    borderRadius: '0.5rem 0 0 0.5rem',
                  }
                : {
                    left: 0,
                    borderLeftWidth: 0,
                    borderRadius: '0 0.5rem 0.5rem 0',
                  }),
            }}
          >
            {document.documentElement.dir === 'rtl' ? (
              <FaChevronLeft aria-hidden="true" className="text-xs" />
            ) : (
              <FaChevronRight aria-hidden="true" className="text-xs" />
            )}
          </button>
        )}

        {/* ================= MAIN CONTENT ================= */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <Outlet context={outletContext} />
          </div>
        </div>

        {/* ================= RIGHT PANEL ================= */}
        {!hideWorkspacePanels && (
          <>
            {/* MOBILE RIGHT PANEL */}
            {isMobile && (
              <>
                {isRightPanelOpen && (
                  <div
                    className="fixed inset-0 z-30 bg-black bg-opacity-40 md:hidden"
                    onClick={() => setIsRightPanelOpen(false)}
                  />
                )}

                <div
                  ref={rightPanelRef}
                  className={`
                    fixed right-0 top-0 z-40 h-full
                    ${rightPanelWidthClass}
                    bg-white shadow-lg
                    transform
                    transition-transform duration-300
                    ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-full'}
                    md:hidden
                  `}
                >
                  {isRightPanelOpen && renderRightPanel()}
                </div>
              </>
            )}

            {/* DESKTOP RIGHT PANEL */}
            {!isMobile && (
              <div
                ref={rightPanelRef}
                className={`hidden overflow-hidden transition-all duration-300 md:block ${
                  isRightPanelOpen ? rightPanelDesktopWidthClass : 'w-0'
                }`}
              >
                {isRightPanelOpen && renderRightPanel()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MainLayout;
