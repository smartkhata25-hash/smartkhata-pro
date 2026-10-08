import React from 'react';
import { FaUser } from 'react-icons/fa';
import { TravelFormModal } from '../master/TravelMasterUI';
import { travelerFields } from './travelTravelerFormConfig';

const TravelTravelerFormModal = ({ editingTraveler = null, ...props }) => (
  <TravelFormModal
    {...props}
    titleKey="travel.travelers.formTitle"
    modeKey={editingTraveler ? 'travel.common.edit' : 'travel.common.addWithDetails'}
    fields={travelerFields}
    submitIcon={FaUser}
  />
);

export default TravelTravelerFormModal;
