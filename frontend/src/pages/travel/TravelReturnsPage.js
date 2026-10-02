import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaHistory, FaTruck, FaUndo } from 'react-icons/fa';

import TravelRefundFormPage from './TravelRefundFormPage';
import TravelVendorReturnsPage from './TravelVendorReturnsPage';
import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';

const RETURN_TYPES = Object.freeze({
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
});

const selectorClass = (active) =>
  `inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition sm:flex-none sm:text-sm ${
    active
      ? 'border-cyan-600 bg-gradient-to-r from-cyan-600 to-blue-700 text-white shadow-lg shadow-cyan-900/15'
      : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800'
  }`;

const TravelReturnsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get('type');
  const selectedType = requestedType === RETURN_TYPES.VENDOR
    ? RETURN_TYPES.VENDOR
    : RETURN_TYPES.CUSTOMER;

  const permissions = useMemo(
    () => ({
      customerCreate: hasPermission('travel.bookings.edit'),
      customerList: hasPermission('travel.bookings.view'),
      vendorCreate: hasPermission('travel.vendors.manage'),
      vendorList:
        hasPermission('travel.vendors.view') || hasPermission('travel.vendors.manage'),
    }),
    []
  );

  const selectType = (type) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('type', type);
    setSearchParams(nextParams);
  };

  const isCustomer = selectedType === RETURN_TYPES.CUSTOMER;
  const canCreate = isCustomer ? permissions.customerCreate : permissions.vendorCreate;
  const canViewHistory = isCustomer ? permissions.customerList : permissions.vendorList;
  const historyPath = isCustomer ? '/travel/refunds' : '/travel/vendor-returns';
  const historyLabel = isCustomer
    ? t('travel.returns.customerHistory')
    : t('travel.returns.vendorHistory');
  const backLabel = isCustomer
    ? t('travel.refund.actions.backToList')
    : t('travel.vendorReturns.backToList');

  return (
    <div className="space-y-2">
      <section className="rounded-xl border border-cyan-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50 p-2 shadow-sm sm:px-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              className={selectorClass(isCustomer)}
              aria-pressed={isCustomer}
              onClick={() => selectType(RETURN_TYPES.CUSTOMER)}
            >
              <FaUndo aria-hidden="true" />
              {t('travel.returns.customer')}
            </button>

            <button
              type="button"
              className={selectorClass(!isCustomer)}
              aria-pressed={!isCustomer}
              onClick={() => selectType(RETURN_TYPES.VENDOR)}
            >
              <FaTruck aria-hidden="true" />
              {t('travel.returns.vendor')}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            {canViewHistory && (
            <button
              type="button"
              onClick={() => navigate(historyPath)}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 sm:flex-none"
            >
              <FaHistory aria-hidden="true" />
              {historyLabel}
            </button>
            )}

            <button
              type="button"
              title={backLabel}
              aria-label={backLabel}
              onClick={() => navigate(-1)}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <FaArrowLeft aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {!canCreate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {t('travel.returns.createPermissionRequired')}
        </div>
      )}

      {canCreate && isCustomer && <TravelRefundFormPage embedded />}
      {canCreate && !isCustomer && <TravelVendorReturnsPage forceFormVisible embedded />}
    </div>
  );
};

export default TravelReturnsPage;
