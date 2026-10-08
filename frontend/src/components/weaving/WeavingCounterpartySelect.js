import React, { useMemo, useState } from 'react';

import { hasPermission } from '../../utils/permissionHelper';
import SearchableCreatableSelect from './SearchableCreatableSelect';
import WeavingCounterpartyFormModal, {
  normalizeCounterpartyName,
} from './WeavingCounterpartyFormModal';

const isSizingParty = (party) => party?.serviceTypes?.includes('sizing');

export const isCounterpartyEligible = (party, context) => {
  if (!party || party.isActive === false || party.isHidden) return false;
  if (context === 'sizing') return isSizingParty(party);
  if (isSizingParty(party)) return false;
  if (context === 'customer') return party.role === 'customer' || party.role === 'both';
  return party.role === 'supplier' || party.role === 'both';
};

export const filterCounterparties = (parties = [], context = 'supplier', selectedId = '') =>
  parties.filter(
    (party) =>
      isCounterpartyEligible(party, context) ||
      (selectedId && String(party?._id) === String(selectedId))
  );

const contextConfig = {
  customer: {
    initialType: 'customer',
    allowedTypes: ['customer', 'both'],
    label: (name) => `Add Customer / Party “${name}”`,
  },
  supplier: {
    initialType: 'supplier',
    allowedTypes: ['supplier', 'both'],
    label: (name) => `Add Supplier / Party “${name}”`,
  },
  sizing: {
    initialType: 'sizing',
    allowedTypes: ['sizing'],
    label: (name) => `Add Sizing Party “${name}”`,
  },
};

export default function WeavingCounterpartySelect({
  parties = [],
  context = 'supplier',
  value,
  onChange,
  onPartySaved,
  onError,
  ...selectProps
}) {
  const [draftName, setDraftName] = useState('');
  const config = contextConfig[context] || contextConfig.supplier;
  const canCreate = hasPermission('weaving.counterparties.create');
  const canEdit = hasPermission('weaving.counterparties.edit');
  const options = useMemo(
    () => filterCounterparties(parties, context, value),
    [context, parties, value]
  );

  const exactParty = (name) => {
    const normalized = normalizeCounterpartyName(name);
    return parties.find(
      (party) =>
        party.isActive !== false &&
        !party.isHidden &&
        normalizeCounterpartyName(party.name) === normalized
    );
  };

  return (
    <>
      <SearchableCreatableSelect
        {...selectProps}
        options={options}
        value={value}
        onChange={onChange}
        onAddDetails={(name) => setDraftName(name)}
        canAddDetails={(name) => (exactParty(name) ? canEdit : canCreate)}
        addDetailsLabel={config.label}
      />

      {draftName && (
        <WeavingCounterpartyFormModal
          initialName={draftName}
          initialType={config.initialType}
          allowedTypes={config.allowedTypes}
          launchContext={context}
          canCreate={canCreate}
          canEdit={canEdit}
          onError={onError}
          onClose={() => setDraftName('')}
          onSaved={async (saved) => {
            await onPartySaved?.(saved);
            onChange(saved._id, saved);
          }}
        />
      )}
    </>
  );
}
