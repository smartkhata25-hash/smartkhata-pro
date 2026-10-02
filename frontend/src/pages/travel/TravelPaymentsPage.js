import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaHandHoldingUsd, FaMoneyBillWave } from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { hasAnyPermission } from '../../utils/permissionHelper';
import { TravelActionButton } from '../../components/travel/master/TravelMasterUI';
import TravelReceivePaymentPage from './TravelReceivePaymentPage';
import TravelVendorPaymentPage from './TravelVendorPaymentPage';

const RECEIVE_PERMISSIONS = ['travel.bookings.view', 'travel.bookings.edit', 'travel.payments'];
const VENDOR_PERMISSIONS = ['travel.vendors.view', 'travel.vendors.manage', 'travel.payments'];

const TravelPaymentsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const canReceive = hasAnyPermission(RECEIVE_PERMISSIONS);
  const canPayVendor = hasAnyPermission(VENDOR_PERMISSIONS);
  const requestedMode = searchParams.get('mode') === 'vendor' ? 'vendor' : 'receive';
  const mode =
    requestedMode === 'vendor' && canPayVendor
      ? 'vendor'
      : canReceive
        ? 'receive'
        : 'vendor';

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
    </>
  );

  return mode === 'vendor' ? (
    <TravelVendorPaymentPage modeActions={modeActions} />
  ) : (
    <TravelReceivePaymentPage modeActions={modeActions} />
  );
};

export default TravelPaymentsPage;
