import React, { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { createEmployee, getEmployeeFormMeta } from '../../services/employeeService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { getCurrentLanguage } from '../../i18n/i18n';
import { employeeText as txt, selectableMasters, departmentDesignations, shiftHours } from './weavingEmployeeMasterUtils';

export default function WeavingQuickEmployeeModal({ onClose, onSaved }) {
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', unitId: '', departmentId: '', shiftId: '', designationId: '', baseSalary: '', dutyHours: '', joiningDate: getBusinessDateInputValue(), salaryType: 'daily', employmentType: 'temporary' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getEmployeeFormMeta({ moduleScope: 'weaving' }).then((data) => {
    setMeta(data);
    const units = selectableMasters(data.units);
    setForm((old) => ({ ...old, unitId: units.length === 1 ? units[0]._id : '' }));
  }).catch((e) => setError(e.response?.data?.message || 'Could not load employee setup')); }, []);
  const roles = departmentDesignations(meta?.designations || [], form.departmentId);
  const patch = (field, value) => setForm((old) => ({ ...old, [field]: value,
    ...(field === 'departmentId' ? { designationId: departmentDesignations(meta.designations, value).find((row) => row.name === 'Temporary Worker')?._id || '' } : {}),
    ...(field === 'shiftId' ? { dutyHours: shiftHours(meta.shifts.find((row) => row._id === value)) || old.dutyHours } : {}),
  }));
  const save = async (e) => {
    e.preventDefault(); if (saving) return;
    if (!form.designationId) { setError(txt('Select a Designation in More, or link Temporary Worker to this Department in Employee Setup.', 'مزید میں عہدہ منتخب کریں یا سیٹ اپ میں عارضی مزدور کو اس شعبے سے جوڑیں۔')); return; }
    setSaving(true); setError('');
    try { const row = await createEmployee(form, { moduleScope: 'weaving' }); onSaved(row); }
    catch (err) { setError(err.response?.data?.message || 'Could not save employee'); }
    finally { setSaving(false); }
  };
  const input = 'mt-1 h-10 w-full rounded-md border px-3 text-sm';
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-3" dir={getCurrentLanguage() === 'ur' ? 'rtl' : 'ltr'}><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-4 shadow-xl">
    <header className="mb-4 flex justify-between font-bold text-cyan-800">{txt('Quick / Temporary Worker', 'عارضی ملازم')}<button type="button" disabled={saving} onClick={onClose} aria-label="Close"><FaTimes /></button></header>
    <div className="grid gap-3 sm:grid-cols-2">{[['name', txt('Name', 'نام'), 'text', false], ['phone', txt('Phone', 'فون'), 'tel', true]].map(([field, label, type, required]) => <label key={field} className="text-sm">{label}{required && ' *'}<input required={required} type={type} className={input} value={form[field]} onChange={(e) => patch(field, e.target.value)} /></label>)}
      {['unit', 'department', 'shift'].map((kind, index) => <label key={kind} className="text-sm">{[txt('Unit', 'یونٹ'), txt('Department', 'شعبہ'), txt('Shift', 'شفٹ')][index]} *<select required className={input} value={form[`${kind}Id`]} onChange={(e) => patch(`${kind}Id`, e.target.value)}><option value="">—</option>{selectableMasters(meta?.[`${kind}s`] || []).map((row) => <option key={row._id} value={row._id}>{kind === 'unit' ? `${row.unitNo} - ` : ''}{row.name}</option>)}</select></label>)}
      { [['baseSalary', txt('Daily Rate', 'یومیہ اجرت'), 'number'], ['dutyHours', txt('Duty Hours', 'ڈیوٹی گھنٹے'), 'number'], ['joiningDate', txt('Salary Start Date', 'تنخواہ شروع تاریخ'), 'date']].map(([field, label, type]) => <label key={field} className="text-sm">{label} *<input required dir="ltr" type={type} min={type === 'number' ? '0.01' : undefined} max={field === 'dutyHours' ? 24 : undefined} step={type === 'number' ? 'any' : undefined} className={input} value={form[field]} onChange={(e) => patch(field, e.target.value)} /></label>)}
      <details className="sm:col-span-2"><summary className="cursor-pointer text-sm font-bold text-cyan-800">{txt('More', 'مزید')}</summary><label className="text-sm">{txt('Designation', 'عہدہ')} *<select className={input} value={form.designationId} onChange={(e) => patch('designationId', e.target.value)}><option value="">—</option>{roles.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label></details>
    </div>{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}<footer className="mt-4 flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose}>{txt('Cancel', 'منسوخ')}</button><button disabled={saving || !meta} className="rounded bg-emerald-700 px-4 py-2 text-white">{txt('Save', 'محفوظ کریں')}</button></footer>
  </form></div>;
}
