import React from 'react';

import BusinessValuePage from '../BusinessValuePage';
import { BUSINESS_VALUE_MODULE_SCOPES } from '../../services/businessValueService';

const TravelBusinessValuePage = () => (
  <BusinessValuePage moduleScope={BUSINESS_VALUE_MODULE_SCOPES.TRAVEL} />
);

export default TravelBusinessValuePage;
