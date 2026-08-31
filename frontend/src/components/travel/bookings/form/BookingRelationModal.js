import React from 'react';

import { TravelFormModal, TravelRelationPicker } from '../../master/TravelMasterUI';

const BookingRelationModal = ({
  modal,
  modalFields,
  modalValues,
  categories,
  submitting,
  error,
  onChange,
  onClose,
  onSubmit,
  onQuickAddCategory,
}) => (
  <TravelFormModal
    open={Boolean(modal)}
    titleKey={modal ? `travel.booking.modal.${modal.type}` : 'travel.common.add'}
    modeKey={modal?.mode === 'details' ? 'travel.common.addWithDetails' : 'travel.common.quickAdd'}
    fields={modalFields}
    values={modalValues}
    onChange={onChange}
    onClose={onClose}
    onSubmit={onSubmit}
    submitting={submitting}
    error={error}
  >
    {modal?.type === 'service' && (
      <TravelRelationPicker
        labelKey="travel.fields.category"
        value={modalValues.categoryId}
        onChange={(value) => onChange('categoryId', value)}
        records={categories.filter((category) => category.isActive !== false)}
        getLabel={(category) => category.name}
        getMeta={(category) => category.code || category.description}
        searchPlaceholderKey="travel.services.categorySearch"
        emptyKey="travel.services.emptyCategories"
        onQuickAdd={onQuickAddCategory}
      />
    )}
  </TravelFormModal>
);

export default BookingRelationModal;
