import React from 'react';
import { FaEdit, FaUserPlus } from 'react-icons/fa';
import { TravelFormModal } from '../master/TravelMasterUI';
import { customerFields } from './travelCustomerFormConfig';

const TravelCustomerFormModal = ({ editingCustomer = null, ...props }) => (
  <TravelFormModal
    {...props}
    titleKey="travel.customers.formTitle"
    modeKey={editingCustomer ? 'travel.common.edit' : 'travel.common.addWithDetails'}
    fields={customerFields}
    submitIcon={editingCustomer ? FaEdit : FaUserPlus}
  />
);

export default TravelCustomerFormModal;
