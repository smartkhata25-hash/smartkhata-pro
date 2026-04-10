import React from 'react';
import { NavLink } from 'react-router-dom';
import { t } from '../i18n/i18n';

const Sidebar = ({ isSidebarOpen, setIsSidebarOpen }) => {
  return (
    <div
      className={`fixed md:static top-0 left-0 h-full z-40 w-48 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col transform transition-transform duration-300
  ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
  md:translate-x-0`}
    >
      {/* 🔹 Quick Search */}
      <div className="p-4 border-b border-slate-700">
        <input
          type="text"
          placeholder={t('common.quickSearch')}
          className="w-full px-3 py-2 rounded-md bg-slate-700 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 🔹 Menu Section */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <SidebarItem to="/dashboard" label={t('dashboard')} setIsSidebarOpen={setIsSidebarOpen} />
        <SidebarItem to="/customers" label={t('customers')} setIsSidebarOpen={setIsSidebarOpen} />
        <SidebarItem to="/suppliers" label={t('suppliers')} setIsSidebarOpen={setIsSidebarOpen} />
        <SidebarItem to="/accounts" label={t('accounts')} setIsSidebarOpen={setIsSidebarOpen} />
        <SidebarItem to="/inventory" label={t('inventory')} setIsSidebarOpen={setIsSidebarOpen} />
        <SidebarItem to="/import" label={t('import.data')} setIsSidebarOpen={setIsSidebarOpen} />
        <SidebarItem to="/cashflow" label={t('reports')} setIsSidebarOpen={setIsSidebarOpen} />
      </div>

      {JSON.parse(localStorage.getItem('user'))?.role === 'admin' && (
        <SidebarItem
          to="/admin/devices"
          label="Admin Control"
          setIsSidebarOpen={setIsSidebarOpen}
        />
      )}
    </div>
  );
};

const SidebarItem = ({ to, label, setIsSidebarOpen }) => (
  <NavLink
    to={to}
    onClick={() => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false); // 📱 mobile پر auto hide
      }
    }}
    className={({ isActive }) =>
      `block px-4 py-2 rounded-md text-sm transition-all ${
        isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'
      }`
    }
  >
    {label}
  </NavLink>
);

export default Sidebar;
