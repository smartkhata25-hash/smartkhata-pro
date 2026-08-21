import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Outlet, useLocation } from 'react-router-dom';
import TopHeader from './TopHeader';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';

const MainLayout = () => {
  useEffect(() => {
    setTimeout(() => {
      const el = document.querySelector('.flex-1.overflow-y-auto');
      if (el) {
      }
    }, 2000);
  }, []);
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/check-device`)
      .then((res) => {
        if (!res.ok) {
          // 🔥 PURANA LOGIN DATA CLEAR
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          localStorage.removeItem('user');
          localStorage.removeItem('mode');

          alert('Unauthorized device. Please login again.');

          // 🔥 LOGIN PAGE
          window.location.href = '/#/login';
        }
      })
      .catch(() => {});
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    const savedState = localStorage.getItem('rightPanelOpen');
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  const [dashboardAlerts, setDashboardAlerts] = useState({
    lowStock: 0,
    negativeStock: 0,
    overdueInvoices: 0,
    pendingPayments: 0,
  });

  const fetchDashboardAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const baseUrl = process.env.REACT_APP_API_BASE_URL;

      const res = await axios.get(`${baseUrl}/api/dashboard-alerts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setDashboardAlerts(res.data?.summary || {});
    } catch (error) {
      console.error('Dashboard alerts fetch failed:', error);
    }
  }, []);

  useEffect(() => {
    fetchDashboardAlerts();
  }, [fetchDashboardAlerts]);

  const rightPanelRef = useRef(null);
  useEffect(() => {
    localStorage.setItem('rightPanelOpen', JSON.stringify(isRightPanelOpen));
  }, [isRightPanelOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Notification icon پر click ہو تو outside-click اسے بند نہ کرے
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
  const location = useLocation();

  const isLedgerPage =
    location.pathname.startsWith('/customer-ledger') ||
    location.pathname.startsWith('/supplier-ledger') ||
    location.pathname.startsWith('/party-ledger');

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

      {/* 🔹 باڈی */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        {/* 🔹 Sidebar ledger میں hide */}
        {!isLedgerPage && (
          <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
        )}

        {/* 🔹 سینٹر ایریا */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </div>

        {/* 🔹 Right Panel ledger میں hide */}
        {!isLedgerPage && (
          <>
            {/* 📱 Mobile */}
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
                      refreshDashboardAlerts={fetchDashboardAlerts}
                    />
                  )}
                </div>
              </>
            )}

            {/* 💻 Desktop */}
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
                    refreshDashboardAlerts={fetchDashboardAlerts}
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
