import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaHandHoldingUsd, FaMoneyBillWave, FaUndoAlt, FaWallet } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { hasAnyPermission } from '../../utils/permissionHelper';
import { TravelActionButton } from '../../components/travel/master/TravelMasterUI';
import TravelReceivePaymentPage from './TravelReceivePaymentPage';
import TravelVendorPaymentPage from './TravelVendorPaymentPage';
import TravelRefundSettlementPage from './TravelRefundSettlementPage';

const RECEIVE_PERMISSIONS = ['travel.bookings.view', 'travel.bookings.edit', 'travel.payments'];
const VENDOR_PERMISSIONS = ['travel.vendors.view', 'travel.vendors.manage', 'travel.payments'];
const CUSTOMER_REFUND_PERMISSIONS = ['travel.bookings.edit', 'travel.payments'];
const VENDOR_REFUND_PERMISSIONS = ['travel.vendors.manage', 'travel.payments'];

const TravelPaymentsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const canReceive = hasAnyPermission(RECEIVE_PERMISSIONS);
  const canPayVendor = hasAnyPermission(VENDOR_PERMISSIONS);
  const canPayCustomerRefund = hasAnyPermission(CUSTOMER_REFUND_PERMISSIONS);
  const canReceiveVendorRefund = hasAnyPermission(VENDOR_REFUND_PERMISSIONS);
  const allowedModes = [
    canReceive && 'receive',
    canPayVendor && 'vendor',
    canPayCustomerRefund && 'customer-refund',
    canReceiveVendorRefund && 'vendor-refund',
  ].filter(Boolean);
  const requestedMode = searchParams.get('mode') || 'receive';
  const mode = allowedModes.includes(requestedMode) ? requestedMode : allowedModes[0] || 'receive';

  const changeMode = (nextMode) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('mode', nextMode);
    nextParams.delete('paymentId');
    nextParams.delete('customerId');
    nextParams.delete('customerPartyId');
    nextParams.delete('customerType');
    nextParams.delete('vendorId');
    nextParams.delete('vendorPartyId');
    nextParams.delete('vendorType');
    nextParams.delete('refundId');
    nextParams.delete('sourceId');
    nextParams.delete('sourceType');
    setSearchParams(nextParams);
  };

  const modeActions = (
    <>
      {canReceive && (
        <TravelActionButton
          icon={FaHandHoldingUsd}
          variant={mode === 'receive' ? 'primary' : 'secondary'}
          onClick={() => changeMode('receive')}
        >
          {t('travel.payments.receiveAction')}
        </TravelActionButton>
      )}
      {canPayVendor && (
        <TravelActionButton
          icon={FaMoneyBillWave}
          variant={mode === 'vendor' ? 'primary' : 'secondary'}
          onClick={() => changeMode('vendor')}
        >
          {t('travel.payments.vendorActionShort')}
        </TravelActionButton>
      )}
      {canPayCustomerRefund && (
        <TravelActionButton icon={FaUndoAlt} variant={mode === 'customer-refund' ? 'danger' : 'secondary'} onClick={() => changeMode('customer-refund')}>
          Customer refund
        </TravelActionButton>
      )}
      {canReceiveVendorRefund && (
        <TravelActionButton icon={FaWallet} variant={mode === 'vendor-refund' ? 'success' : 'secondary'} onClick={() => changeMode('vendor-refund')}>
          Vendor refund
        </TravelActionButton>
      )}
    </>
  );

  if (mode === 'vendor') return <TravelVendorPaymentPage modeActions={modeActions} />;
  if (mode === 'customer-refund') return <TravelRefundSettlementPage kind="customer" modeActions={modeActions} />;
  if (mode === 'vendor-refund') return <TravelRefundSettlementPage kind="vendor" modeActions={modeActions} />;
  return <TravelReceivePaymentPage modeActions={modeActions} />;
};

export default TravelPaymentsPage;
