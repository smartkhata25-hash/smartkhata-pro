import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaCalendarAlt, FaDownload, FaEdit, FaExternalLinkAlt, FaFilter, FaPlus, FaPlusCircle, FaPrint, FaReceipt, FaSearch, FaShareAlt, FaTimes, FaTrash, FaUndo, FaWhatsapp } from 'react-icons/fa';

import CommitteePlanForm, { emptyCommittee, validateCommittee } from '../../components/installments/members/CommitteePlanForm';
import MemberFormModal from '../../components/installments/members/MemberFormModal';
import InstallmentsDialog from '../../components/installments/InstallmentsDialog';
import { getCurrentLanguage, t } from '../../i18n/i18n';
import { getInstallmentsCommitteeDetail } from '../../services/installmentsCommitteeService';
import { archiveInstallmentsMember, createInstallmentsCommittee, getInstallmentsMember, getInstallmentsMemberFinancialSummary, getInstallmentsMemberLedger, getInstallmentsMembers, restoreInstallmentsMember, updateInstallmentsCommittee } from '../../services/installmentsMemberService';
import { fetchWhatsAppTemplate } from '../../services/whatsAppTemplateService';
import { applyReminderTemplate, generateWhatsAppLink, isValidPhone } from '../../utils/whatsapp';
import { hasPermission } from '../../utils/permissionHelper';
import { formatInstallmentsDisplayRef } from '../../utils/installmentsDisplay';
import { formatInstallmentsMoney, stripInstallmentsCurrencyPrefix } from '../../utils/installmentsMoney';
import { canRenderInstallmentsMemberPdfText, createInstallmentsMemberLedgerPdf, downloadInstallmentsMemberLedgerPdf } from '../../utils/installmentsMemberLedgerPdf';
import { sharePdfDocument } from '../../utils/documentShare';

const money = (value) => formatInstallmentsMoney(value, { absolute: true });
const ledgerBalanceMoney = (value) => formatInstallmentsMoney(value);
const shortLedgerDate = (value) => {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return match ? `${match[1]}/${match[2]}` : value || '—';
};
const balanceLabel = (value) => Number(value) < 0 ? t('installments.members.creditBalance') : t('installments.members.receivableBalance');
const tone = (value) => Number(value) > 0 ? 'receivable' : Number(value) < 0 ? 'payable' : 'zero';
const toneText = (value) => tone(value) === 'receivable' ? 'text-emerald-700' : tone(value) === 'payable' ? 'text-rose-700' : 'text-slate-500';
const balanceValue = (value) => `${tone(value) === 'zero' ? t('installments.members.settledBalance') : balanceLabel(value)} · ${money(value)}`;
const shortRef = (value) => formatInstallmentsDisplayRef(value, 'record');

const InstallmentsMembersPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem('installmentsSelectedMember') || '');
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [committeeModal, setCommitteeModal] = useState(null);
  const [committeeForm, setCommitteeForm] = useState(emptyCommittee());
  const [ledgerDates, setLedgerDates] = useState({ startDate: '', endDate: '' });
  const [notice, setNotice] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareBusy, setShareBusy] = useState('');
  const [preparedShare, setPreparedShare] = useState(null);
  const [businessName, setBusinessName] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').businessName || ''; } catch (_) { return ''; }
  });

  const permissions = {
    canCreate: hasPermission('installments.members.create'), canEdit: hasPermission('installments.members.edit'),
    canDelete: hasPermission('installments.members.delete'), canRestore: hasPermission('installments.members.restore'),
    canLedger: hasPermission('installments.members.view_ledger'),
    canPaymentHistory: hasPermission('installments.payments.view_history'),
    canViewCommittee: hasPermission('installments.committees.view') || hasPermission('installments.committees.schedule.view') || hasPermission('installments.committees.manage'),
    canCreateCommittee: hasPermission('installments.committees.create') || hasPermission('installments.committees.manage'),
    canEditCommittee: hasPermission('installments.committees.edit') || hasPermission('installments.committees.manage'),
    canOpening: hasPermission('installments.opening_balances.manage'),
  };

  const loadMembers = useCallback(async () => {
    try { setLoading(true); setNotice(''); setMembers(await getInstallmentsMembers({ search, status })); }
    catch (error) { setNotice(error.response?.data?.message || t('installments.members.errors.load')); }
    finally { setLoading(false); }
  }, [search, status]);
  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    try { setDetailLoading(true); setDetail(await getInstallmentsMember(id, ledgerDates)); sessionStorage.setItem('installmentsSelectedMember', id); }
    catch (error) { setNotice(error.response?.data?.message || t('installments.members.errors.detail')); }
    finally { setDetailLoading(false); }
  }, [ledgerDates]);
  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => { setPreparedShare(null); }, [shareTarget]);
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');
    fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Profile unavailable')))
      .then((profile) => { if (active && profile?.businessName) setBusinessName(profile.businessName); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (searchParams.get('new') === '1' && permissions.canCreate) {
      setEditingMember(null); setFormOpen(true); searchParams.delete('new'); setSearchParams(searchParams, { replace: true });
    }
    const requestedMemberId = searchParams.get('memberId');
    if (requestedMemberId && requestedMemberId !== selectedId) setSelectedId(requestedMemberId);
  }, [searchParams, setSearchParams, permissions.canCreate, selectedId]);

  const visibleMembers = useMemo(() => members.filter((member) => {
    const balance = Number(member.balance || 0);
    return balanceFilter === 'receivable' ? balance > 0 : balanceFilter === 'payable' ? balance < 0 : balanceFilter === 'zero' ? Math.abs(balance) < 0.005 : true;
  }).sort((a, b) => sort === 'balance' ? Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0)) : String(a.fullName || '').localeCompare(String(b.fullName || ''), getCurrentLanguage() === 'ur' ? 'ur' : 'en')), [members, balanceFilter, sort]);

  const refresh = async () => { await loadMembers(); if (selectedId) await loadDetail(selectedId); };
  const clearFilters = () => { setSearch(''); setStatus('active'); setBalanceFilter('all'); setSort('name'); setFiltersOpen(false); };
  const editMember = (member) => { setEditingMember(member); setFormOpen(true); };
  const restoreMember = async (member) => {
    try { await restoreInstallmentsMember(member._id); setNotice(t('installments.members.restoredSuccess')); if (selectedId === member._id) { setSelectedId(''); setDetail(null); } await loadMembers(); }
    catch (error) { setNotice(error.response?.data?.message || t('installments.members.errors.restore')); }
  };
  const archiveMember = async (member) => {
    try {
      const summary = await getInstallmentsMemberFinancialSummary(member._id);
      if (!summary.canArchive) {
        const parts = [];
        if (Math.abs(Number(summary.closingBalance || 0)) >= 0.005) parts.push(`${balanceLabel(summary.closingBalance)} ${money(summary.closingBalance)}`);
        if (summary.unresolvedCommitteeCount) parts.push(`${t('installments.members.unresolvedPlans')}: ${summary.unresolvedCommitteeCount}`);
        setNotice(`${t('installments.members.unsettledBlocked')} ${parts.join(' · ')}`); return;
      }
      setArchiveTarget(member);
    } catch (error) { setNotice(error.response?.data?.message || t('installments.members.errors.archive')); }
  };
  const statementDatesFor = (member) => member?._id === selectedId ? ledgerDates : { startDate: '', endDate: '' };
  const loadAuthoritativeStatement = (member, dates = {}) => getInstallmentsMemberLedger(member._id, {
    startDate: dates.startDate || undefined,
    endDate: dates.endDate || undefined,
  });
  const buildBalanceMessage = async (member, balance) => {
    const template = await fetchWhatsAppTemplate('installments');
    const raw = getCurrentLanguage() === 'ur' ? template.urduTemplate : template.englishTemplate;
    const type = Number(balance) > 0 ? t('installments.members.receivableBalance') : Number(balance) < 0 ? t('installments.members.creditBalance') : t('installments.members.zeroBalance');
    const formattedBalance = formatInstallmentsMoney(balance, { absolute: true });
    const hasBalance = /{{\s*balance\s*}}/i.test(raw);
    const hasType = /{{\s*balanceType\s*}}/i.test(raw);
    const hasBusiness = /{{\s*businessName\s*}}/i.test(raw);
    const hasName = /{{\s*name\s*}}/i.test(raw);
    let message = applyReminderTemplate(String(raw || '').replace(/{{\s*balanceType\s*}}/gi, type), {
      name: member.fullName,
      balance: formattedBalance,
      businessName,
    });
    if (!hasName) message = `${t('installments.members.dear')} ${member.fullName},\n\n${message}`;
    if (!hasBalance) message += `\n\n${t('installments.members.currentBalance')}: ${formattedBalance}`;
    if (!hasType) message += `\n${t('installments.members.balanceType')}: ${type}`;
    if (!hasBusiness) message += `\n${t('installments.members.business')}: ${businessName}`;
    return stripInstallmentsCurrencyPrefix(message).trim();
  };
  const sendBalanceMessage = async (member) => {
    if (!permissions.canLedger) { setNotice(t('installments.members.ledgerPermissionRequired')); return; }
    if (!member || !isValidPhone(member.mobile)) { setNotice(t('installments.members.invalidPhone')); return; }
    if (!businessName) { setNotice(t('installments.members.businessUnavailable')); return; }
    const reservedWindow = window.open('', '_blank');
    if (reservedWindow) reservedWindow.opener = null;
    try {
      setShareBusy('message');
      const statement = await loadAuthoritativeStatement(member);
      const message = await buildBalanceMessage(statement.member || member, statement.closingBalance);
      const link = generateWhatsAppLink(member.mobile, message);
      if (!link) throw new Error(t('installments.members.invalidPhone'));
      if (reservedWindow && !reservedWindow.closed) reservedWindow.location.href = link;
      else window.location.href = link;
      setShareTarget(null);
    } catch (error) {
      if (reservedWindow && !reservedWindow.closed) reservedWindow.close();
      setNotice(error.response?.data?.message || error.message || t('installments.members.errors.whatsapp'));
    }
    finally { setShareBusy(''); }
  };
  const createLedgerDocument = async (member, dates) => {
    if (!permissions.canLedger) throw new Error(t('installments.members.ledgerPermissionRequired'));
    if (!businessName) throw new Error(t('installments.members.businessUnavailable'));
    if (getCurrentLanguage() === 'ur' || !canRenderInstallmentsMemberPdfText(member.fullName, businessName)) {
      const error = new Error(t('installments.members.pdfUrduFallback'));
      error.code = 'PDF_FONT_UNSUPPORTED';
      throw error;
    }
    const statement = await loadAuthoritativeStatement(member, dates);
    return {
      statement,
      document: createInstallmentsMemberLedgerPdf({
        statement,
        businessName,
        fromDate: dates.startDate,
        toDate: dates.endDate,
      }),
    };
  };
  const downloadLedgerPdf = async (member) => {
    try {
      setShareBusy('download');
      const { document } = await createLedgerDocument(member, statementDatesFor(member));
      downloadInstallmentsMemberLedgerPdf(document);
      setShareTarget(null);
    } catch (error) { setNotice(error.message || t('installments.members.errors.pdf')); }
    finally { setShareBusy(''); }
  };
  const shareLedgerPdf = async (member) => {
    if (!isValidPhone(member?.mobile)) { setNotice(t('installments.members.invalidPhone')); return; }
    try {
      setShareBusy('share');
      const dates = statementDatesFor(member);
      const [{ document, statement }, current] = await Promise.all([
        createLedgerDocument(member, dates),
        dates.startDate || dates.endDate ? loadAuthoritativeStatement(member) : Promise.resolve(null),
      ]);
      const currentStatement = current || statement;
      const message = await buildBalanceMessage(currentStatement.member || member, currentStatement.closingBalance);
      const whatsappLink = generateWhatsAppLink(member.mobile, message);
      setPreparedShare({ memberId: member._id, document, message, whatsappLink });
    } catch (error) { setNotice(error.message || t('installments.members.errors.pdf')); }
    finally { setShareBusy(''); }
  };
  const commitLedgerPdfShare = async () => {
    if (!preparedShare || preparedShare.memberId !== shareTarget?._id) return;
    try {
      setShareBusy('share');
      const result = await sharePdfDocument({
        pdfBlob: preparedShare.document.blob,
        fileName: preparedShare.document.fileName,
        title: preparedShare.document.fileName,
        text: preparedShare.message,
        fallbackTextUrl: preparedShare.whatsappLink,
        openFallbackText: true,
      });
      setShareTarget(null);
      setPreparedShare(null);
      if (result.downloaded) setNotice(t('installments.members.shareFallback'));
    } catch (error) { setNotice(error.message || t('installments.members.errors.pdf')); }
    finally { setShareBusy(''); }
  };
  const saveCommittee = async () => {
    const errors = validateCommittee(committeeForm); if (Object.keys(errors).length) { setNotice(Object.values(errors).join('\n')); return; }
    try { if (committeeModal?._id) await updateInstallmentsCommittee(detail.member._id, committeeModal._id, committeeForm); else await createInstallmentsCommittee(detail.member._id, committeeForm); setCommitteeModal(null); await refresh(); }
    catch (error) { setNotice(error.response?.data?.message || t('installments.members.errors.committee')); }
  };

  return <main className="min-h-full overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/40 p-2 sm:p-3">
    <style>{`@media print{body *{visibility:hidden}.installments-print,.installments-print *{visibility:visible}.installments-print{position:absolute;inset:0;width:100%;background:white;padding:20px}.print-hide,.member-ledger-mobile{display:none!important}.member-ledger-table{display:block!important}}`}</style>
    <InstallmentsDialog open={Boolean(notice)} type="warning" message={notice} onClose={() => setNotice('')} onConfirm={() => setNotice('')} />
    <InstallmentsDialog open={Boolean(archiveTarget)} type="warning" message={t('installments.members.confirmArchive')} cancelLabel={t('cancel')} confirmLabel={t('delete')} onClose={() => setArchiveTarget(null)} onConfirm={async () => { const member = archiveTarget; setArchiveTarget(null); try { await archiveInstallmentsMember(member._id); setNotice(t('installments.members.archivedSuccess')); if (selectedId === member._id) { setSelectedId(''); setDetail(null); } await loadMembers(); } catch (error) { setNotice(error.response?.data?.message || t('installments.members.errors.archive')); } }} />
    <MemberShareMenu
      member={shareTarget}
      busy={shareBusy}
      canLedger={permissions.canLedger}
      shareReady={preparedShare?.memberId === shareTarget?._id}
      onClose={() => { if (!shareBusy) { setShareTarget(null); setPreparedShare(null); } }}
      onMessage={() => sendBalanceMessage(shareTarget)}
      onDownload={() => downloadLedgerPdf(shareTarget)}
      onShare={() => preparedShare?.memberId === shareTarget?._id ? commitLedgerPdfShare() : shareLedgerPdf(shareTarget)}
    />
    <div className="mx-auto flex h-[calc(100vh-80px)] max-w-[1600px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full flex-col border-e border-slate-200 md:w-[340px] md:flex-shrink-0`}>
        <div className="relative border-b border-slate-200 p-2.5">
          <div className="flex h-9 items-center justify-between"><h1 className="text-base font-black">{t('installments.members.membersLabel')}</h1><div className="flex gap-1.5">{permissions.canCreate && <Icon icon={FaPlus} label={t('installments.members.add')} primary onClick={() => { setEditingMember(null); setFormOpen(true); }} />}<Icon icon={FaFilter} label={t('installments.members.filters')} active={filtersOpen || balanceFilter !== 'all' || sort !== 'name'} onClick={() => setFiltersOpen((value) => !value)} /></div></div>
          <div className="mt-2 flex gap-1"><label className="relative min-w-0 flex-1"><FaSearch className="absolute start-2.5 top-2.5 text-xs text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('installments.members.search')} className="h-9 w-full rounded-lg border border-slate-300 ps-8 pe-2 text-xs" /></label><Status label={t('installments.members.activeShort')} selected={status === 'active'} onClick={() => setStatus('active')} /><Status label={t('installments.members.hiddenShort')} selected={status === 'archived'} onClick={() => setStatus('archived')} /><Icon icon={FaTimes} label={t('installments.members.clearFilters')} onClick={clearFilters} /></div>
          {filtersOpen && <div className="absolute end-2.5 top-12 z-30 w-64 rounded-xl border bg-white p-3 shadow-xl"><Select label={t('installments.members.balanceFilter')} value={balanceFilter} onChange={setBalanceFilter} options={[['all', t('installments.members.balanceAll')], ['receivable', t('installments.members.receivableOnly')], ['payable', t('installments.members.payableOnly')], ['zero', t('installments.members.settledOnly')]]} /><Select label={t('installments.members.sort')} value={sort} onChange={setSort} options={[['name', t('installments.members.sortName')], ['balance', t('installments.members.sortBalance')]]} /></div>}
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">{loading ? <State text={t('installments.members.loading')} /> : visibleMembers.length === 0 ? <State text={t('installments.members.empty')} /> : visibleMembers.map((member) => <div key={member._id} role="button" tabIndex={0} onClick={() => { setSelectedId(member._id); setDetail(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(member._id); setDetail(null); } }} className={`mb-1.5 w-full cursor-pointer rounded-lg border px-2.5 py-2 text-start focus:outline-none focus:ring-2 focus:ring-indigo-300 ${selectedId === member._id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><span className="flex justify-between gap-2"><span className="min-w-0"><strong className="block truncate text-sm">{member.fullName}</strong><span className="text-[11px] text-slate-500">{member.mobile || '—'} · #{shortRef(member.memberNumber)}</span></span>{permissions.canLedger && <strong className={`flex-none text-xs ${toneText(member.balance)}`} title={balanceLabel(member.balance)}>{tone(member.balance) === 'receivable' ? 'RCV ' : tone(member.balance) === 'payable' ? 'PAY ' : ''}{money(member.balance)}</strong>}</span><span className="mt-1 flex justify-end gap-1 border-t border-slate-100 pt-1"><RowIcon icon={FaWhatsapp} label={t('installments.members.whatsappActions')} green onClick={(event) => { event.stopPropagation(); setShareTarget(member); }} />{permissions.canPaymentHistory && <RowIcon icon={FaReceipt} label={t('installments.nav.memberReceipts')} onClick={() => navigate(`/installments/payments/history?type=receipts&memberId=${member._id}`)} />}{permissions.canEdit && !member.isArchived && <RowIcon icon={FaEdit} label={t('edit')} onClick={(event) => { event.stopPropagation(); editMember(member); }} />}{permissions.canDelete && !member.isArchived && <RowIcon icon={FaTrash} label={t('delete')} danger onClick={(event) => { event.stopPropagation(); archiveMember(member); }} />}{permissions.canRestore && member.isArchived && <RowIcon icon={FaUndo} label={t('installments.members.restore')} onClick={(event) => { event.stopPropagation(); restoreMember(member); }} />}</span></div>)}</div>
      </aside>
      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} relative min-w-0 flex-1 flex-col`}>{!selectedId ? <State large text={t('installments.members.selectPrompt')} /> : !detail ? <State large text={t('installments.members.loadingDetail')} /> : <><MemberDetail detail={detail} ledgerDates={ledgerDates} setLedgerDates={setLedgerDates} onBack={() => { setSelectedId(''); setDetail(null); }} onEdit={() => editMember(detail.member)} onArchive={() => archiveMember(detail.member)} onRestore={() => restoreMember(detail.member)} onWhatsApp={() => setShareTarget(detail.member)} onReceipts={() => navigate(`/installments/payments/history?type=receipts&memberId=${detail.member._id}`)} onAddCommittee={() => { setCommitteeForm(emptyCommittee()); setCommitteeModal({}); }} onViewCommittee={(committeeId) => navigate(`/installments/committees?committeeId=${committeeId}`)} permissions={permissions} />{detailLoading && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-indigo-500" aria-hidden="true" />}</>}</section>
    </div>
    <MemberFormModal open={formOpen} member={editingMember} onClose={() => setFormOpen(false)} canManageOpening={permissions.canOpening} canManageCommittees={permissions.canCreateCommittee} onSaved={(saved, meta = {}) => { setFormOpen(false); setSelectedId(saved._id); setNotice(editingMember ? t('installments.members.updatedSuccess') : meta.committeeCreated ? t('installments.members.createdWithCommitteeSuccess') : t('installments.members.createdSuccess')); refresh(); }} />
    {committeeModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-2"><div className="max-h-[96vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"><div className="mb-3 flex justify-between"><h2 className="font-black">{t(committeeModal._id ? 'installments.committees.edit' : 'installments.committees.add')}</h2><button onClick={() => setCommitteeModal(null)}>×</button></div><CommitteePlanForm value={committeeForm} onChange={setCommitteeForm} showStatus={Boolean(committeeModal._id)} /><div className="mt-4 flex justify-end gap-2"><button onClick={() => setCommitteeModal(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('cancel')}</button><button onClick={saveCommittee} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">{t('common.saveChanges')}</button></div></div></div>}
  </main>;
};

const MemberShareMenu = ({ member, busy, canLedger, shareReady, onClose, onMessage, onDownload, onShare }) => {
  if (!member) return null;
  const validPhone = isValidPhone(member.mobile);
  const disabled = Boolean(busy);
  const actionClass = 'flex h-11 w-full items-center gap-3 rounded-lg border px-3 text-start text-sm font-bold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45';
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" aria-label={t('installments.members.whatsappActions')} className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-black">{t('installments.members.whatsappActions')}</h2><p className="truncate text-xs font-semibold text-slate-500">{member.fullName} · {member.mobile || t('installments.members.noPhone')}</p></div><button type="button" disabled={disabled} onClick={onClose} aria-label={t('cancel')} className="grid h-8 w-8 flex-none place-items-center rounded-lg border text-slate-500 disabled:opacity-40"><FaTimes /></button></div>
      <div className="space-y-2">
        <button type="button" disabled={disabled || !canLedger || !validPhone} onClick={onMessage} className={`${actionClass} border-emerald-200 text-emerald-700`}><FaWhatsapp className="flex-none" /><span>{busy === 'message' ? t('installments.members.preparing') : t('installments.members.sendBalanceMessage')}</span></button>
        <button type="button" disabled={disabled || !canLedger} onClick={onDownload} className={`${actionClass} border-indigo-200 text-indigo-700`}><FaDownload className="flex-none" /><span>{busy === 'download' ? t('installments.members.preparing') : t('installments.members.downloadLedgerPdf')}</span></button>
        <button type="button" disabled={disabled || !canLedger || !validPhone} onClick={onShare} className={`${actionClass} border-cyan-200 text-cyan-700`}><FaShareAlt className="flex-none" /><span>{busy === 'share' ? t('installments.members.preparing') : shareReady ? t('installments.members.sharePreparedPdf') : t('installments.members.shareLedgerPdf')}</span></button>
      </div>
      {!validPhone && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">{t('installments.members.invalidPhone')}</p>}
      {!canLedger && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">{t('installments.members.ledgerPermissionRequired')}</p>}
      <p className="mt-3 text-[11px] leading-4 text-slate-500">{t('installments.members.shareHelp')}</p>
    </div>
  </div>;
};

const MemberDetail = ({ detail, ledgerDates, setLedgerDates, onBack, onEdit, onArchive, onRestore, onWhatsApp, onReceipts, onAddCommittee, onViewCommittee, permissions }) => {
  const { member, committees = [], ledger = [], closingBalance = 0 } = detail;
  const [selectedCommitteeId, setSelectedCommitteeId] = useState('');
  const [statement, setStatement] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');
  const selectedCommittee = committees.find((committee) => committee._id === selectedCommitteeId);

  useEffect(() => { setSelectedCommitteeId(''); setStatement(null); setStatementError(''); }, [member._id]);
  useEffect(() => {
    let active = true;
    if (!selectedCommitteeId) { setStatement(null); setStatementError(''); return () => { active = false; }; }
    setStatementLoading(true); setStatementError('');
    getInstallmentsCommitteeDetail(selectedCommitteeId, { page: 1, limit: 100, fromDate: ledgerDates.startDate || undefined, toDate: ledgerDates.endDate || undefined })
      .then((data) => { if (active) setStatement(data); })
      .catch((error) => { if (active) { setStatement(null); setStatementError(error.response?.data?.message || t('installments.members.committeeStatementError')); } })
      .finally(() => { if (active) setStatementLoading(false); });
    return () => { active = false; };
  }, [selectedCommitteeId, ledgerDates.startDate, ledgerDates.endDate]);

  return <div className="installments-print flex min-h-0 flex-1 flex-col overflow-y-auto">
    <header className="sticky top-0 z-20 border-b bg-white/95 px-3 py-2 backdrop-blur"><div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <button onClick={onBack} aria-label={t('common.back')} className="print-hide grid h-9 w-9 flex-none place-items-center rounded-lg border md:hidden"><FaArrowLeft /></button>
      <div className="min-w-[150px] flex-1"><h2 className="truncate text-base font-black uppercase sm:text-lg">{member.fullName}</h2><p className="truncate text-[11px] font-semibold text-slate-500">{t('installments.members.registrationDate')}: {member.joiningDate || '—'}</p></div>
      {permissions.canLedger && <div className="print-hide flex items-center gap-1"><CalendarDate label={t('installments.members.fromDate')} value={ledgerDates.startDate} max={ledgerDates.endDate} onChange={(value) => setLedgerDates((current) => ({ ...current, startDate: value }))} /><CalendarDate label={t('installments.members.toDate')} value={ledgerDates.endDate} min={ledgerDates.startDate} onChange={(value) => setLedgerDates((current) => ({ ...current, endDate: value }))} />{(ledgerDates.startDate || ledgerDates.endDate) && <Icon icon={FaTimes} label={t('installments.members.clearDates')} onClick={() => setLedgerDates({ startDate: '', endDate: '' })} />}</div>}
      <div className="print-hide flex flex-wrap gap-1">{permissions.canEdit && !member.isArchived && <Icon icon={FaEdit} label={t('edit')} onClick={onEdit} />}<Icon icon={FaWhatsapp} label={t('installments.members.whatsappActions')} green onClick={onWhatsApp} />{permissions.canPaymentHistory && <Icon icon={FaReceipt} label={t('installments.nav.memberReceipts')} onClick={onReceipts} />}<Icon icon={FaPrint} label={t('installments.members.printPdf')} onClick={() => window.print()} />{permissions.canCreateCommittee && !member.isArchived && <Icon icon={FaPlusCircle} label={t('installments.committees.add')} primary onClick={onAddCommittee} />}{permissions.canDelete && !member.isArchived && <Icon icon={FaTrash} label={t('delete')} danger onClick={onArchive} />}{permissions.canRestore && member.isArchived && <Icon icon={FaUndo} label={t('installments.members.restore')} onClick={onRestore} />}</div>
    </div></header>
    <div className="space-y-2 p-2.5 sm:p-3">
      {permissions.canLedger && <div className="grid grid-cols-2 gap-1.5"><Mini label={t('installments.members.openingShort')} value={balanceValue(member.openingBalanceSigned)} tone={tone(member.openingBalanceSigned)} /><Mini label={t('installments.members.closingShort')} value={balanceValue(closingBalance)} tone={tone(closingBalance)} /></div>}
      {permissions.canLedger && <section className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"><h3 className="text-sm font-black">{selectedCommittee ? `${t('installments.members.committeeStatement')} · #${formatInstallmentsDisplayRef(selectedCommittee.committeeNumber, 'committee')}` : t('installments.members.ledger')}</h3>{permissions.canViewCommittee && <div className="print-hide flex min-w-0 flex-1 flex-wrap justify-end gap-1.5"><select aria-label={t('installments.members.ledgerView')} value={selectedCommitteeId} onChange={(event) => setSelectedCommitteeId(event.target.value)} className="h-9 min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold"><option value="">{t('installments.members.allTransactions')}</option>{committees.map((committee) => <option key={committee._id} value={committee._id}>{t('installments.members.committeeStatement')} · #{formatInstallmentsDisplayRef(committee.committeeNumber, 'committee')}</option>)}</select>{selectedCommitteeId && <button type="button" onClick={() => onViewCommittee(selectedCommitteeId)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-indigo-200 px-2 text-xs font-bold text-indigo-700"><FaExternalLinkAlt /> {t('installments.members.viewCommitteeDetails')}</button>}</div>}</div>
        {!selectedCommitteeId ? <MemberLedger ledger={ledger} closingBalance={closingBalance} /> : statementLoading ? <State text={t('installments.members.committeeStatementLoading')} /> : statementError ? <State text={statementError} /> : <CommitteeStatement data={statement} />}
      </section>}
    </div>
  </div>;
};

