import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { navigationService } from '../utils/navigationService';
import MegaMenu from './MegaMenu';

import menuConfig from './menuConfig';
import { filterMenuConfigByModules } from '../utils/moduleNavigation';
import { MODULE_KEYS } from '../utils/moduleConfig';
import { isTravelContext, buildTravelRouteState } from '../utils/travelContext';
import { getCurrentLanguage, setLanguage } from '../i18n/i18n';
import { t } from '../i18n/i18n';
import axios from 'axios';
import { FaBars, FaBell, FaEllipsisV, FaSyncAlt, FaUserCircle } from 'react-icons/fa';

const travelTopMenuConfig = [
  {
    label: 'travel.sidebar.dashboard',
    path: '/travel/dashboard',
    module: MODULE_KEYS.TRAVEL,
    anyPermissions: ['travel.view', 'travel.bookings.view'],
  },
  {
    label: 'travel.sidebar.customers',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.create',
        items: [
          {
            label: 'travel.customers.add',
            path: '/travel/customers?new=details',
            permission: 'travel.bookings.create',
          },
          {
            label: 'travel.payments.receiveAction',
            path: '/travel/payments/receive',
            anyPermissions: ['travel.bookings.view', 'travel.bookings.edit', 'travel.payments'],
          },
        ],
      },
      {
        title: 'travel.nav.manage',
        items: [
          {
            label: 'travel.customers.allCustomers',
            path: '/travel/customers',
            anyPermissions: ['travel.bookings.view', 'travel.customers', 'travel.payments'],
          },
          {
            label: 'travel.customers.dueCustomers',
            path: '/travel/customers?balance=due&sort=balance_desc',
            anyPermissions: ['travel.bookings.view', 'travel.customers', 'travel.payments'],
          },
          {
            label: 'travel.payments.receivedHistory.title',
            path: '/travel/payments/received',
            anyPermissions: ['travel.bookings.view', 'travel.payments'],
          },
        ],
      },
    ],
  },
  {
    label: 'travel.sidebar.vendors',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.create',
        items: [
          {
            label: 'travel.vendors.add',
            path: '/travel/vendors?new=details',
            permission: 'travel.vendors.manage',
          },
          {
            label: 'travel.payments.vendorActionShort',
            path: '/travel/vendor-payments/new',
            anyPermissions: ['travel.vendors.view', 'travel.vendors.manage', 'travel.payments'],
          },
          {
            label: 'travel.vendorReturns.add',
            path: '/travel/vendor-returns/new',
            permission: 'travel.vendors.manage',
          },
        ],
      },
      {
        title: 'travel.nav.manage',
        items: [
          {
            label: 'travel.vendors.allVendors',
            path: '/travel/vendors',
            permission: 'travel.vendors.view',
          },
          {
            label: 'travel.payments.vendorHistory.title',
            path: '/travel/payments/vendors',
            anyPermissions: ['travel.vendors.view', 'travel.payments'],
          },
          {
            label: 'travel.vendorReturns.title',
            path: '/travel/vendor-returns',
            permission: 'travel.vendors.view',
          },
        ],
      },
    ],
  },
  {
    label: 'travel.sidebar.bookings',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.create',
        items: [
          {
            label: 'travel.booking.actions.new',
            path: '/travel/bookings/new',
            permission: 'travel.bookings.create',
          },
        ],
      },
      {
        title: 'travel.nav.manage',
        items: [
          {
            label: 'travel.booking.filters.allInvoices',
            path: '/travel/bookings',
            permission: 'travel.bookings.view',
          },
          {
            label: 'travel.booking.serviceTypes.air_ticket',
            path: '/travel/bookings?serviceType=air_ticket',
            permission: 'travel.bookings.view',
          },
          {
            label: 'travel.booking.serviceTypes.visit_visa',
            path: '/travel/bookings?serviceType=visit_visa',
            permission: 'travel.bookings.view',
          },
          {
            label: 'travel.booking.serviceTypes.hotel',
            path: '/travel/bookings?serviceType=hotel',
            permission: 'travel.bookings.view',
          },
          {
            label: 'travel.booking.serviceTypes.umrah_package',
            path: '/travel/bookings?serviceType=umrah_package',
            permission: 'travel.bookings.view',
          },
        ],
      },
    ],
  },
  {
    label: 'travel.sidebar.reports',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.reports',
        items: [
          {
            label: 'travel.reports.tabs.overview',
            path: '/travel/reports?view=overview',
            permission: 'travel.reports',
          },
          {
            label: 'travel.reports.tabs.profit',
            path: '/travel/reports?view=profit',
            permission: 'travel.reports',
          },
          {
            label: 'travel.reports.tabs.sales',
            path: '/travel/reports?view=sales',
            permission: 'travel.reports',
          },
          {
            label: 'travel.reports.tabs.receivables',
            path: '/travel/reports?view=receivables',
            permission: 'travel.reports',
          },
          {
            label: 'travel.reports.tabs.payables',
            path: '/travel/reports?view=payables',
            permission: 'travel.reports',
          },
          {
            label: 'travel.reports.tabs.refunds',
            path: '/travel/reports?view=refunds',
            permission: 'travel.reports',
          },
          {
            label: 'travel.reports.tabs.payments',
            path: '/travel/reports?view=payments',
            permission: 'travel.reports',
          },
        ],
      },
    ],
  },
  {
    label: 'travel.sidebar.refunds',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.create',
        items: [
          {
            label: 'travel.refund.actions.new',
            path: '/travel/refunds/new',
            permission: 'travel.bookings.edit',
          },
        ],
      },
      {
        title: 'travel.nav.manage',
        items: [
          {
            label: 'travel.refund.historyTitle',
            path: '/travel/refunds',
            permission: 'travel.bookings.view',
          },
        ],
      },
    ],
  },
  {
    label: 'travel.nav.masters',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.manage',
        items: [
          {
            label: 'travel.sidebar.hotels',
            path: '/travel/hotels',
            permission: 'travel.hotels.view',
          },
          {
            label: 'travel.sidebar.airlines',
            path: '/travel/airlines',
            permission: 'travel.airlines.view',
          },
          {
            label: 'travel.sidebar.airports',
            path: '/travel/airports',
            permission: 'travel.airports.view',
          },
        ],
      },
    ],
  },
  {
    label: 'travel.sidebar.expenses',
    module: MODULE_KEYS.TRAVEL,
    sections: [
      {
        title: 'travel.nav.create',
        items: [
          {
            label: 'travel.expenses.add',
            path: '/travel/expenses/new',
            permission: 'expenses.create',
          },
        ],
      },
      {
        title: 'travel.nav.manage',
        items: [
          {
            label: 'travel.expenses.title',
            path: '/travel/expenses',
            permission: 'expenses.view',
          },
        ],
      },
    ],
  },
];

