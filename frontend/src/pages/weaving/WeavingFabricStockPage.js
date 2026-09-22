import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaExchangeAlt, FaHistory, FaSpinner, FaWarehouse } from 'react-icons/fa';
import { FabricTransferModal, StockHistoryModal } from '../../components/weaving/StockControlModals';
import { t } from '../../i18n/i18n';
import { getFabricStock } from '../../services/weavingFoldingService';
import { getStockControlHistory, getStockControlMeta } from '../../services/weavingStockControlService';
import { hasPermission } from '../../utils/permissionHelper';

const number = (value) => Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 });
const action = 'inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-bold';

export default function WeavingFabricStockPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ rows: [], totals: {} });
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState('');
  const [meta, setMeta] = useState({ qualities: [], godowns: [] });
  const [history, setHistory] = useState([]);
  const canTransfer = hasPermission('weaving.fabric_stock.transfer');
  const canReverse = hasPermission('weaving.stock_adjustment.reverse');
  const selectedQualityId = params.get('fabricQualityId') || '';
  const load = useCallback(async () => { setLoading(true); try { setData(await getFabricStock({ grade })); } finally { setLoading(false); } }, [grade]);
  useEffect(() => { load(); }, [load]);
  const openTransfer = useCallback(async () => { setMeta(await getStockControlMeta()); setModal('transfer'); }, []);
  const openHistory = async () => { setHistory(await getStockControlHistory('fabric')); setModal('history'); };
  const closeAction = useCallback(() => { setModal(''); if (params.has('action')) { const next = new URLSearchParams(params); next.delete('action'); setParams(next, { replace: true }); } }, [params, setParams]);
  useEffect(() => { if (params.get('action') === 'transfer' && canTransfer) openTransfer(); }, [canTransfer, openTransfer, params]);
  const completed = async () => { closeAction(); await load(); };
  const historyChanged = async () => { setHistory(await getStockControlHistory('fabric')); await load(); };

  return <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-3 sm:p-5"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="flex flex-wrap items-center gap-3"><div className="mr-auto"><h1 className="text-2xl font-black">{t('weaving.fabricStock.title')}</h1><p className="text-sm text-slate-500">{t('weaving.fabricStock.subtitle')}</p></div>{canTransfer && <button type="button" onClick={openTransfer} className={`${action} bg-indigo-700 text-white hover:bg-indigo-800`}><FaExchangeAlt />{t('weaving.stock.transferFabric')}</button>}<button type="button" onClick={openHistory} className={`${action} border bg-white text-slate-700 hover:bg-slate-50`}><FaHistory />{t('weaving.stock.history')}</button><FaWarehouse className="text-2xl text-indigo-700" /></header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['than','Than'],['meter','Meter'],['kg','KG'],['lbs','LBS']].map(([field, unit]) => <div key={field} className="rounded-lg border bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">{t(`weaving.fabricStock.${field}`)}</div><div className="mt-1 text-2xl font-black">{number(data.totals?.[field])} {unit}</div></div>)}</div>
    <section className="rounded-lg border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">{selectedQualityId && <button type="button" onClick={() => { const next = new URLSearchParams(params); next.delete('fabricQualityId'); setParams(next, { replace: true }); }} className="h-9 rounded-md border px-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50">Show all qualities</button>}<select className="h-10 rounded-md border px-3 text-sm" value={grade} onChange={(event) => setGrade(event.target.value)}><option value="">{t('weaving.fabricStock.allGrades')}</option><option value="a">A Grade / Normal</option><option value="b">B Grade</option><option value="rejected">{t('weaving.sales.rejected')}</option><option value="cut_piece">{t('weaving.sales.cutPiece')}</option><option value="waste">{t('weaving.sales.waste')}</option></select></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-900 text-left text-xs uppercase text-white"><tr><th className="p-3">{t('weaving.fabricStock.quality')}</th><th className="p-3">{t('weaving.fabricStock.count')}</th><th className="p-3">{t('weaving.fabricStock.width')}</th><th className="p-3">{t('weaving.fabricStock.grade')}</th><th className="p-3">{t('weaving.stock.ownership')}</th><th className="p-3">{t('weaving.fabricStock.godown')}</th><th className="p-3 text-right">{t('weaving.fabricStock.than')}</th><th className="p-3 text-right">{t('weaving.fabricStock.meter')}</th><th className="p-3 text-right">KG</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan="9" className="p-10"><FaSpinner className="mx-auto animate-spin" /></td></tr> : data.rows.filter((row) => Math.abs(Number(row.meter || 0)) > 0.000001 && (!selectedQualityId || String(row.fabricQualityId) === selectedQualityId)).map((row, index) => <tr key={`${row.fabricQualityId}-${row.godownId}-${row.grade}-${row.ownershipType}-${index}`}><td className="p-3 font-bold">{row.quality?.name}</td><td className="p-3">{[row.quality?.warpCount, row.quality?.weftCount].filter(Boolean).join(' / ') || '-'}</td><td className="p-3">{row.quality?.width || '-'}</td><td className="p-3 uppercase">{String(row.grade).replace('_', ' ')}</td><td className="p-3 uppercase">{row.ownershipType === 'party' ? t('weaving.stock.partyOwned') : t('weaving.stock.own')}</td><td className="p-3">{row.godownName}</td><td className="p-3 text-right font-bold">{number(row.than)}</td><td className="p-3 text-right font-bold">{number(row.meter)}</td><td className="p-3 text-right font-bold">{number(row.kg)}</td></tr>)}</tbody></table></div></section>
  </div>{modal === 'transfer' && <FabricTransferModal rows={data.rows} meta={meta} onClose={closeAction} onDone={completed} />}{modal === 'history' && <StockHistoryModal rows={history} canReverse={canReverse} onClose={closeAction} onChanged={historyChanged} />}</div>;
}