const memberLedgerMovement = (entry) => {
  const debit = Number(entry.debit || 0); const credit = Number(entry.credit || 0);
  if (['customer_receipt', 'customer_advance'].includes(entry.sourceType)) return { moneyIn: credit, moneyOut: 0 };
  if (entry.sourceType === 'committee_savings_payout') return { moneyIn: 0, moneyOut: debit };
  if (entry.sourceType === 'payment_reversal') return { moneyIn: credit, moneyOut: debit };
  return { moneyIn: 0, moneyOut: 0 };
};

const MemberLedger = ({ ledger, closingBalance }) => {
  const navigate = useNavigate();
  const projectionAvailable = ledger.every((entry) => typeof entry.isOperationalEffective === 'boolean' && Number.isFinite(Number(entry.operationalRunningBalance)));
  const projectedClosingBalance = ledger.length ? Number(ledger[ledger.length - 1].operationalRunningBalance) : Number(closingBalance || 0);
  const operationalReconciled = projectionAvailable && Math.abs(projectedClosingBalance - Number(closingBalance || 0)) < 0.005;
  const operationalLedger = operationalReconciled ? ledger.filter((entry) => entry.isOperationalEffective !== false) : ledger;
  const canViewInvoices = hasPermission('installments.invoices.view');
  const reference = (entry) => {
    const value = formatInstallmentsDisplayRef(entry.referenceNumber, 'reference');
    const invoiceId = entry.invoiceId?._id || entry.invoiceId;
    return entry.sourceType === 'sale_invoice' && invoiceId && canViewInvoices
      ? <button type="button" onClick={() => navigate(`/installments/invoices/${invoiceId}`)} className="inline-flex items-center gap-1 font-black text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-900 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">{value}<FaExternalLinkAlt className="print-hide text-[9px]" aria-hidden="true" /></button>
      : <span className="font-bold text-slate-700">{value}</span>;
  };
  if (!operationalLedger.length) return <State text={t('installments.members.emptyLedger')} />;
  return <>{!operationalReconciled && <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{t('installments.members.reconciliationRequired')}</p>}<div className="member-ledger-table hidden overflow-x-auto md:block"><table className="w-full table-fixed text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="w-[14%] px-3 py-2 text-start">{t('date')}</th><th className="w-[26%] px-3 py-2 text-start">{t('installments.members.reference')}</th><th className="w-[20%] px-3 py-2 text-end">{t('installments.moneyIn')}</th><th className="w-[20%] px-3 py-2 text-end">{t('installments.moneyOut')}</th><th className="w-[20%] px-3 py-2 text-end">{t('balance')}</th></tr></thead><tbody>{operationalLedger.map((entry) => { const movement = memberLedgerMovement(entry); const balance = operationalReconciled ? (entry.operationalRunningBalance ?? entry.runningBalance) : entry.runningBalance; return <tr key={entry._id} className="border-t hover:bg-slate-50"><Cell>{shortLedgerDate(entry.entryDate)}</Cell><Cell>{reference(entry)}</Cell><Cell align="end" color="text-emerald-700">{movement.moneyIn ? money(movement.moneyIn) : '—'}</Cell><Cell align="end" color="text-rose-700">{movement.moneyOut ? money(movement.moneyOut) : '—'}</Cell><Cell align="end" color={toneText(balance)}>{ledgerBalanceMoney(balance)}</Cell></tr>; })}</tbody></table></div><div className="member-ledger-mobile space-y-1.5 p-2 md:hidden">{operationalLedger.map((entry) => { const movement = memberLedgerMovement(entry); const balance = operationalReconciled ? (entry.operationalRunningBalance ?? entry.runningBalance) : entry.runningBalance; return <article key={entry._id} className="rounded-lg border p-2.5 text-sm"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{reference(entry)}</span><small className="flex-none font-semibold text-slate-500">{shortLedgerDate(entry.entryDate)}</small></div><div className="mt-1.5 grid grid-cols-3 gap-1 text-end text-[10px]"><span>{t('installments.moneyIn')}<strong className="block text-xs text-emerald-700">{movement.moneyIn ? money(movement.moneyIn) : '—'}</strong></span><span>{t('installments.moneyOut')}<strong className="block text-xs text-rose-700">{movement.moneyOut ? money(movement.moneyOut) : '—'}</strong></span><span>{t('balance')}<strong className={`block text-xs ${toneText(balance)}`}>{ledgerBalanceMoney(balance)}</strong></span></div></article>; })}</div></>;
};