const TopHeader = ({
  isRightPanelOpen,
  setIsRightPanelOpen,
  isSidebarOpen,
  setIsSidebarOpen,
  dashboardAlerts,
  travelReminderSummary,
  onOpenTravelReminderCenter,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isTravelWorkspace = isTravelContext(location);

  const navigateFromHeader = (path, travelPath = null) => {
    if (isTravelWorkspace) {
      navigate(travelPath || path, {
        state: buildTravelRouteState('/travel/dashboard'),
      });
      return;
    }

    navigate(path);
  };

  const handleBack = () => {
    if (isTravelWorkspace && location.state?.returnTo) {
      navigate(location.state.returnTo);
      return;
    }

    if (isTravelWorkspace && !navigationService.canGoBack()) {
      navigate('/travel/dashboard');
      return;
    }

    navigationService.goBack(navigate);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [lang, setLang] = useState(getCurrentLanguage());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = React.useRef(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const alertCount =
    (dashboardAlerts?.lowStock || 0) +
    (dashboardAlerts?.overdueInvoices || 0) +
    (dashboardAlerts?.pendingPayments || 0);

  const travelReminderAlertCount = Number(travelReminderSummary?.attentionCount || 0);
  const visibleAlertCount = isTravelWorkspace ? travelReminderAlertCount : alertCount;

  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [showMessagePopup, setShowMessagePopup] = useState(false);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const visibleMenuConfig = filterMenuConfigByModules(menuConfig, user);

  const activeMenuConfig = isTravelWorkspace
    ? filterMenuConfigByModules(travelTopMenuConfig, user)
    : visibleMenuConfig;

  const isOwner = (user.accountRole || 'owner') === 'owner';
  const baseUrl = process.env.REACT_APP_API_BASE_URL;

  useEffect(() => {
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
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const notifRes = await axios.get(`${baseUrl}/api/notifications/my`, {
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
    };

    fetchNotifications();
  }, [token, baseUrl]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
    }

    setDeferredPrompt(null);
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();

      if (isTravelWorkspace) {
        if (term.includes('customer')) {
          navigate('/travel/customers');
        } else if (term.includes('vendor') || term.includes('supplier')) {
          navigate('/travel/vendors');
        } else if (term.includes('refund')) {
          navigate('/travel/refunds');
        } else if (term.includes('expense')) {
          navigate('/travel/expenses');
        } else if (term.includes('payment') || term.includes('receive')) {
          navigate('/travel/payments/receive');
        } else if (term.includes('return') || term.includes('credit')) {
          navigate('/travel/vendor-returns');
        } else if (term.includes('invoice') || term.includes('booking') || term.includes('sale')) {
          navigate('/travel/bookings');
        } else {
          navigate('/travel/dashboard');
        }
      } else if (term.includes('customer')) {
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
        navigate('/expenses');
      } else if (term.includes('account')) {
        navigate('/accounts');
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

  const handleMobileMenuPath = (path) => {
    if (!path) return;

    setShowMobileMenu(false);
    navigate(path);
  };

  return (
    <div className="relative bg-white border-b shadow-sm px-3 sm:px-6 h-14 flex items-center justify-between">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-3 md:gap-6">
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
            {lang === 'ur' ? '→' : '←'}
          </button>
        )}

        <div className="flex items-center gap-3">
          {/* Sidebar button */}
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 hover:text-blue-700 md:hidden"
            type="button"
            aria-label={t('travel.layout.toggleSidebar')}
            title={t('travel.layout.toggleSidebar')}
            onClick={() => {
              setShowMobileMenu(false);
              setIsSidebarOpen((prev) => !prev);
            }}
          >
            <FaBars aria-hidden="true" />
          </button>

          {/* Mobile menu */}
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 hover:text-blue-700 xl:hidden"
            type="button"
            aria-label={t('travel.layout.toggleMenu')}
            title={t('travel.layout.toggleMenu')}
            onClick={() => {
              setIsSidebarOpen(false);
              setShowMobileMenu((prev) => !prev);
            }}
          >
            <FaEllipsisV aria-hidden="true" />
          </button>

          {/* Logo */}
          <div
            className="hidden md:flex items-center cursor-pointer"
            onClick={() => navigate(isTravelWorkspace ? '/travel/dashboard' : '/dashboard')}
          >
            <img src="/logo.png" alt="logo" style={{ height: '35px' }} />
          </div>
        </div>

        {/* DESKTOP MENU */}
        <div className="hidden xl:flex items-center gap-1">
          {activeMenuConfig.map((menu) => (
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
        <div className="absolute top-14 left-0 w-full bg-white border-b shadow-md xl:hidden z-40 max-h-[calc(100vh-56px)] overflow-y-auto">
          {activeMenuConfig.map((menu, index) => (
            <div key={index} className="border-b">
              <div
                className={`px-4 py-3 font-semibold bg-gray-50 ${
                  menu.path ? 'cursor-pointer hover:bg-gray-100' : ''
                }`}
                role={menu.path ? 'button' : undefined}
                tabIndex={menu.path ? 0 : undefined}
                onClick={() => handleMobileMenuPath(menu.path)}
                onKeyDown={(event) => {
                  if (menu.path && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    handleMobileMenuPath(menu.path);
                  }
                }}
              >
                {t(menu.label)}
              </div>

              {!menu.path &&
                menu.sections?.map((section, sIndex) => (
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
      <div className="hidden xl:flex flex-1 justify-center px-8">
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
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Install */}
        {deferredPrompt && !isInstalled && (
          <button
            onClick={handleInstallClick}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1.5 rounded text-sm shadow hover:scale-105 transition"
          >
            {t('common.installApp')}
          </button>
        )}

        {/* Notification + Refresh */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Refresh */}
          <div
            onClick={() => window.location.reload()}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 hover:text-green-600"
            title="Refresh"
          >
            <FaSyncAlt aria-hidden="true" />
          </div>

          {/* Notification */}
          <div
            data-right-panel-toggle="true"
            onClick={() => {
              if (isTravelWorkspace && onOpenTravelReminderCenter) {
                onOpenTravelReminderCenter();
                return;
              }

              setIsRightPanelOpen((prev) => !prev);
            }}
            title={
              isTravelWorkspace ? t('travel.reminders.openCenter') : t('dashboard.togglePanel')
            }
            aria-label={
              isTravelWorkspace ? t('travel.reminders.openCenter') : t('dashboard.togglePanel')
            }
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();

                if (isTravelWorkspace && onOpenTravelReminderCenter) {
                  onOpenTravelReminderCenter();
                  return;
                }

                setIsRightPanelOpen((prev) => !prev);
              }
            }}
            className={`relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition hover:bg-slate-100 ${
              isTravelWorkspace && travelReminderAlertCount > 0
                ? 'text-amber-600 hover:text-amber-700'
                : 'text-slate-700 hover:text-blue-600'
            }`}
          >
            <FaBell aria-hidden="true" />

            {visibleAlertCount > 0 && (
              <span
                className={`absolute -right-1 -top-1 min-w-[16px] rounded-full px-1.5 py-[0px] text-center text-[9px] text-white shadow ${
                  isTravelWorkspace
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-gradient-to-r from-red-500 to-pink-500'
                }`}
              >
                {visibleAlertCount}
              </span>
            )}
          </div>
        </div>

        {/* Travel Right Panel */}
        {isTravelWorkspace && (
          <button
            type="button"
            onClick={() => setIsRightPanelOpen((prev) => !prev)}
            title={t('dashboard.togglePanel')}
            aria-label={t('dashboard.togglePanel')}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition ${
              isRightPanelOpen
                ? 'bg-cyan-50 text-cyan-700'
                : 'text-slate-700 hover:bg-slate-100 hover:text-cyan-700'
            }`}
          >
            <FaBars aria-hidden="true" />
          </button>
        )}

        {/* USER MENU */}
        <div className="relative" ref={userMenuRef}>
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 hover:text-blue-600"
          >
            <FaUserCircle aria-hidden="true" />
          </div>

          {showUserMenu && (
            <div
              dir={lang === 'ur' ? 'rtl' : 'ltr'}
              className={`absolute mt-2 w-52 bg-white border rounded shadow-lg z-50 ${
                lang === 'ur' ? 'left-0 text-right' : 'right-0 text-left'
              }`}
            >
              <div
                onClick={() => {
                  navigateFromHeader('/personal-info');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                👤 {t('auth.personalInfo')}
              </div>

              <div
                onClick={() => {
                  navigateFromHeader('/business-info');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                🏢 {t('business.title')}
              </div>

              <div
                onClick={() => {
                  navigateFromHeader('/backup');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                {t('backup.title')}
              </div>

              <div
                onClick={() => {
                  navigateFromHeader('/print-settings');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                {t('print.salesSettings')}
              </div>

              <div
                onClick={() => {
                  navigateFromHeader('/whatsapp-settings');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                {t('whatsappSettings.menu')}
              </div>

              <div
                onClick={() => {
                  navigateFromHeader('/change-pin');
                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                🔑 Change PIN
              </div>

              {isOwner && (
                <>
                  <div className="border-t my-1"></div>

                  <div
                    onClick={() => {
                      navigateFromHeader('/staff');
                      setShowUserMenu(false);
                    }}
                    className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                  >
                    👥 Staff Management
                  </div>

                  <div
                    onClick={() => {
                      navigateFromHeader('/activity-log', '/travel/activity-log');
                      setShowUserMenu(false);
                    }}
                    className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                  >
                    📋 Activity Log
                  </div>
                </>
              )}
              <div
                onClick={() => {
                  const userId = localStorage.getItem('userId');
                  const isEnabled = localStorage.getItem(`lockEnabled_${userId}`);

                  if (isEnabled === 'true') {
                    const confirmOff = window.confirm(
                      'Are you sure you want to turn OFF the lock?'
                    );

                    if (!confirmOff) {
                      setShowUserMenu(false);
                      return;
                    }

                    localStorage.setItem(`lockEnabled_${userId}`, 'false');
                    localStorage.setItem(`isUnlocked_${userId}`, 'true');

                    window.location.href = '/#/dashboard';
                  } else {
                    const confirmOn = window.confirm('Do you want to enable the lock?');

                    if (!confirmOn) {
                      setShowUserMenu(false);
                      return;
                    }

                    const pin = localStorage.getItem(`appPin_${userId}`);

                    if (!pin) {
                      alert('Please set a PIN first.');
                      window.location.href = '/#/set-pin';
                      return;
                    }

                    localStorage.setItem(`lockEnabled_${userId}`, 'true');
                    localStorage.setItem(`isUnlocked_${userId}`, 'false');

                    window.location.href = '/#/lock';
                  }

                  setShowUserMenu(false);
                }}
                className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              >
                🔒 Lock On / Off
              </div>

              <div className="border-t"></div>

              {/* Language */}
              <button
                onClick={() => changeLanguage(lang === 'en' ? 'ur' : 'en')}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-600 text-white shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 border border-white/20 backdrop-blur-sm"
              >
                {lang === 'en' ? '🌐 اردو' : '🌐 EN'}
              </button>

              <div
                onClick={() => {
                  const userId = localStorage.getItem('userId');

                  localStorage.setItem(`isUnlocked_${userId}`, 'false');

                  localStorage.removeItem('token');
                  localStorage.removeItem('userId');
                  localStorage.removeItem('user');

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
