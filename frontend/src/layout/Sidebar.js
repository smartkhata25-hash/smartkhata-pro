import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { t } from '../i18n/i18n';
import { isModuleEnabled, MODULE_KEYS } from '../utils/moduleConfig';
import { canAccess } from '../utils/permissionHelper';
import { travelSidebarItems } from '../components/travel/layout/travelNavigationConfig';
import { isTravelContext } from '../utils/travelContext';

const Sidebar = ({ isSidebarOpen, setIsSidebarOpen }) => {
  const location = useLocation();

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const showTradingShortcuts = isModuleEnabled(user, MODULE_KEYS.TRADING);

  const isTravelWorkspace = isTravelContext(location);

  const visibleTravelItems = travelSidebarItems.filter((item) =>
    canAccess({
      permission: item.permission,
      anyPermissions: item.anyPermissions,
      moduleKey: item.module,
      user,
    })
  );

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

  return (
    <div
      className={`fixed left-0 top-0 z-40 flex h-full w-48 flex-col overflow-y-auto
      bg-gradient-to-b from-slate-900 to-slate-800 text-white
      transform transition-transform duration-300
      ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      md:static md:translate-x-0`}
    >
      <div className="border-b border-slate-700 p-4">
        <input
          type="text"
          placeholder={t('common.quickSearch')}
          className="w-full rounded-md bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        <SidebarItem to="/dashboard" label={t('dashboard')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/customers" label={t('customers')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/suppliers" label={t('suppliers')} setIsSidebarOpen={setIsSidebarOpen} />

        <SidebarItem to="/parties" label={t('parties')} setIsSidebarOpen={setIsSidebarOpen} />

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
          ? variant === 'travel'
            ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-md shadow-cyan-950/20'
            : 'bg-blue-600 text-white'
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

export default Sidebar;
