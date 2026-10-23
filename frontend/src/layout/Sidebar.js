import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

import { t } from '../i18n/i18n';
import { isModuleEnabled, MODULE_KEYS } from '../utils/moduleConfig';
import { canAccess } from '../utils/permissionHelper';
import { travelSidebarItems } from '../components/travel/layout/travelNavigationConfig';
import { isTravelContext } from '../utils/travelContext';
import {
  weavingDashboardItem,
  weavingSidebarItems,
} from '../components/weaving/layout/weavingNavigationConfig';
import { isWeavingContext } from '../utils/weavingContext';
import {
  installmentsDashboardItem,
  installmentsSidebarItems,
} from '../components/installments/layout/installmentsNavigationConfig';
import { isInstallmentsContext } from '../utils/installmentsContext';

const Sidebar = ({
  isSidebarOpen,
  setIsSidebarOpen,
  isDesktopSidebarVisible,
  setIsDesktopSidebarVisible,
}) => {
  const location = useLocation();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isRTL = document.documentElement.dir === 'rtl';

  const showTradingShortcuts = isModuleEnabled(user, MODULE_KEYS.TRADING);

  const isTravelWorkspace = isTravelContext(location);
  const isWeavingWorkspace = isWeavingContext(location);
  const isInstallmentsWorkspace = isInstallmentsContext(location);

  const visibleTravelItems = travelSidebarItems.filter((item) =>
    canAccess({
      permission: item.permission,
      anyPermissions: item.anyPermissions,
      moduleKey: item.module,
      user,
    })
  );

  const visibleWeavingItems = weavingSidebarItems.filter((item) =>
    canAccess({
      permission: item.permission,
      anyPermissions: item.anyPermissions,
      moduleKey: item.module,
      user,
    })
  );

  const canViewWeavingDashboard = canAccess({
    permission: weavingDashboardItem.permission,
    moduleKey: weavingDashboardItem.module,
    user,
  });

  const visibleInstallmentsItems = installmentsSidebarItems.filter(
    (item) =>
      !item.implemented ||
      canAccess({
        permission: item.permission,
        anyPermissions: item.anyPermissions,
        moduleKey: item.module,
        user,
      })
  );

  if (isInstallmentsWorkspace) {
    return (
      <div
        className={`fixed left-0 top-0 z-40 flex h-full w-60 flex-col overflow-y-auto
        bg-gradient-to-b from-slate-950 via-indigo-950 to-cyan-950 text-white
        shadow-xl shadow-slate-950/10 transform transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:static md:translate-x-0`}
      >
        <div className="border-b border-white/10 p-2.5">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <SidebarItem
                to="/installments/dashboard"
                label={t('installments.sidebar.dashboard')}
                icon={installmentsDashboardItem.icon}
                setIsSidebarOpen={setIsSidebarOpen}
                variant="installments"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsDesktopSidebarVisible(false)}
              title={t('common.hideSidebar')}
              aria-label={t('common.hideSidebar')}
              className="hidden h-9 w-9 items-center justify-center rounded-md bg-white/10 text-cyan-50 transition hover:bg-white/15 md:flex"
            >
              {isRTL ? <FaChevronRight aria-hidden="true" /> : <FaChevronLeft aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {visibleInstallmentsItems
            .filter((item) => item.key !== 'installmentsDashboard')
            .map((item) =>
            item.implemented ? (
              <SidebarItem
                key={item.key}
                to={item.to}
                label={t(item.labelKey)}
                icon={item.icon}
                setIsSidebarOpen={setIsSidebarOpen}
                variant="installments"
              />
            ) : (
              <DisabledSidebarItem key={item.key} item={item} />
            )
          )}
        </div>
      </div>
    );
  }

  if (isTravelWorkspace) {
    return (
      <div
        className={`travel-sidebar-panel fixed left-0 top-0 z-40 flex h-full w-56 flex-col overflow-y-auto
        bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950 text-white
        shadow-xl shadow-slate-950/10
        transform transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:static md:translate-x-0`}
      >
        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          <div className="space-y-1">
            {visibleTravelItems.map((item) => (
              <SidebarItem
                key={item.key}
                to={item.to}
                label={t(item.labelKey)}
                icon={item.icon}
                setIsSidebarOpen={setIsSidebarOpen}
                variant="travel"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isWeavingWorkspace) {
    return (
      <div
        className={`fixed left-0 top-0 z-40 flex h-full w-56 flex-col overflow-y-auto
        bg-gradient-to-b from-slate-950 via-indigo-950 to-emerald-950 text-white
        shadow-xl shadow-slate-950/10
        transform transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:static md:translate-x-0`}
      >
        <div className="border-b border-white/10 p-2.5">
          <div className="flex items-center gap-2">
            {canViewWeavingDashboard && (
              <div className="min-w-0 flex-1">
                <SidebarItem
                  to={weavingDashboardItem.to}
                  label={t(weavingDashboardItem.labelKey)}
                  icon={weavingDashboardItem.icon}
                  setIsSidebarOpen={setIsSidebarOpen}
                  variant="weaving"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsDesktopSidebarVisible(false)}
              title="Hide Sidebar"
              aria-label="Hide Sidebar"
              className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-emerald-50 transition hover:bg-white/15 hover:text-white md:flex"
            >
              {isRTL ? (
                <FaChevronRight aria-hidden="true" className="text-xs" />
              ) : (
                <FaChevronLeft aria-hidden="true" className="text-xs" />
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          <div className="space-y-1">
            {visibleWeavingItems.map((item) => (
              <SidebarItem
                key={item.key}
                to={item.to}
                label={t(item.labelKey)}
                icon={item.icon}
                setIsSidebarOpen={setIsSidebarOpen}
                variant="weaving"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed left-0 top-0 z-40 flex h-full w-48 flex-col overflow-y-auto
      bg-gradient-to-b from-slate-900 to-slate-800 text-white
      transform transition-transform duration-300
      ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      md:static md:translate-x-0`}
    >
      <div className="border-b border-slate-700 p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('common.quickSearch')}
            className="min-w-0 flex-1 rounded-md bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={() => setIsDesktopSidebarVisible(false)}
            title="Hide Sidebar"
            aria-label="Hide Sidebar"
            className="hidden h-9 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-700 text-slate-200 transition hover:bg-slate-600 hover:text-white md:flex"
          >
            {isRTL ? (
              <FaChevronRight aria-hidden="true" className="text-xs" />
            ) : (
              <FaChevronLeft aria-hidden="true" className="text-xs" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        <SidebarItem to="/dashboard" label={t('dashboard')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/customers" label={t('customers')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/suppliers" label={t('suppliers')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/parties" label={t('parties')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/employees" label={t('employees.title')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/payroll" label={t('payroll.title')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/accounts" label={t('accounts')} setIsSidebarOpen={setIsSidebarOpen} />

        {showTradingShortcuts && (
          <SidebarItem to="/inventory" label={t('inventory')} setIsSidebarOpen={setIsSidebarOpen} />
        )}

        <SidebarItem to="/import" label={t('import.data')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/cashflow" label={t('reports')} setIsSidebarOpen={setIsSidebarOpen} />
      </div>

      {user?.role === 'admin' && (
        <SidebarItem
          to="/admin/devices"
          label="Admin Control"
          setIsSidebarOpen={setIsSidebarOpen}
        />
      )}
    </div>
  );
};

const SidebarItem = ({ to, label, icon: Icon = null, setIsSidebarOpen, variant = 'default' }) => (
  <NavLink
    to={to}
    onClick={() => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
    }}
    className={({ isActive }) =>
      `group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold
      transition-all duration-200 ${
        isActive
          ? variant === 'installments'
            ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md shadow-indigo-950/20'
            : variant === 'weaving'
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-950/20'
            : variant === 'travel'
              ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-md shadow-cyan-950/20'
              : 'bg-blue-600 text-white'
          : variant === 'installments'
            ? 'text-cyan-50/80 hover:bg-white/10 hover:text-white'
            : variant === 'weaving'
            ? 'text-emerald-50/80 hover:bg-white/10 hover:text-white'
            : variant === 'travel'
              ? 'text-slate-300 hover:bg-white/10 hover:text-white'
              : 'text-slate-300 hover:bg-slate-700'
      }`
    }
  >
    {Icon && <Icon aria-hidden="true" className="w-4 flex-shrink-0 text-[13px]" />}

    <span className="min-w-0 truncate">{label}</span>
  </NavLink>
);

const DisabledSidebarItem = ({ item }) => {
  const Icon = item.icon;

  return (
    <div
      className="flex min-h-10 cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-cyan-50/55"
      aria-disabled="true"
    >
      {Icon && <Icon aria-hidden="true" className="w-4 flex-shrink-0 text-[13px]" />}
      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-200/35" aria-hidden="true" />
    </div>
  );
};

export default Sidebar;
