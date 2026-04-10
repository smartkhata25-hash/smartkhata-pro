import React, { useState, useEffect } from 'react';
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
          alert('Unauthorized device. Please login again.');
          window.location.href = '/login';
        }
      })
      .catch(() => {});
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    const savedState = localStorage.getItem('rightPanelOpen');
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  useEffect(() => {
    localStorage.setItem('rightPanelOpen', JSON.stringify(isRightPanelOpen));
  }, [isRightPanelOpen]);
  const location = useLocation();

  const isLedgerPage =
    location.pathname.startsWith('/customer-ledger') ||
    location.pathname.startsWith('/supplier-ledger');

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="flex-shrink-0 z-50">
        <TopHeader
          isRightPanelOpen={isRightPanelOpen}
          setIsRightPanelOpen={setIsRightPanelOpen}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
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
            {/* 📱 Mobile Overlay */}
            {isRightPanelOpen && (
              <div
                className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
                onClick={() => setIsRightPanelOpen(false)}
              />
            )}

            {/* 📱 Mobile Panel */}
            <div
              className={`
        fixed top-0 right-0 h-full z-40 w-64 bg-white shadow-lg
        transform transition-transform duration-300
        ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-full'}
        md:hidden
      `}
            >
              <RightPanel />
            </div>

            {/* 💻 Desktop Panel */}
            <div
              className={`hidden md:block transition-all duration-300 ${
                isRightPanelOpen ? 'w-64' : 'w-0'
              } overflow-hidden`}
            >
              {isRightPanelOpen && <RightPanel />}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MainLayout;
