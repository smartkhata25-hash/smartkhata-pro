export const TRAVEL_MODULE_SCOPE = 'travel';

export const isTravelContext = (location = {}) => {
  const pathname = typeof location === 'string' ? location : location?.pathname || '';
  const search = typeof location === 'string' ? '' : location?.search || '';
  const state = typeof location === 'string' ? null : location?.state || null;

  if (pathname.startsWith('/travel')) {
    return true;
  }

  try {
    if (new URLSearchParams(search).get('moduleScope') === TRAVEL_MODULE_SCOPE) {
      return true;
    }
  } catch {
    return false;
  }

  return (
    state?.moduleScope === TRAVEL_MODULE_SCOPE ||
    state?.fromModule === TRAVEL_MODULE_SCOPE ||
    state?.travelContext === true
  );
};

export const buildTravelRouteState = (returnTo = '/travel/dashboard') => ({
  moduleScope: TRAVEL_MODULE_SCOPE,
  fromModule: TRAVEL_MODULE_SCOPE,
  travelContext: true,
  returnTo,
});
