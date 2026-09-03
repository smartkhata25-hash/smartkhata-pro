import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaEye,
  FaFileInvoiceDollar,
  FaFilePdf,
  FaPrint,
  FaShareAlt,
  FaTrash,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  deleteTravelVendorReturn,
  fetchTravelVendorReturnById,
  getTravelVendorReturnPdfUrl,
  getTravelVendorReturnPreviewUrl,
  getTravelVendorReturnPrintUrl,
} from '../../services/travelMasterService';
import { formatDateWithOptionalTime } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import { sharePdfDocument } from '../../utils/documentShare';
import {
  TravelActionButton,
  TravelMasterPageFrame,
  buildTravelConfirmMessage,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';

const DetailLine = ({ labelKey, value }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-[11px] font-extrabold uppercase tracking-normal text-slate-400">{t(labelKey)}</p>
    <p className="mt-1 truncate text-sm font-black text-slate-900">{value || '-'}</p>
  </div>
);

const openDocumentUrl = (url) => {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');

  if (!opened) {
    alert(t('alerts.printWindowBlocked'));
  }
};

const TravelVendorReturnDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const canDelete = hasPermission('travel.vendors.manage');

  const loadRecord = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setPageError('');

      const data = await fetchTravelVendorReturnById(id);
      setRecord(data || null);
    } catch (error) {
      console.error('Travel vendor return detail load failed:', error);
      setPageError(t('travel.vendorReturns.loadOneFailed'));
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  const vendorName =
    record?.vendor?.name ||
    (typeof record?.vendorPartyId === 'object' ? record.vendorPartyId?.name : '') ||
    (typeof record?.vendorId === 'object' ? record.vendorId?.name : '');
  const invoiceId =
    typeof record?.originalInvoiceId === 'object'
      ? record.originalInvoiceId?._id
      : record?.originalInvoiceId;

  const handleDeleteVendorReturn = async () => {
    if (!record || !canDelete) return;

    const label = record.returnNumber || t('travel.common.thisRecord');

    if (!window.confirm(buildTravelConfirmMessage('travel.vendorReturns.deleteConfirm', label))) {
      return;
    }

    try {
      setActionLoading(true);
      setPageError('');
      await deleteTravelVendorReturn(id, {
        reason: 'Travel vendor return reversed and archived by user',
      });
      navigate('/travel/vendor-returns');
    } catch (error) {
      console.error('Travel vendor return delete failed:', error);
      setPageError(error?.response?.data?.message || t('travel.vendorReturns.deleteFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenPrint = () => {
    if (!record?._id) return;

    openDocumentUrl(getTravelVendorReturnPrintUrl(record._id));
  };

  const handleOpenPreview = () => {
    if (!record?._id) return;

    openDocumentUrl(getTravelVendorReturnPreviewUrl(record._id));
  };

  const handleOpenPdf = () => {
    if (!record?._id) return;

    openDocumentUrl(getTravelVendorReturnPdfUrl(record._id));
  };

  const handleSharePdf = async () => {
    if (!record?._id) return;

    const fileName = `TravelVendorReturn-${record.returnNumber || record._id}.pdf`;

    try {
      setShareLoading(true);
      setPageError('');

      await sharePdfDocument({
        pdfUrl: getTravelVendorReturnPdfUrl(record._id),
        token: localStorage.getItem('token'),
        fileName,
        title: fileName,
        text: fileName,
      });
    } catch (error) {
      console.error('Travel vendor return PDF share failed:', error);

      setPageError(t('pdf.shareFailed'));
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.vendorReturns.detailTitle"
      subtitleKey="travel.vendorReturns.detailSubtitle"
      actions={
        <div className="flex flex-wrap gap-2">
          <TravelActionButton
            icon={FaArrowLeft}
            variant="secondary"
            onClick={() => navigate('/travel/vendor-returns')}
          >
            {t('travel.vendorReturns.backToList')}
          </TravelActionButton>
          {invoiceId && (
            <TravelActionButton
              icon={FaFileInvoiceDollar}
              variant="soft"
              onClick={() => navigate(`/travel/bookings/${invoiceId}`)}
            >
              {t('travel.vendorReturns.openInvoice')}
            </TravelActionButton>
          )}
          {record && (
            <>
              <TravelActionButton icon={FaEye} variant="secondary" onClick={handleOpenPreview}>
                {t('common.preview')}
              </TravelActionButton>
              <TravelActionButton icon={FaPrint} variant="secondary" onClick={handleOpenPrint}>
                {t('common.print')}
              </TravelActionButton>
              <TravelActionButton icon={FaFilePdf} variant="soft" onClick={handleOpenPdf}>
                {t('pdf.download')}
              </TravelActionButton>
              <TravelActionButton
                icon={FaShareAlt}
                variant="success"
                disabled={shareLoading}
                onClick={handleSharePdf}
              >
                {shareLoading ? t('pdf.preparing') : t('pdf.share')}
              </TravelActionButton>
            </>
          )}
          {record && canDelete && (
            <TravelActionButton
              icon={FaTrash}
              variant="danger"
              disabled={actionLoading}
              onClick={handleDeleteVendorReturn}
            >
              {actionLoading ? t('travel.common.deleting') : t('travel.common.delete')}
            </TravelActionButton>
          )}
        </div>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
          {t('travel.common.loading')}
        </div>
      ) : record ? (
        <section className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-3">
          <DetailLine labelKey="travel.vendorReturns.fields.returnNumber" value={record.returnNumber} />
          <DetailLine
            labelKey="travel.vendorReturns.fields.returnDate"
            value={formatDateWithOptionalTime(record.returnDate, record.returnTime)}
          />
          <DetailLine labelKey="travel.fields.vendor" value={vendorName} />
          <DetailLine labelKey="travel.vendorReturns.fields.originalInvoice" value={record.originalInvoiceNumber} />
          <DetailLine labelKey="travel.vendorReturns.fields.serviceLabel" value={record.serviceLabel} />
          <DetailLine labelKey="travel.vendorReturns.fields.originalCost" value={formatTravelMoney(record.originalCost)} />
          <DetailLine labelKey="travel.vendorReturns.fields.vendorReturnAmount" value={formatTravelMoney(record.vendorReturnAmount)} />
          <DetailLine labelKey="travel.vendorReturns.fields.vendorPenaltyAmount" value={formatTravelMoney(record.vendorPenaltyAmount)} />
          <DetailLine labelKey="travel.vendorReturns.fields.amountReceivedNow" value={formatTravelMoney(record.amountReceivedNow)} />
          <DetailLine labelKey="travel.fields.paymentType" value={record.paymentType ? t(`travel.payments.paymentTypes.${record.paymentType}`) : '-'} />
          <DetailLine
            labelKey="travel.fields.paymentAccount"
            value={
              typeof record.accountId === 'object'
                ? [record.accountId?.name, record.accountId?.code].filter(Boolean).join(' - ')
                : ''
            }
          />
          <DetailLine labelKey="travel.fields.notes" value={record.notes} />
        </section>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
          {t('travel.vendorReturns.notFound')}
        </div>
      )}
    </TravelMasterPageFrame>
  );
};

export default TravelVendorReturnDetailPage;