const CommitteeStatement = ({ data }) => {
  const rows = data?.schedule?.rows || [];
  const scheduled = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const received = rows.reduce((sum, row) => sum + Number(row.allocatedAmount || 0), 0);
  const remaining = rows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0);
  if (!data) return <State text={t('installments.members.committeeStatementError')} />;
  return <div><div className="grid grid-cols-3 gap-1.5 border-b bg-slate-50 p-2"><StatementMetric label={t('installments.members.scheduled')} value={scheduled} /><StatementMetric label={t('installments.members.received')} value={received} green /><StatementMetric label={t('installments.members.remaining')} value={remaining} /></div>{data.reconciliationRequired && <p className="m-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">{t('installments.members.reconciliationRequired')}</p>}{!rows.length ? <State text={t('installments.members.emptyCommitteeStatement')} /> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{[t('installments.members.dueDate'), t('installments.members.scheduled'), t('installments.members.received'), t('installments.members.remaining'), t('status')].map((label) => <th key={label} className="px-3 py-2 text-start">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.dueKey} className="border-t"><Cell>{row.dueDate}</Cell><Cell>{money(row.amount)}</Cell><Cell color="text-emerald-700">{money(row.allocatedAmount)}</Cell><Cell color="text-amber-700">{money(row.remainingAmount)}</Cell><Cell><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{t(`installments.committees.management.status.${row.paymentStatus}`)}</span></Cell></tr>)}</tbody></table></div><div className="space-y-1.5 p-2 md:hidden">{rows.map((row) => <article key={row.dueKey} className="rounded-lg border p-2 text-xs"><div className="flex justify-between"><strong>{row.dueDate}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{t(`installments.committees.management.status.${row.paymentStatus}`)}</span></div><div className="mt-2 grid grid-cols-3 gap-1"><Amount label={t('installments.members.scheduled')} value={row.amount} always /><Amount label={t('installments.members.received')} value={row.allocatedAmount} color="text-emerald-700" always /><Amount label={t('installments.members.remaining')} value={row.remainingAmount} color="text-amber-700" always /></div></article>)}</div></>}{data.schedule.total > rows.length && <p className="border-t p-2 text-xs text-slate-500">{t('installments.members.statementLimited')}</p>}</div>;
};

