import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArchive, FaArrowLeft, FaBan, FaCalendarDay, FaEdit, FaExternalLinkAlt, FaFilter, FaPhone, FaPlus, FaPrint, FaSearch, FaTimes, FaUndo, FaUser, FaWallet, FaWhatsapp } from 'react-icons/fa';

import CommitteePlanForm, { emptyCommittee, validateCommittee } from '../../components/installments/members/CommitteePlanForm';
import MemberFormModal from '../../components/installments/members/MemberFormModal';
import InstallmentsDialog from '../../components/installments/InstallmentsDialog';
import { getCurrentLanguage, t } from '../../i18n/i18n';
import { archiveInstallmentsCommittee, closeInstallmentsCommitteeEarly, getInstallmentsCommitteeDetail, getInstallmentsCommitteesPage, restoreInstallmentsCommittee } from '../../services/installmentsCommitteeService';
import { createInstallmentsCommittee, getInstallmentsMembers, updateInstallmentsCommittee } from '../../services/installmentsMemberService';
import { generateWhatsAppLink, isValidPhone } from '../../utils/whatsapp';
import { hasPermission } from '../../utils/permissionHelper';
import { formatInstallmentsDisplayRef } from '../../utils/installmentsDisplay';
import { formatInstallmentsMoney as money } from '../../utils/installmentsMoney';

const shortRef = (value) => formatInstallmentsDisplayRef(value, 'record');
const dateText = (value) => value || '—';
const field = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const legacyOr = (permission) => hasPermission(permission) || hasPermission('installments.committees.manage');
const committeeFilterDefaults = { search: '', status: 'active', funding: '', frequency: '', due: '', fromDate: '', toDate: '', memberId: '', sort: 'recent' };
const filtersFromParams = (params) => Object.keys(committeeFilterDefaults).reduce((result, key) => ({ ...result, [key]: params.get(key) || committeeFilterDefaults[key] }), {});

const InstallmentsCommitteesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardFunding = searchParams.get('scope') === 'dashboard_committee' ? searchParams.get('funding') || '' : '';
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams));
  const [list, setList] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(searchParams.get('committeeId') || '');
  const [detail, setDetail] = useState(null);
  const [schedulePage, setSchedulePage] = useState(1);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [formState, setFormState] = useState(null);
  const [committeeForm, setCommitteeForm] = useState(emptyCommittee());
  const [formErrors, setFormErrors] = useState({});
  const [memberModalOpen, setMemberModalOpen] = useState(false);

  const permissions = useMemo(() => ({
    canCreate: legacyOr('installments.committees.create'),
    canEdit: legacyOr('installments.committees.edit'),
    canArchive: legacyOr('installments.committees.archive'),
    canRestore: legacyOr('installments.committees.restore'),
    canLedger: hasPermission('installments.members.view_ledger'),
    canReceive: hasPermission('installments.payments.receive'),
    canCollections: hasPermission('installments.payments.view_collections'),
    canAddMember: hasPermission('installments.members.create'),
    canOpening: hasPermission('installments.opening_balances.manage'),
  }), []);

  const loadMembers = useCallback(() => getInstallmentsMembers({ status: 'active' }).then(setMembers).catch(() => setMembers([])), []);
  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setNotice('');
      const data = await getInstallmentsCommitteesPage({ ...filters, page, limit: 25 });
      setList(data);
      if (selectedId && !data.rows.some((row) => row._id === selectedId) && filters.status !== 'archived') setSelectedId('');
    } catch (error) {
      setNotice(error.response?.data?.message || t('installments.committees.management.errors.load'));
    } finally { setLoading(false); }
  }, [filters, page, selectedId]);
  const loadDetail = useCallback(async (id, nextPage = schedulePage) => {
    if (!id) return;
    try {
      setDetailLoading(true);
      setNotice('');
      setDetail(await getInstallmentsCommitteeDetail(id, { page: nextPage, limit: 20 }));
    } catch (error) {
      setNotice(error.response?.data?.message || t('installments.committees.management.errors.detail'));
    } finally { setDetailLoading(false); }
  }, [schedulePage]);

  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { const timer = setTimeout(loadList, filters.search ? 250 : 0); return () => clearTimeout(timer); }, [loadList, filters.search]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);
  useEffect(() => {
    const requested = searchParams.get('committeeId');
    if ((requested || '') !== selectedId) setSelectedId(requested || '');
  }, [searchParams, selectedId]);
  useEffect(() => {
    const requested = filtersFromParams(searchParams);
    setFilters((current) => JSON.stringify(current) === JSON.stringify(requested) ? current : requested);
  }, [searchParams]);
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !permissions.canCreate) return;
    setCommitteeForm(emptyCommittee());
    setFormErrors({});
    setFormState({ mode: 'create', memberId: searchParams.get('memberId') || '' });
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, permissions.canCreate]);

  const setFilter = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); const next = new URLSearchParams(searchParams); if (value && value !== committeeFilterDefaults[key]) next.set(key, value); else next.delete(key); setSearchParams(next, { replace: true }); };
  const clearFilters = () => { setFilters(committeeFilterDefaults); setPage(1); setFiltersOpen(false); setSearchParams(selectedId ? { committeeId: selectedId } : {}, { replace: true }); };
  const clearDashboardFilters = () => {
    const next = { ...committeeFilterDefaults, status: 'all', funding: dashboardFunding };
    setFilters(next); setPage(1); setFiltersOpen(false);
    setSearchParams({ status: 'all', funding: dashboardFunding, scope: 'dashboard_committee' }, { replace: true });
  };
  const selectCommittee = (committeeId) => { setSelectedId(committeeId); setSchedulePage(1); const next = new URLSearchParams(searchParams); next.set('committeeId', committeeId); setSearchParams(next, { replace: true }); };
  const closeDetail = () => { setSelectedId(''); setDetail(null); const next = new URLSearchParams(searchParams); next.delete('committeeId'); setSearchParams(next, { replace: true }); };
  const openCreate = (memberId = '') => { setCommitteeForm(emptyCommittee()); setFormErrors({}); setFormState({ mode: 'create', memberId }); };
  const openEdit = (committee) => { setCommitteeForm({ ...committee, schedule: { ...committee.schedule } }); setFormErrors({}); setFormState({ mode: 'edit', memberId: committee.memberId?._id || committee.memberId, committeeId: committee._id }); };
  const saveCommittee = async () => {
    const errors = validateCommittee(committeeForm); setFormErrors(errors); if (Object.keys(errors).length) { setNotice(Object.values(errors).join('\n')); return; }
    if (!formState.memberId) { setNotice(t('installments.committees.management.selectMember')); return; }
    try {
      const result = formState.mode === 'edit'
        ? await updateInstallmentsCommittee(formState.memberId, formState.committeeId, committeeForm)
        : await createInstallmentsCommittee(formState.memberId, committeeForm);
      setFormState(null);
      const committeeId = result.committee?._id || formState.committeeId;
      await loadList();
      selectCommittee(committeeId);
      setNotice(t(formState.mode === 'edit' ? 'installments.committees.management.updated' : 'installments.committees.management.created'));
    } catch (error) { setNotice(error.response?.data?.message || t('installments.committees.management.errors.save')); }
  };
  const archive = (committee) => setConfirmation({ message: t('installments.committees.management.confirmArchive'), inputLabel: t('installments.committees.management.archiveReason'), inputValue: '', inputRequired: true, confirmLabel: t('installments.committees.management.archive'), action: async (reason) => { try { await archiveInstallmentsCommittee(committee._id, reason); closeDetail(); await loadList(); setNotice(t('installments.committees.management.archived')); } catch (error) { const obligations = error.response?.data?.obligations; setNotice(obligations ? `${error.response.data.message}: ${money(obligations.scheduledRemaining)} / ${money(obligations.unappliedAdvance)} / ${money(obligations.invoiceOutstanding)}` : error.response?.data?.message || t('installments.committees.management.errors.archive')); } } });
  const restore = (committee) => setConfirmation({ message: t('installments.committees.management.confirmRestore'), confirmLabel: t('installments.committees.management.restore'), action: async () => { try { await restoreInstallmentsCommittee(committee._id); closeDetail(); await loadList(); setNotice(t('installments.committees.management.restored')); } catch (error) { setNotice(error.response?.data?.message || t('installments.committees.management.errors.restore')); } } });
  const closeEarly = (committee) => setConfirmation({ message: t('installments.committees.management.confirmCloseEarly'), inputLabel: t('installments.committees.management.closeEarlyReason'), inputValue: '', inputRequired: true, confirmLabel: t('installments.committees.management.closeEarly'), action: async (reason) => { try { await closeInstallmentsCommitteeEarly(committee._id, reason); closeDetail(); setFilter('status', 'closed_early'); setNotice(t('installments.committees.management.closedEarly')); } catch (error) { const obligations = error.response?.data?.obligations; setNotice(obligations ? `${error.response.data.message}: ${money(obligations.refundableSavings)} / ${money(obligations.invoiceOutstanding)}` : error.response?.data?.message || t('installments.committees.management.errors.closeEarly')); } } });

  const selected = detail?.committee;
  const whatsapp = selected && isValidPhone(selected.memberId?.mobile) ? generateWhatsAppLink(selected.memberId.mobile, `${selected.memberId.fullName}\n${t('installments.committees.management.reference')}: ${shortRef(selected.committeeNumber)}\n${t('installments.committees.management.remaining')}: ${money(selected.financials.remainingAmount)}`) : '';

  if (dashboardFunding) return <main className="min-h-full overflow-x-hidden bg-slate-50 p-2 sm:p-4"><div className="mx-auto max-w-[1500px]">
    <div className="mb-2 flex min-w-0 items-center gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm"><label className="relative min-w-0 flex-1"><FaSearch className="absolute start-3 top-3 text-slate-400" /><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={t('installments.committees.management.search')} aria-label={t('installments.committees.management.search')} className={`${field} h-10 ps-9`} /></label><button type="button" onClick={clearDashboardFilters} title={t('installments.committees.management.clear')} aria-label={t('installments.committees.management.clear')} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><FaUndo aria-hidden="true" /></button></div>
    {notice ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{notice}</p> : loading ? <State text={t('loading')} /> : !list.rows.length ? <State text={t('installments.committees.management.empty')} /> : <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border bg-white"><table className="w-full min-w-[560px] text-xs"><thead className="bg-slate-100 text-slate-600"><tr><Th>{t('installments.committees.management.table.member')}</Th><Th title={t('installments.committees.management.reference')}>{t('installments.committees.management.table.reference')}</Th><Th end title={t('installments.committees.management.collected')}>{t('installments.committees.management.table.paid')}</Th><Th end title={t('installments.committees.management.remaining')}>{t('installments.committees.management.table.remaining')}</Th><Th>{t('installments.committees.management.table.status')}</Th><Th>{t('installments.committees.management.table.view')}</Th></tr></thead><tbody>{list.rows.map((committee) => <tr key={committee._id} className="border-b last:border-b-0 hover:bg-cyan-50"><Td>{committee.memberId?.fullName || '—'}</Td><Td>{shortRef(committee.committeeNumber)}</Td><Td end>{money(committee.financials.collectedAmount)}</Td><Td end>{money(committee.financials.remainingAmount)}</Td><Td><Badge status={committee.effectiveStatus} /></Td><Td><button type="button" onClick={() => navigate(`/installments/committees?committeeId=${committee._id}`)} title={t('view')} aria-label={t('view')} className="grid h-8 w-8 place-items-center rounded-lg border text-blue-700"><FaExternalLinkAlt aria-hidden="true" /></button></Td></tr>)}</tbody></table>{list.pages > 1 && <Pager page={page} pages={list.pages} onPage={setPage} />}</div>}
  </div></main>;

  return <main className="min-h-full overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/40 p-2 sm:p-3">
    <style>{`@media print{body *{visibility:hidden}.committee-print,.committee-print *{visibility:visible}.committee-print{position:absolute;inset:0;width:100%;height:auto;overflow:visible;background:white;padding:22px}.print-hide{display:none!important}}`}</style>
    <InstallmentsDialog open={Boolean(notice)} type="warning" message={notice} onClose={() => setNotice('')} onConfirm={() => setNotice('')} />
    <InstallmentsDialog open={Boolean(confirmation)} type="warning" message={confirmation?.message} inputLabel={confirmation?.inputLabel} inputValue={confirmation?.inputValue || ''} inputRequired={confirmation?.inputRequired} onInputChange={(value) => setConfirmation((current) => ({ ...current, inputValue: value }))} cancelLabel={t('cancel')} confirmLabel={confirmation?.confirmLabel} onClose={() => setConfirmation(null)} onConfirm={() => { const pending = confirmation; setConfirmation(null); pending?.action?.(pending.inputValue || ''); }} />
    <div className="mx-auto flex h-[calc(100vh-80px)] max-w-[1600px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} print-hide w-full flex-col border-e border-slate-200 md:w-[390px] md:flex-shrink-0`}>
        <div className="relative border-b border-slate-200 p-2.5">
          <div className="flex h-9 items-center justify-between"><h1 className="text-base font-black">{t('installments.committees.management.title')}</h1><div className="flex gap-1.5">{permissions.canCreate && <Icon icon={FaPlus} label={t('installments.committees.add')} primary onClick={() => openCreate()} />}<Icon icon={FaFilter} label={t('installments.committees.management.filters')} active={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} /></div></div>
          <div className="mt-2 flex gap-1.5"><label className="relative min-w-0 flex-1"><FaSearch className="absolute start-2.5 top-2.5 text-xs text-slate-400" /><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={t('installments.committees.management.search')} className={`${field} ps-8`} /></label><select aria-label={t('status')} className="h-9 max-w-36 rounded-lg border px-1 text-[11px] font-bold" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value="all">{t('all')}</option><option value="active">{t('installments.committees.management.active')}</option><option value="target_reached">{t('installments.committees.management.targetReached')}</option><option value="completed">{t('installments.committees.management.completed')}</option><option value="closed_early">{t('installments.committees.management.closedEarlyFilter')}</option><option value="paused">{t('installments.committees.statuses.paused')}</option><option value="closed">{t('installments.committees.statuses.closed')}</option><option value="archived">{t('installments.committees.management.hidden')}</option></select><Icon icon={FaTimes} label={t('installments.committees.management.clear')} onClick={clearFilters} /></div>
          {filtersOpen && <div className="absolute end-2.5 top-12 z-30 grid w-72 gap-2 rounded-xl border bg-white p-3 shadow-xl"><FilterSelect label={t('installments.committees.management.fundingFilter')} value={filters.funding} onChange={(value) => setFilter('funding', value)} options={['', ['paid', t('installments.dashboard.committeeStatus.paidInFull')], ['partial', t('installments.dashboard.committeeStatus.partiallyPaid')], ['unpaid', t('installments.dashboard.committeeStatus.notPaid')], ['overdue', t('installments.dashboard.committeeStatus.overduePlans')]]} /><FilterSelect label={t('installments.committees.frequency')} value={filters.frequency} onChange={(value) => setFilter('frequency', value)} options={['', 'daily', 'every_other_day', 'every_3_days', 'weekly', 'every_15_days', 'twice_monthly', 'monthly', 'custom_days']} /><FilterSelect label={t('installments.committees.management.dueFilter')} value={filters.due} onChange={(value) => setFilter('due', value)} options={['', 'today', 'overdue']} plain /><FilterSelect label={t('installments.committees.management.member')} value={filters.memberId} onChange={(value) => setFilter('memberId', value)} options={members.map((member) => [member._id, `${member.fullName} · ${shortRef(member.memberNumber)}`])} /><div className="grid grid-cols-2 gap-2"><input aria-label={t('installments.committees.management.fromDate')} type="date" className={field} value={filters.fromDate} onChange={(event) => setFilter('fromDate', event.target.value)} /><input aria-label={t('installments.committees.management.toDate')} type="date" className={field} value={filters.toDate} onChange={(event) => setFilter('toDate', event.target.value)} /></div><FilterSelect label={t('installments.committees.management.sort')} value={filters.sort} onChange={(value) => setFilter('sort', value)} options={['recent', 'oldest', 'member', 'target', 'next_due', 'outstanding']} plain /></div>}
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">{loading ? <State text={t('loading')} /> : !list.rows.length ? <State text={t('installments.committees.management.empty')} /> : list.rows.map((committee) => <CommitteeCard key={committee._id} committee={committee} selected={selectedId === committee._id} onClick={() => selectCommittee(committee._id)} />)}</div>
        {list.pages > 1 && <Pager page={page} pages={list.pages} onPage={setPage} />}
      </aside>
      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col overflow-hidden`}>{!selectedId ? <State large text={t('installments.committees.management.selectPrompt')} /> : detailLoading || !selected ? <State large text={t('loading')} /> : <CommitteeDetail data={detail} onBack={closeDetail} onEdit={() => openEdit(selected)} onCloseEarly={() => closeEarly(selected)} onArchive={() => archive(selected)} onRestore={() => restore(selected)} onPrint={() => window.print()} whatsapp={whatsapp} navigate={navigate} permissions={permissions} schedulePage={schedulePage} onSchedulePage={setSchedulePage} />}</section>
    </div>
    {formState && <CommitteeModal state={formState} setState={setFormState} members={members} value={committeeForm} onChange={setCommitteeForm} errors={formErrors} onSave={saveCommittee} canAddMember={permissions.canAddMember} onAddMember={() => setMemberModalOpen(true)} />}
    <MemberFormModal open={memberModalOpen} member={null} onClose={() => setMemberModalOpen(false)} canManageOpening={permissions.canOpening} canManageCommittees={false} onSaved={async (member) => { setMemberModalOpen(false); await loadMembers(); setFormState((current) => ({ ...current, memberId: member._id })); }} />
  </main>;
};

const CommitteeCard = ({ committee, selected, onClick }) => <button type="button" onClick={onClick} className={`mb-1.5 w-full rounded-lg border p-2.5 text-start transition ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{committee.memberId?.fullName || '—'}</strong><small className="text-slate-500">#{shortRef(committee.committeeNumber)} · {committee.memberId?.mobile || '—'}</small></span><Badge status={committee.effectiveStatus} /></div><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px]"><Info label={t('installments.committees.contribution')} value={money(committee.contributionAmount)} /><Info label={t('installments.committees.frequency')} value={t(`installments.committees.frequencies.${committee.schedule.frequency}`)} /><Info label={t('installments.committees.management.collected')} value={money(committee.financials.collectedAmount)} green /><Info label={t('installments.committees.management.nextDue')} value={dateText(committee.financials.nextDueDate)} /></div></button>;

const CommitteeDetail = ({ data, onBack, onEdit, onCloseEarly, onArchive, onRestore, onPrint, whatsapp, navigate, permissions, schedulePage, onSchedulePage }) => {
  const committee = data.committee; const member = committee.memberId; const financials = committee.financials; const business = JSON.parse(localStorage.getItem('user') || '{}');
  return <div className="committee-print min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"><header className="flex items-start justify-between gap-3 border-b pb-3"><div className="flex min-w-0 items-start gap-2"><Icon icon={FaArrowLeft} label={t('back')} onClick={onBack} extra="md:hidden print-hide" /><div className="min-w-0"><h2 className="truncate text-lg font-black text-slate-900">{member?.fullName}</h2><p className="text-xs font-semibold text-slate-500">#{shortRef(committee.committeeNumber)} · {dateText(committee.schedule.startDate)}</p></div><Badge status={committee.effectiveStatus} />{financials.payoutStatus === 'partially_paid_out' && <Badge status="partially_paid_out" />}</div><div className="print-hide flex flex-wrap justify-end gap-1">{permissions.canEdit && !committee.isArchived && !['completed', 'closed_early'].includes(committee.effectiveStatus) && <Icon icon={FaEdit} label={t('edit')} onClick={onEdit} />}{permissions.canEdit && committee.effectiveStatus === 'active' && <Icon icon={FaBan} label={t('installments.committees.management.closeEarly')} danger onClick={onCloseEarly} />}{permissions.canLedger && <Icon icon={FaUser} label={t('installments.committees.management.viewLedger')} onClick={() => navigate(`/installments/members?memberId=${member._id}`)} />}{permissions.canReceive && committee.effectiveStatus === 'active' && <Icon icon={FaWallet} label={t('installments.committees.management.receive')} green onClick={() => navigate(`/installments/payments/receive?memberId=${member._id}&committeeId=${committee._id}`)} />}{permissions.canCollections && committee.effectiveStatus === 'active' && <Icon icon={FaCalendarDay} label={t('installments.committees.management.todayDue')} onClick={() => navigate(`/installments/collections/today?committeeId=${committee._id}`)} />}<Icon icon={FaPrint} label={t('installments.committees.management.print')} onClick={onPrint} />{member?.mobile && <a className="grid h-9 w-9 place-items-center rounded-lg border text-slate-600" aria-label={t('installments.committees.management.call')} href={`tel:${member.mobile}`}><FaPhone /></a>}{whatsapp && <a className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-200 text-emerald-700" aria-label="WhatsApp" href={whatsapp} target="_blank" rel="noreferrer"><FaWhatsapp /></a>}{permissions.canArchive && !committee.isArchived && <Icon icon={FaArchive} label={t('installments.committees.management.archive')} danger onClick={onArchive} />}{permissions.canRestore && committee.isArchived && <Icon icon={FaUndo} label={t('installments.committees.management.restore')} onClick={onRestore} />}</div></header>
    <p className="hidden print:block text-xs text-slate-500">{business.businessName || 'SmartKhaata'} · {new Date().toLocaleDateString(getCurrentLanguage() === 'ur' ? 'ur-PK' : 'en-PK')}</p>
    <div className="my-3 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6"><Metric label={t('installments.committees.targetAmount')} value={money(committee.targetAmount)} /><Metric label={t('installments.committees.management.totalDeposited')} value={money(financials.totalDeposited)} tone="text-emerald-700" /><Metric label={t('installments.committees.management.totalPaidOut')} value={money(financials.totalPaidOut)} /><Metric label={t('installments.committees.management.appliedToInvoices')} value={money(financials.appliedToInvoices)} /><Metric label={t('installments.committees.management.refundableSavings')} value={money(financials.refundableSavings)} tone="text-cyan-700" /><Metric label={t('installments.committees.management.remainingTarget')} value={money(financials.remainingAmount)} tone="text-rose-700" /></div>
    {data.reconciliationRequired && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-800">{t('installments.committees.management.reconciliation')}</p>}
    <section className="mb-3 grid gap-2 rounded-xl border bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><Info label={t('installments.committees.frequency')} value={t(`installments.committees.frequencies.${committee.schedule.frequency}`)} /><Info label={t('installments.committees.startDate')} value={committee.schedule.startDate} /><Info label={t('installments.committees.occurrences')} value={committee.preview.totalOccurrences} /><Info label={t('installments.committees.estimatedEnd')} value={committee.preview.estimatedEndDate} /><Info label={t('installments.committees.management.nextDue')} value={dateText(financials.nextDueDate)} /><Info label={t('installments.committees.management.unappliedAdvance')} value={money(data.unappliedAdvance)} /><Info label={t('installments.committees.management.linkedInvoice')} value={data.linkedInvoices.length ? data.linkedInvoices.map((row) => shortRef(row.invoiceNumber)).join(', ') : t('installments.committees.management.pureSavings')} /><Info label={t('installments.committees.notesOptional')} value={committee.notes || '—'} /></section>
    <section className="rounded-xl border"><div className="flex items-center justify-between border-b px-3 py-2"><h3 className="text-sm font-black">{t('installments.committees.management.schedule')}</h3><span className="text-[11px] text-slate-500">{data.schedule.total} {t('installments.committees.management.rows')}</span></div><div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>#</Th><Th>{t('installments.committees.management.dueDate')}</Th><Th end>{t('installments.committees.management.expected')}</Th><Th end>{t('installments.committees.management.allocated')}</Th><Th end>{t('installments.committees.management.remaining')}</Th><Th>{t('status')}</Th></tr></thead><tbody>{data.schedule.rows.map((row) => <tr key={row.dueKey} className="border-t"><Td>{row.installmentNumber}</Td><Td>{row.dueDate}</Td><Td end>{money(row.amount)}</Td><Td end>{money(row.allocatedAmount)}</Td><Td end>{money(row.remainingAmount)}</Td><Td><Badge status={row.paymentStatus} /></Td></tr>)}</tbody></table></div>{data.schedule.pages > 1 && <Pager page={schedulePage} pages={data.schedule.pages} onPage={onSchedulePage} />}</section>
  </div>;
};

const CommitteeModal = ({ state, setState, members, value, onChange, errors, onSave, canAddMember, onAddMember }) => <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-2" role="dialog" aria-modal="true"><div className="max-h-[96vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><h2 className="font-black">{t(state.mode === 'edit' ? 'installments.committees.edit' : 'installments.committees.add')}</h2><button onClick={() => setState(null)} aria-label={t('close')}><FaTimes /></button></div>{state.mode === 'create' && <div className="mb-3 flex items-end gap-2"><label className="flex-1 text-xs font-bold text-slate-600">{t('installments.committees.management.member')}<select className={`${field} mt-1`} value={state.memberId} onChange={(event) => setState({ ...state, memberId: event.target.value })}><option value="">{t('installments.committees.management.selectMember')}</option>{members.map((member) => <option key={member._id} value={member._id}>{member.fullName} · {shortRef(member.memberNumber)} · {member.mobile}</option>)}</select></label>{canAddMember && <button type="button" onClick={onAddMember} className="h-9 rounded-lg border px-3 text-xs font-bold"><FaPlus className="inline" /> {t('installments.committees.management.quickAddMember')}</button>}</div>}<CommitteePlanForm value={value} onChange={onChange} showStatus={state.mode === 'edit'} errors={errors} /><div className="mt-4 flex justify-end gap-2"><button onClick={() => setState(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('cancel')}</button><button onClick={onSave} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">{t('common.saveChanges')}</button></div></div></div>;

const Badge = ({ status }) => { const tones = { active: 'bg-emerald-50 text-emerald-700', target_reached: 'bg-cyan-50 text-cyan-700', completed: 'bg-blue-50 text-blue-700', closed_early: 'bg-amber-50 text-amber-800', partially_paid_out: 'bg-violet-50 text-violet-700', paid: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700', due_today: 'bg-amber-50 text-amber-700', overdue: 'bg-rose-50 text-rose-700', archived: 'bg-slate-100 text-slate-600', paused: 'bg-slate-100 text-slate-600', closed: 'bg-blue-50 text-blue-700', upcoming: 'bg-slate-50 text-slate-600' }; return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-black ${tones[status] || tones.upcoming}`}>{t(`installments.committees.management.status.${status}`)}</span>; };
const Icon = ({ icon: Glyph, label, onClick, primary, green, danger, active, extra = '' }) => <button type="button" onClick={onClick} title={label} aria-label={label} className={`grid h-9 w-9 flex-none place-items-center rounded-lg border text-sm ${primary ? 'border-indigo-600 bg-indigo-600 text-white' : green ? 'border-emerald-200 text-emerald-700' : danger ? 'border-rose-200 text-rose-700' : active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'} ${extra}`}><Glyph /></button>;
const Info = ({ label, value, green }) => <span className="min-w-0"><small className="block font-bold text-slate-400">{label}</small><strong className={`block truncate ${green ? 'text-emerald-700' : 'text-slate-700'}`}>{value}</strong></span>;
const Metric = ({ label, value, tone = 'text-slate-900' }) => <div className="rounded-lg border bg-white px-2.5 py-2"><small className="block text-[10px] font-black uppercase text-slate-400">{label}</small><strong className={`text-sm ${tone}`}>{value}</strong></div>;
const State = ({ text, large }) => <div className={`grid place-items-center p-8 text-center text-sm font-semibold text-slate-500 ${large ? 'h-full' : ''}`}>{text}</div>;
const Pager = ({ page, pages, onPage }) => <div className="print-hide flex items-center justify-between border-t px-3 py-2 text-xs font-bold"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">{t('previous')}</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">{t('next')}</button></div>;
const FilterSelect = ({ label, value, onChange, options, plain }) => <label className="text-xs font-bold text-slate-600">{label}<select className={`${field} mt-1`} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => { const pair = Array.isArray(option) ? option : [option, option ? (plain ? t(`installments.committees.management.filter.${option}`) : t(`installments.committees.frequencies.${option}`)) : t('all')]; return <option key={pair[0]} value={pair[0]}>{pair[1]}</option>; })}</select></label>;
const Th = ({ children, end, title }) => <th title={title} aria-label={title} className={`whitespace-nowrap px-3 py-2 ${end ? 'text-end' : 'text-start'}`}>{children}</th>;
const Td = ({ children, end }) => <td className={`whitespace-nowrap px-3 py-2 ${end ? 'text-end font-bold' : ''}`}>{children}</td>;

export default InstallmentsCommitteesPage;
