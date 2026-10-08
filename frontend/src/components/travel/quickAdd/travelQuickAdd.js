export const trimQuickAddQuery = (query) => String(query || '').trim();

export const createBookingCustomerQuick = async ({ query, customers = [], createCustomer, fetchCustomers }) => {
  const name = trimQuickAddQuery(query);
  if (!name) return null;
  const response = await createCustomer({ name, moduleScope: 'travel' });
  if (!response?.duplicate) return response;
  const duplicateId = response.customerId || response._id;
  let existing = customers.find((customer) => String(customer?._id) === String(duplicateId));
  if (!existing && fetchCustomers) {
    const refreshed = await fetchCustomers({}, { forceRefresh: true });
    existing = (refreshed || []).find((customer) => String(customer?._id) === String(duplicateId));
  }
  return existing || null;
};

export const createBookingTravelerQuick = async ({ query, createTraveler }) => {
  const fullName = trimQuickAddQuery(query);
  return fullName ? createTraveler({ fullName }) : null;
};

export const createBookingVendorQuick = async ({ query, createVendor }) => {
  const name = trimQuickAddQuery(query);
  return name ? createVendor({ name, moduleScope: 'travel' }) : null;
};

export const createUmrahHotelQuick = async ({ query, city, createHotel }) => {
  const name = trimQuickAddQuery(query);
  return name ? createHotel({ name, city }) : null;
};
