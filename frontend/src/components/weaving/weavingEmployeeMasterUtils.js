import { getCurrentLanguage } from '../../i18n/i18n';
export const employeeText = (en, ur) => getCurrentLanguage() === 'ur' ? ur : en;
export const refId = (value) => String(value?._id || value || '');
export const selectableMasters = (rows = [], current = '') => rows.filter((row) => (!row.isDeleted && row.isActive !== false) || refId(row) === refId(current));
export const departmentDesignations = (rows, departmentId, existing) => rows.filter((row) =>
  ((!row.isDeleted && row.isActive !== false) && (row.departmentIds || []).some((id) => refId(id) === refId(departmentId))) ||
  (existing && refId(existing.departmentId) === refId(departmentId) && refId(existing.designationId) === refId(row)));
export const shiftHours = (shift) => {
  if (!/^\d{2}:\d{2}$/.test(shift?.startTime || '') || !/^\d{2}:\d{2}$/.test(shift?.endTime || '')) return '';
  const minutes = (time) => time.split(':').reduce((hours, value, i) => hours + Number(value) * (i ? 1 : 60), 0);
  const duration = (minutes(shift.endTime) - minutes(shift.startTime) + 1440) % 1440;
  return duration ? Math.round(duration / 60 * 100) / 100 : '';
};
