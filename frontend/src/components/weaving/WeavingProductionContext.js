import React from 'react';
import { t } from '../../i18n/i18n';

export const contractIsOpen = (contract) => contract.status === 'active' &&
  (!contract.expiryDate || contract.expiryDate >= new Date().toISOString().slice(0, 10));

export const contextForRun = (run) => ({
  contractId: run?.contract?._id || '',
  contractNo: run?.contract?.contractNo || '',
  contractType: run?.contract?.contractType || '',
  customerPartyId: run?.contract?.partyId || run?.customerPartyId || '',
  customerName: run?.contract?.partyName || run?.customerName || '',
  fabricQualityId: run?.quality?._id || '',
  qualityName: run?.quality?.name || '',
  ownershipType: run?.ownershipType || '',
  ownerPartyId: run?.ownerPartyId || '',
  ownerName: run?.ownerParty?.name || '',
});

export const getOperationalProgress = (contract) => {
  const p = contract.progress || {};
  const targetMeter = contract.unit === 'Yard' ? Number(contract.quantity) * 0.9144 : contract.unit === 'Meter' ? Number(contract.quantity) : null;
  const supplied = Number(p.grossProducedMeter || 0) + Number(p.externalPurchasedMeter || 0);
  return { targetMeter, supplied, gap: targetMeter === null ? null : Math.max(0, targetMeter - supplied) };
};

export const ContractProgress = ({ contract, currentQuantity = 0, operational = false }) => {
  if (!contract?.progress) return null;
  const p = contract.progress;
  const { targetMeter, supplied, gap } = getOperationalProgress(contract);
  const format = (value) => Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 });
  return <div className="col-span-full flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
    <span>{t('weaving.production.target')}: <strong>{operational && targetMeter !== null ? format(targetMeter) + ' M' : contract.quantity + ' ' + contract.unit}</strong></span>
    {contract.type === 'purchase' ? <>
      <span>{t('weaving.production.purchased')}: <strong>{p.purchasedQuantity} {contract.unit}</strong></span>
      <span>{t('weaving.production.remaining')}: <strong>{p.remainingQuantity} {contract.unit}</strong></span>
      {Number(currentQuantity) > 0 && <span>{t('weaving.production.current')}: <strong>{currentQuantity} {contract.unit}</strong></span>}
      <strong className={p.targetReached ? 'text-emerald-700' : ''}>{t(p.targetReached ? 'weaving.production.targetReached' : 'weaving.production.open')}</strong>
    </> : <>
      <span>{t(operational ? 'weaving.fabricStock.grossProduced' : 'weaving.production.produced')}: <strong>{p.grossProducedMeter} M</strong></span>
      <span>A: {p.goodMeter} M / B: {p.bGradeMeter} M / {t('weaving.production.rejected')}: {p.rejectedMeter} M</span>
      {(!operational || contract.contractType === 'fabric_sale') && <span>{t('weaving.production.externalSupply')}: {p.externalPurchasedMeter} M</span>}
      {operational && <><span>{t('weaving.fabricStock.operationalSupplied')}: <strong>{format(supplied)} M</strong></span><span>{t('weaving.fabricStock.operationalGap')}: <strong>{gap === null ? '-' : format(gap) + ' M'}</strong></span></>}
    </>}
  </div>;
};

export default function WeavingProductionContext({ context, fabrics = [], parties = [], children }) {
  if (!context) return null;
  const quality = context.qualityName || fabrics.find((row) => String(row._id) === String(context.fabricQualityId))?.name;
  const party = context.customerName || context.ownerName || parties.find((row) => String(row._id) === String(context.customerPartyId || context.ownerPartyId))?.name;
  const values = [
    [t('weaving.production.contract'), context.contractNo || '-'],
    [t('weaving.sales.contractType'), context.contractType ? t(context.contractType === 'conversion' ? 'weaving.sales.conversion' : 'weaving.sales.fabricSale') : '-'],
    [t('weaving.production.customer'), party || '-'],
    [t('weaving.folding.quality'), quality || '-'],
    [t('weaving.production.ownership'), context.ownershipType ? t(context.ownershipType === 'own' ? 'weaving.production.own' : 'weaving.production.partyOwned') : '-'],
  ];
  if (context.contractQuantity != null) values.push([t('weaving.production.target'), `${context.contractQuantity} ${context.contractUnit}`]);
  return <div className="col-span-full flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-teal-100 bg-teal-50/60 px-3 py-2 text-xs">
    {values.map(([label, value]) => <div key={label}><span className="text-slate-500">{label}: </span><strong className="text-slate-800">{value}</strong></div>)}
    {children}
  </div>;
}
