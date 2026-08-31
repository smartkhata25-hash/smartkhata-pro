import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaEye, FaFilePdf, FaPlus, FaPrint, FaShareAlt, FaTrash } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  deleteTravelRefund,
  fetchTravelRefundById,
  getTravelRefundPdfUrl,
  getTravelRefundPreviewUrl,
  getTravelRefundPrintUrl,
} from '../../services/travelMasterService';
import { formatDateWithOptionalTime } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import { sharePdfDocument } from '../../utils/documentShare';
import {
  TravelActionButton,
  TravelMasterPageFrame,
  buildTravelConfirmMessage,
} from '../../components/travel/master/TravelMasterUI';
import {
  formatBookingMoney,
  getCustomerName,
  getVendorName,
} from '../../components/travel/bookings/travelBookingConfig';

const Section = ({ children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
    {children}
  </section>
);

const DetailLine = ({ labelKey, value }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-extrabold uppercase tracking-normal text-slate-400">{t(labelKey)}</p>
    <p className="mt-1 break-words text-sm font-bold text-slate-800">
      {value === undefined || value === null || value === '' ? '-' : value}
    </p>
  </div>
);

const getInvoiceNumber = (refund) =>
  refund?.originalInvoiceNumber ||
  refund?.originalInvoiceId?.invoiceNumber ||
  refund?.originalInvoiceId?.bookingNumber ||
  '-';

const openDocumentUrl = (url) => {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');

  if (!opened) {
    alert(t('alerts.printWindowBlocked'));
  }
};

const TravelRefundDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [refund, setRefund] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const canDelete = hasPermission('travel.bookings.edit');

  const loadRefund = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');

      const data = await fetchTravelRefundById(id);
      setRefund(data);
    } catch (error) {
      console.error('Travel refund detail load failed:', error);
      setPageError(t('travel.refund.alerts.loadOneFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRefund();
  }, [loadRefund]);

  const handleDeleteRefund = async () => {
    if (!refund || !canDelete) return;

    const label = refund.refundNumber || t('travel.common.thisRecord');

    if (!window.confirm(buildTravelConfirmMessage('travel.refund.actions.deleteConfirm', label))) {
      return;
    }

    try {
      setActionLoading(true);
      setPageError('');
      await deleteTravelRefund(id, {
        reason: 'Travel refund reversed and archived by user',
      });
      navigate('/travel/refunds');
    } catch (error) {
      console.error('Travel refund delete failed:', error);
      setPageError(error?.response?.data?.message || t('travel.refund.alerts.deleteFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenPrint = () => {
    if (!refund?._id) return;

    openDocumentUrl(getTravelRefundPrintUrl(refund._id));
  };

  const handleOpenPreview = () => {
    if (!refund?._id) return;

    openDocumentUrl(getTravelRefundPreviewUrl(refund._id));
  };

  const handleOpenPdf = () => {
    if (!refund?._id) return;

    openDocumentUrl(getTravelRefundPdfUrl(refund._id));
  };

  const handleSharePdf = async () => {
    if (!refund?._id) return;

    const fileName = `TravelRefund-${refund.refundNumber || refund._id}.pdf`;

    try {
      setShareLoading(true);
      setPageError('');

      await sharePdfDocument({
        pdfUrl: getTravelRefundPdfUrl(refund._id),
        token: localStorage.getItem('token'),
        fileName,
        title: fileName,
        text: fileName,
      });
    } catch (error) {
      console.error('Travel refund PDF share failed:', error);

      setPageError(t('pdf.shareFailed'));
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.refund.detail.title"
      subtitleKey="travel.refund.detail.subtitle"
      actions={
        <div className="flex flex-wrap gap-2">
          <TravelActionButton icon={FaArrowLeft} variant="secondary" onClick={() => navigate('/travel/refunds')}>
            {t('travel.refund.actions.backToList')}
          </TravelActionButton>
          <TravelActionButton icon={FaPlus} variant="soft" onClick={() => navigate('/travel/refunds/new')}>
            {t('travel.refund.actions.new')}
          </TravelActionButton>
          {refund && (
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
          {refund && canDelete && (
            <TravelActionButton
              icon={FaTrash}
              variant="danger"
              disabled={actionLoading}
              onClick={handleDeleteRefund}
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

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      )}

      {!loading && refund && (
        <div className="space-y-4">
          <Section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailLine labelKey="travel.refund.fields.refundNumber" value={refund.refundNumber} />
              <DetailLine labelKey="travel.refund.fields.originalInvoice" value={getInvoiceNumber(refund)} />
              <DetailLine
                labelKey="travel.refund.fields.refundDate"
                value={formatDateWithOptionalTime(refund.refundDate, refund.refundTime)}
              />
              <DetailLine labelKey="travel.booking.fields.customer" value={getCustomerName(refund.customerId)} />
              <DetailLine labelKey="travel.refund.fields.refundMode" value={t(`travel.refund.modes.${refund.refundMode || 'partial'}`)} />
              <DetailLine labelKey="travel.refund.fields.grossRefundAmount" value={formatBookingMoney(refund.grossRefundAmount)} />
              <DetailLine labelKey="travel.refund.fields.penaltyAmount" value={formatBookingMoney(refund.penaltyAmount)} />
              <DetailLine labelKey="travel.refund.fields.customerRefundAmount" value={formatBookingMoney(refund.customerRefundAmount)} />
              <DetailLine labelKey="travel.refund.fields.vendorRecoveryAmount" value={formatBookingMoney(refund.vendorRecoveryAmount)} />
              <DetailLine labelKey="travel.refund.fields.paidBackAmount" value={formatBookingMoney(refund.paidBackAmount)} />
              <DetailLine labelKey="travel.booking.fields.paymentAccount" value={refund.accountId?.name || '-'} />
              <DetailLine labelKey="travel.fields.notes" value={refund.notes} />
            </div>
          </Section>

          <Section>
            <h2 className="mb-3 text-sm font-black text-slate-900">{t('travel.refund.sections.items')}</h2>
            <div className="space-y-2">
              {(refund.refundItems || []).map((item, index) => (
                <div key={item._id || item.bookingItemId || index} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-5">
                  <DetailLine labelKey="travel.booking.fields.itemTitle" value={item.title} />
                  <DetailLine labelKey="travel.booking.fields.bookingItem" value={t(`travel.booking.itemTypes.${item.itemType || 'service'}`)} />
                  <DetailLine labelKey="travel.refund.fields.refundAmount" value={formatBookingMoney(item.refundAmount)} />
                  <DetailLine labelKey="travel.booking.fields.vendor" value={getVendorName(item.vendorId)} />
                  <DetailLine labelKey="travel.refund.fields.vendorRecoveryAmount" value={formatBookingMoney(item.vendorRecoveryAmount)} />
                </div>
              ))}
              {(refund.refundItems || []).length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">
                  {t('travel.refund.empty.items')}
                </p>
              )}
            </div>
          </Section>

          <Section>
            <h2 className="mb-3 text-sm font-black text-slate-900">{t('travel.booking.fields.attachments')}</h2>
            <div className="space-y-2">
              {(refund.attachments || []).map((attachment) => (
                <a
                  key={attachment.key || attachment.url}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-cyan-700 hover:bg-cyan-50"
                >
                  {attachment.originalName || attachment.key}
                </a>
              ))}
              {(refund.attachments || []).length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">
                  {t('travel.booking.empty.attachments')}
                </p>
              )}
            </div>
          </Section>
        </div>
      )}
    </TravelMasterPageFrame>
  );
};

export default TravelRefundDetailPage;
