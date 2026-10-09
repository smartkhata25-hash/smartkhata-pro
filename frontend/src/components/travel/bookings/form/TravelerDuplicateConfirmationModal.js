import React from 'react';
import { FaUserPlus } from 'react-icons/fa';

import { TravelActionButton } from '../../master/TravelMasterUI';

const TravelerDuplicateConfirmationModal = ({ open, travelerName, onCancel, onAddAgain }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="duplicate-traveler-title">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-cyan-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-gradient-to-r from-cyan-600 to-blue-700 px-5 py-4 text-white">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><FaUserPlus aria-hidden="true" /></span>
          <h2 id="duplicate-traveler-title" className="text-lg font-black">Traveler Already Selected</h2>
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold leading-6 text-slate-700">
            <span className="font-black text-slate-900">{travelerName}</span> is already selected in this item. Do you want to add this traveler again?
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <TravelActionButton variant="secondary" onClick={onCancel}>Cancel</TravelActionButton>
          <TravelActionButton onClick={onAddAgain}>Add Again</TravelActionButton>
        </div>
      </div>
    </div>
  );
};

export default TravelerDuplicateConfirmationModal;
