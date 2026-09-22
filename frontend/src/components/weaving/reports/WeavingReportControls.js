import React from 'react';
import { FaFilter } from 'react-icons/fa';
import { t } from '../../../i18n/i18n';

export const controlClass = 'h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

const Select = ({ value, onChange, children, label }) => (
  <label className="grid min-w-[150px] gap-1 text-[11px] font-bold uppercase text-slate-500">
    {label}
    <select className={controlClass} value={value || ''} onChange={(event) => onChange(event.target.value)}>{children}</select>
  </label>
);

export default function WeavingReportControls({ params, setParams, meta = {}, kind }) {
  const patch = (field, value) => setParams((current) => ({ ...current, [field]: value }));
  const dated = !['stock'].includes(kind);
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/80 p-4">
      <span className="mb-2 text-slate-500"><FaFilter /></span>
      {dated && <Select label={t('weaving.operationalReports.dateRange')} value={params.preset} onChange={(value) => patch('preset', value)}>
        {['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'custom'].map((value) => <option key={value} value={value}>{t(`weaving.operationalReports.presets.${value}`)}</option>)}
      </Select>}
      {dated && params.preset === 'custom' && <><label className="grid gap-1 text-[11px] font-bold uppercase text-slate-500">{t('weaving.operationalReports.from')}<input type="date" className={controlClass} value={params.from || ''} onChange={(event) => patch('from', event.target.value)} /></label><label className="grid gap-1 text-[11px] font-bold uppercase text-slate-500">{t('weaving.operationalReports.to')}<input type="date" className={controlClass} value={params.to || ''} onChange={(event) => patch('to', event.target.value)} /></label></>}
      {['production', 'quality'].includes(kind) && <Select label={t('weaving.operationalReports.loom')} value={params.loomId} onChange={(value) => patch('loomId', value)}><option value="">{t('weaving.operationalReports.allLooms')}</option>{meta.looms?.map((row) => <option key={row._id} value={row._id}>{row.loomNumber} - {row.name}</option>)}</Select>}
      {['production', 'quality', 'stock', 'rejection', 'profit'].includes(kind) && <Select label={t('weaving.operationalReports.quality')} value={params.fabricQualityId} onChange={(value) => patch('fabricQualityId', value)}><option value="">{t('weaving.operationalReports.allQualities')}</option>{meta.qualities?.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</Select>}
      {['production', 'quality', 'sales'].includes(kind) && <Select label={t('weaving.operationalReports.contract')} value={params.contractId} onChange={(value) => patch('contractId', value)}><option value="">{t('weaving.operationalReports.allContracts')}</option>{meta.contracts?.map((row) => <option key={row._id} value={row._id}>{row.contractNo}</option>)}</Select>}
      {['sales', 'rejection', 'profit'].includes(kind) && <Select label={t('weaving.operationalReports.party')} value={params.partyId} onChange={(value) => patch('partyId', value)}><option value="">{t('weaving.operationalReports.allParties')}</option>{meta.parties?.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</Select>}
      {kind === 'stock' && <Select label={t('weaving.operationalReports.godown')} value={params.godownId} onChange={(value) => patch('godownId', value)}><option value="">{t('weaving.operationalReports.allGodowns')}</option>{meta.godowns?.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</Select>}
      {['production', 'stock'].includes(kind) && <Select label={t('weaving.operationalReports.grade')} value={params.grade} onChange={(value) => patch('grade', value)}><option value="">{t('weaving.operationalReports.allGrades')}</option><option value="a">A / Normal</option><option value="b">B Grade</option><option value="rejected">{t('weaving.operationalReports.rejected')}</option>{kind === 'stock' && <><option value="cut_piece">{t('weaving.operationalReports.cutPiece')}</option><option value="waste">{t('weaving.operationalReports.waste')}</option></>}</Select>}
      {kind === 'stock' && <Select label={t('weaving.operationalReports.ownership')} value={params.ownershipType} onChange={(value) => patch('ownershipType', value)}><option value="">{t('weaving.operationalReports.allOwnership')}</option><option value="own">{t('weaving.operationalReports.own')}</option><option value="party">{t('weaving.operationalReports.partyOwned')}</option></Select>}
      {['sales', 'profit'].includes(kind) && <Select label={t('weaving.operationalReports.saleType')} value={params.saleType} onChange={(value) => patch('saleType', value)}><option value="">{t('weaving.operationalReports.allSaleTypes')}</option><option value="fabric">{t('weaving.operationalReports.fabric')}</option><option value="yarn">{t('weaving.operationalReports.yarn')}</option><option value="conversion">{t('weaving.operationalReports.conversion')}</option><option value="other">{t('weaving.operationalReports.other')}</option></Select>}
      {kind === 'profit' && <Select label={t('weaving.operationalReports.profitScope')} value={params.scope} onChange={(value) => patch('scope', value)}><option value="combined">{t('weaving.operationalReports.combined')}</option><option value="own">{t('weaving.operationalReports.ownManufacturing')}</option><option value="conversion">{t('weaving.operationalReports.conversion')}</option></Select>}
      {kind === 'sales' && <Select label={t('weaving.operationalReports.paymentStatus')} value={params.paymentStatus} onChange={(value) => patch('paymentStatus', value)}><option value="">{t('weaving.operationalReports.allStatuses')}</option><option value="unpaid">{t('weaving.operationalReports.unpaid')}</option><option value="partial">{t('weaving.operationalReports.partial')}</option><option value="paid">{t('weaving.operationalReports.paid')}</option></Select>}
      {kind === 'production' && <Select label={t('weaving.operationalReports.groupBy')} value={params.groupBy} onChange={(value) => patch('groupBy', value)}>{['date', 'loom', 'quality', 'contract'].map((value) => <option key={value} value={value}>{t(`weaving.operationalReports.group.${value}`)}</option>)}</Select>}
    </div>
  );
}
