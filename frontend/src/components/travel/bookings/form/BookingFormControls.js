import React from 'react';

import { t } from '../../../../i18n/i18n';

export const Field = ({ labelKey, children }) => (
  <label className="min-w-0">
    <span className="mb-1 block text-xs font-extrabold text-slate-500">{t(labelKey)}</span>
    {children}
  </label>
);

export const Input = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${className}`}
  />
);

export const Select = ({ children, className = '', ...props }) => (
  <select
    {...props}
    className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${className}`}
  >
    {children}
  </select>
);

export const Textarea = ({ className = '', ...props }) => (
  <textarea
    {...props}
    rows={3}
    className={`w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${className}`}
  />
);

export const Section = ({ titleKey, icon: Icon, children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
      {Icon && (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
          <Icon aria-hidden="true" />
        </span>
      )}
      <h2 className="text-sm font-extrabold text-slate-900 md:text-base">{t(titleKey)}</h2>
    </div>
    {children}
  </section>
);
