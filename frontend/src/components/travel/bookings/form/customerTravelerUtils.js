const getId = (value) => (typeof value === 'object' ? value?._id || value?.id : value) || '';

export const normalizeTravelerName = (value = '') =>
  String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const mergeActiveTravelers = (...groups) => {
  const records = new Map();

  groups.flat().forEach((record) => {
    const id = getId(record);
    if (!id || record?.isDeleted === true || record?.isActive === false) return;
    records.set(String(id), record);
  });

  return [...records.values()];
};

export const getCustomerLinkedTravelers = (travelers = [], customerId) => {
  const targetId = String(getId(customerId));
  if (!targetId) return [];

  return mergeActiveTravelers(travelers).filter(
    (traveler) => String(getId(traveler?.customerId)) === targetId
  );
};

export const getExactNameTravelers = (travelers = [], customerName = '') => {
  const normalizedName = normalizeTravelerName(customerName);
  if (!normalizedName) return [];

  return mergeActiveTravelers(travelers).filter(
    (traveler) => normalizeTravelerName(traveler?.fullName || traveler?.name) === normalizedName
  );
};

export const itemContainsTraveler = (item = {}, travelerId) =>
  (item.travelerIds || []).some((value) => String(getId(value)) === String(getId(travelerId)));

export const canUseCustomerAsTraveler = (formState = {}) =>
  formState.customerType === 'customer' && Boolean(getId(formState.customerId));

export const getSelectedCustomerTravelerId = ({
  item = {},
  customerId,
  resolvedTravelerId = '',
  travelers = [],
}) => {
  if (resolvedTravelerId && itemContainsTraveler(item, resolvedTravelerId)) {
    return getId(resolvedTravelerId);
  }

  const linkedTraveler = getCustomerLinkedTravelers(travelers, customerId).find((traveler) =>
    itemContainsTraveler(item, traveler._id)
  );

  return getId(linkedTraveler);
};

export const resolveCustomerTraveler = async ({
  customer,
  loadedTravelers = [],
  fetchTravelers,
  createTraveler,
  canCreate,
}) => {
  const customerId = getId(customer);
  const customerName = String(customer?.name || '').trim().replace(/\s+/g, ' ');

  if (!customerId) return { status: 'invalid-customer' };
  if (!customerName) return { status: 'invalid-name' };

  const linkedResults = await fetchTravelers(
    { customerId, status: 'active', limit: 500 },
    { forceRefresh: true }
  );
  const linkedMatches = getCustomerLinkedTravelers(
    mergeActiveTravelers(loadedTravelers, linkedResults),
    customerId
  );

  if (linkedMatches.length === 1) {
    return { status: 'resolved', traveler: linkedMatches[0], source: 'customer-link' };
  }
  if (linkedMatches.length > 1) {
    return { status: 'choose', matches: linkedMatches, source: 'customer-link' };
  }

  const nameResults = await fetchTravelers(
    { search: customerName, status: 'active', limit: 500 },
    { forceRefresh: true }
  );
  const exactMatches = getExactNameTravelers(
    mergeActiveTravelers(loadedTravelers, nameResults),
    customerName
  );

  if (exactMatches.length === 1) {
    return { status: 'resolved', traveler: exactMatches[0], source: 'exact-name' };
  }
  if (exactMatches.length > 1) {
    return { status: 'choose', matches: exactMatches, source: 'exact-name' };
  }
  if (!canCreate) return { status: 'forbidden' };

  const traveler = await createTraveler({ fullName: customerName, customerId });
  return { status: 'resolved', traveler, source: 'created' };
};
