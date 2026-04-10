import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { navigationService } from '../utils/navigationService';
import MegaMenu from './MegaMenu';

import menuConfig from './menuConfig';
import { getCurrentLanguage, setLanguage } from '../i18n/i18n';
import { t } from '../i18n/i18n';
import axios from 'axios';

const TopHeader = ({ isRightPanelOpen, setIsRightPanelOpen, isSidebarOpen, setIsSidebarOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    navigationService.goBack(navigate);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [lang, setLang] = useState(getCurrentLanguage());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [alertCount, setAlertCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const [notificationMsg, setNotificationMsg] = useState('');
  const [showMessagePopup, setShowMessagePopup] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    // 📱 mobile detect
    setIsMobile(window.innerWidth < 768);

    // 📦 app installed detect
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsInstalled(isStandalone);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await axios.get('/api/dashboard-alerts', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data.summary;

        const total =
          (data.lowStock || 0) + (data.overdueInvoices || 0) + (data.pendingPayments || 0);

        setAlertCount(total);
        // 🔥 notifications fetch
        try {
          const notifRes = await axios.get('/api/notifications/my', {
            headers: { Authorization: `Bearer ${token}` },
          });

          const notifications = notifRes.data;

          if (notifications.length > 0) {
            const latestMsg = notifications[0].message;
            const savedMsg = localStorage.getItem('seenNotification');

            if (latestMsg && latestMsg !== savedMsg) {
              setNotificationMsg(latestMsg);
              setShowMessagePopup(true);
            }
          }
        } catch (err) {
          console.error(t('alerts.notificationError'), err);
        }
        if (total > 0) {
        }
      } catch (err) {
        console.error(t('alerts.alertFetchError'), err);
      }
    };

    fetchAlerts();

    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
    }

    setDeferredPrompt(null);
  };

  // 🔥 IMPROVED SEARCH (PRO LEVEL)
  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();

      if (term.includes('customer')) {
        navigate('/customers');
      } else if (term.includes('supplier')) {
        navigate('/suppliers');
      } else if (term.includes('invoice') || term.includes('sale')) {
        navigate('/sales-invoices');
      } else if (term.includes('purchase')) {
        navigate('/purchase-invoices');
      } else if (term.includes('product') || term.includes('item')) {
        navigate('/inventory');
      } else if (term.includes('stock')) {
        navigate('/stock-history');
      } else if (term.includes('expense')) {
        navigate('/expenses'); // 🔥 NEW
      } else if (term.includes('account')) {
        navigate('/accounts'); // 🔥 NEW
      } else if (term.includes('ledger')) {
        navigate('/ledger');
      } else if (term.includes('report')) {
        navigate('/trial-balance');
      } else {
        navigate('/dashboard');
      }

      setSearchTerm('');
    }
  };

  const changeLanguage = (newLang) => {
    setLanguage(newLang);
    setLang(newLang);
    window.location.reload();
  };

  return (
    <div className="relative bg-white border-b shadow-sm px-6 h-14 flex items-center justify-between">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-6">
        {!['/dashboard', '/login', '/', '/personal-info', '/business-info'].includes(
          location.pathname
        ) && (
          <button
            onClick={handleBack}
            style={{
              fontSize: 13,
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              lineHeight: 1,
            }}
            onMouseOver={(e) => (e.target.style.background = '#f3f4f6')}
            onMouseOut={(e) => (e.target.style.background = 'transparent')}
            title={t('common.back')}
          >
            ←
          </button>
        )}

        <div className="flex items-center gap-3">
          {/* Sidebar button */}
          <button
            className="md:hidden text-xl"
            onClick={() => {
              setShowMobileMenu(false);
              setIsSidebarOpen((prev) => !prev);
            }}
          >
            ☰
          </button>

          {/* Mobile menu */}
          <button
            className="md:hidden text-lg"
            onClick={() => {
              setIsSidebarOpen(false);
              setShowMobileMenu((prev) => !prev);
            }}
          >
            ⋮
          </button>

          {/* Logo */}
          <div
            className="hidden md:flex items-center cursor-pointer"
            onClick={() => navigate('/dashboard')}
          >
            <img src="/logo.png" alt="logo" style={{ height: '35px' }} />
          </div>
        </div>

        {/* DESKTOP MENU */}
        <div className="hidden md:flex items-center gap-1">
          {menuConfig.map((menu, index) => (
            <MegaMenu
              key={menu.label}
              label={menu.label}
              sections={menu.sections}
              path={menu.path}
            />
          ))}
        </div>
      </div>

      {/* MOBILE MENU */}
      {showMobileMenu && (
        <div className="absolute top-14 left-0 w-full bg-white border-b shadow-md md:hidden z-40 max-h-[calc(100vh-56px)] overflow-y-auto">
          {menuConfig.map((menu, index) => (
            <div key={index} className="border-b">
              <div className="px-4 py-3 font-semibold bg-gray-50">{t(menu.label)}</div>

              {menu.sections?.map((section, sIndex) => (
                <div key={sIndex}>
                  {section.items?.map((item, iIndex) => (
                    <div
                      key={iIndex}
                      className="px-6 py-2 text-sm cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        setShowMobileMenu(false);
                        navigate(item.path);
                      }}
                    >
                      {t(item.label)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* SEARCH */}
      <div className="hidden lg:flex flex-1 justify-center px-8">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleSearch}
          placeholder={t('common.searchEnter')}
          className="w-full max-w-md px-4 py-1.5 rounded-full border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-4">
        {/* Language */}
        <button
          onClick={() => changeLanguage(lang === 'en' ? 'ur' : 'en')}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-600 text-white shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 border border-white/20 backdrop-blur-sm"
        >
          {lang === 'en' ? '🌐 اردو' : '🌐 EN'}
        </button>

        {/* Install */}
        {deferredPrompt && isMobile && !isInstalled && (
          <button
            onClick={handleInstallClick}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1.5 rounded text-sm shadow hover:scale-105 transition"
          >
            {t('common.installApp')}
          </button>
        )}

        {/* Notification */}
        <div
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className="relative cursor-pointer text-lg hover:text-blue-600 transition"
        >
          🔔
          {/* Badge (alerts count) */}
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[9px] px-1.5 py-[0px] rounded-full min-w-[16px] text-center shadow">
              {alertCount}
            </span>
          )}
        </div>

        {/* USER MENU */}
        <div className="relative">
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="cursor-pointer text-lg hover:text-blue-600 transition"
          >
            👤
          </div>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-white border rounded shadow-lg z-50">
              <div
                onClick={() => {
                  navigate('/backup');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                {t('backup.title')}
              </div>

              <div
                onClick={() => {
                  navigate('/print-settings');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                {t('print.salesSettings')}
              </div>

              <div className="border-t"></div>

              <div
                onClick={() => {
                  localStorage.removeItem('token');
                  navigate('/');
                }}
                className="px-4 py-2 text-sm text-red-600 hover:bg-gray-100 cursor-pointer"
              >
                {t('auth.logout')}
              </div>
            </div>
          )}
        </div>
      </div>
      {showMessagePopup && (
        <div className="fixed top-5 right-5 z-50 max-w-[300px]">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-start gap-3 backdrop-blur-sm border border-white/20">
            <div className="flex-1 text-sm leading-relaxed">{notificationMsg}</div>

            <button
              onClick={() => {
                localStorage.setItem('seenNotification', notificationMsg);
                setShowMessagePopup(false);
              }}
              className="text-white/80 hover:text-white text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopHeader;