const Icon = ({ icon: Glyph, label, onClick, primary, danger, green, active }) => <button type="button" onClick={onClick} title={label} aria-label={label} className={`grid h-9 w-9 flex-none place-items-center rounded-lg border text-sm focus:ring-2 focus:ring-indigo-300 ${primary ? 'border-indigo-600 bg-indigo-600 text-white' : danger ? 'border-rose-200 text-rose-600' : green ? 'border-emerald-200 text-emerald-700' : active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'}`}><Glyph /></button>;
const RowIcon = ({ icon: Glyph, label, onClick, danger, green, disabled }) => <button type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick?.(event); }} onKeyDown={(event) => event.stopPropagation()} title={label} aria-label={label} className={`grid h-8 w-8 place-items-center rounded-lg border text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9 ${danger ? 'border-rose-200 bg-rose-50 text-rose-600' : green ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}><Glyph /></button>;
const Status = ({ label, selected, onClick }) => <button type="button" onClick={onClick} className={`h-9 rounded-lg border px-2 text-[11px] font-bold ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-600'}`}>{label}</button>;
const Select = ({ label, value, onChange, options }) => <label className="mb-2 block text-xs font-bold text-slate-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-xs">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
const State = ({ text, large }) => <div className={`flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500 ${large ? 'h-full' : ''}`}>{text}</div>;
const Mini = ({ label, value, tone: valueTone = 'zero' }) => <div className={`min-w-[108px] flex-1 rounded-md border bg-white px-2.5 py-1.5 ${valueTone === 'receivable' ? 'border-emerald-200' : valueTone === 'payable' ? 'border-rose-200' : 'border-slate-200'}`}><small className="block font-bold uppercase text-slate-500">{label}</small><strong className={valueTone === 'receivable' ? 'text-emerald-700' : valueTone === 'payable' ? 'text-rose-700' : 'text-slate-800'}>{value}</strong></div>;
const CalendarDate = ({ label, value, onChange, min, max }) => <label title={`${label}: ${value || '—'}`} className={`relative grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-lg border text-sm focus-within:ring-2 focus-within:ring-indigo-300 ${value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'}`}><FaCalendarAlt aria-hidden="true" /><input type="date" aria-label={label} title={`${label}: ${value || '—'}`} value={value} min={min || undefined} max={max || undefined} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>;
const StatementMetric = ({ label, value, green }) => <div className="min-w-0 rounded-lg border bg-white px-2 py-1.5"><small className="block truncate text-[10px] font-bold uppercase text-slate-500">{label}</small><strong className={`block truncate text-sm ${green ? 'text-emerald-700' : 'text-slate-800'}`}>{money(value)}</strong></div>;
const Cell = ({ children, color = 'text-slate-700', strong, align = 'start' }) => <td className={`px-3 py-2 ${align === 'end' ? 'text-end tabular-nums' : 'text-start'} ${color} ${strong ? 'font-semibold' : ''}`}>{children}</td>;
const Amount = ({ label, value, color = 'text-slate-800', always }) => <span>{label}<strong className={`block text-xs ${color}`}>{always || value ? money(value) : '—'}</strong></span>;

export default InstallmentsMembersPage;
