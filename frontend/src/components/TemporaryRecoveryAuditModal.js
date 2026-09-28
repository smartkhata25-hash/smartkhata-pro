import React, { useState } from 'react';
import { getTemporaryRecoveryAudit } from '../services/purchaseInvoiceService';

const TemporaryRecoveryAuditModal = ({ onClose }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const runAudit = async () => {
    setLoading(true); setError('');
    try { setReport(await getTemporaryRecoveryAudit()); }
    catch (err) {
      const status = err?.response?.status;
      setError(status === 401 ? 'Please sign in again.' : status === 403 ? 'Recovery Audit is available to the business owner only.' : err?.response?.data?.message || 'Recovery audit could not be completed.');
    } finally { setLoading(false); }
  };
  const rows = report?.records || [];
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Recovery Audit">
    <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold text-slate-900">Recovery Audit</h2><p className="text-xs text-slate-500">Temporary read-only Purchase Invoice recovery audit</p></div><button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">Close</button></header>
      <div className="space-y-4 p-4"><div className="flex items-center gap-3"><button type="button" onClick={runAudit} disabled={loading} className="rounded bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{loading ? 'Running…' : 'Run Audit'}</button>{report && <span className="text-sm"><b>Mode:</b> {report.mode} · <b>Candidate Count:</b> {report.candidateCount}</span>}</div>
      {error && <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {report && report.candidateCount === 0 && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">No affected Purchase Invoices found.</p>}
      {report && rows.length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-100"><tr>{['Invoice ID','Bill No','Original Supplier / Party','Soft-deleted journals','Missing inventory','Recovery status','Ambiguity / reason'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.invoiceId} className="border-t align-top"><td className="p-2 font-mono">{row.invoiceId}</td><td className="p-2">{row.billNo || '-'}</td><td className="p-2">{row.originalEntity?.type}: {row.originalEntity?.name || row.originalEntity?.id || '-'}</td><td className="p-2">{row.softDeletedJournals?.length || 0}</td><td className="p-2">{row.missingInventoryTransactions || 0}</td><td className="p-2 font-semibold">{row.recoveryCandidateStatus}</td><td className="p-2">{row.ambiguity || '-'}</td></tr>)}</tbody></table></div>}</div>
    </div>
  </div>;
};
export default TemporaryRecoveryAuditModal;
