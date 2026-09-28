import React, { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import * as api from '../../services/employeeService';
import { employeeText as txt, refId } from './weavingEmployeeMasterUtils';
import { getCurrentLanguage } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';

const types = {
  units: ['Units', 'یونٹس', api.createWeavingUnit, api.updateWeavingUnit],
  departments: ['Departments', 'شعبے', api.createWeavingDepartment, api.updateWeavingDepartment],
  designations: ['Designations', 'عہدے', api.createEmployeeDesignation, api.updateEmployeeDesignation],
  shifts: ['Shifts', 'شفٹیں', api.createWeavingShift, api.updateWeavingShift],
};
const input = 'h-10 w-full rounded-md border px-3 text-sm';
export default function WeavingEmployeeSetupModal({ onClose, onChanged }) {
  const [meta, setMeta] = useState({});
  const [tab, setTab] = useState('units');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const options = { moduleScope: 'weaving' };
  const load = async () => setMeta(await api.getEmployeeFormMeta({ moduleScope: 'weaving' }));
  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Could not load setup')); }, []);
  const save = async (event) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError('');
    try {
      if (form._id) await types[tab][3](form._id, form, options);
      else await types[tab][2](form, options);
      setForm(null); await load(); onChanged?.();
    } catch (e) { setError(e.response?.data?.message || 'Could not save setup'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-3" dir={getCurrentLanguage() === 'ur' ? 'rtl' : 'ltr'}><section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-4 shadow-xl">
    <header className="mb-3 flex items-center justify-between"><h2 className="font-bold text-cyan-800">{txt('Employee Setup', 'ملازم سیٹ اپ')}</h2><button type="button" disabled={saving} onClick={onClose} aria-label="Close"><FaTimes /></button></header>
    <div className="mb-4 flex flex-wrap gap-2">{Object.entries(types).map(([key, labels]) => <button type="button" disabled={saving} className={`rounded-md px-3 py-2 text-sm ${key === tab ? 'bg-cyan-700 text-white' : 'bg-slate-100'}`} key={key} onClick={() => { setTab(key); setForm(null); setError(''); }}>{txt(labels[0], labels[1])}</button>)}</div>
    {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
    {form ? <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      {tab === 'units' && <label>{txt('Unit No.', 'یونٹ نمبر')} *<input required type="number" min="1" className={input} value={form.unitNo || ''} onChange={(e) => setForm({ ...form, unitNo: e.target.value })} /></label>}
      <label>{txt('Name', 'نام')}{tab !== 'units' && ' *'}<input required={tab !== 'units'} className={input} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      {tab === 'shifts' && ['startTime', 'endTime'].map((field) => <label key={field}>{field === 'startTime' ? txt('Start Time', 'شروع وقت') : txt('End Time', 'ختم وقت')} *<input required type="time" dir="ltr" className={input} value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} /></label>)}
      {tab === 'designations' && <fieldset className="sm:col-span-2"><legend>{txt('Departments', 'شعبے')} *</legend><div className="grid max-h-48 gap-2 overflow-auto rounded border p-2 sm:grid-cols-2">{(meta.departments || []).map((row) => <label key={row._id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(form.departmentIds || []).map(refId).includes(refId(row))} onChange={(e) => setForm({ ...form, departmentIds: e.target.checked ? [...(form.departmentIds || []), row._id] : form.departmentIds.filter((id) => refId(id) !== refId(row)) })} />{row.name}</label>)}</div></fieldset>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive !== false && !form.isDeleted} onChange={(e) => setForm({ ...form, isActive: e.target.checked, isDeleted: false })} />{txt('Active', 'فعال')}</label>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" disabled={saving} onClick={() => setForm(null)}>{txt('Cancel', 'منسوخ')}</button><button disabled={saving} className="rounded bg-cyan-700 px-4 py-2 text-white">{txt('Save', 'محفوظ کریں')}</button></div>
    </form> : <><button type="button" disabled={!hasPermission('employees.create') && (tab === 'units' || !hasPermission('employees.edit'))} onClick={() => setForm({ name: '', isActive: true, departmentIds: [], startTime: '', endTime: '', unitNo: Math.max(0, ...(meta.units || []).map((row) => row.unitNo)) + 1 })} className="mb-3 rounded bg-emerald-700 px-3 py-2 text-sm text-white">+ {txt('Add', 'نیا شامل کریں')}</button>
      <div className="divide-y">{(meta[tab] || []).map((row) => <div key={row._id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className={row.isActive === false || row.isDeleted ? 'text-slate-400' : ''}>{tab === 'units' ? `${row.unitNo} - ` : ''}{row.name}{tab === 'shifts' ? ` ${row.startTime || ''} – ${row.endTime || ''}` : ''}{(row.isActive === false || row.isDeleted) && ` (${txt('Hidden', 'غیر فعال')})`}</span><button type="button" onClick={() => setForm({ ...row })} className="text-cyan-800">{txt('Edit', 'ترمیم')}</button></div>)}</div></>}
  </section></div>;
}
