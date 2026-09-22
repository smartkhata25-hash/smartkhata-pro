export const WEAVING_MODULE_SCOPE = 'weaving';

export const isWeavingContext = (location = {}) => {
  const pathname = typeof location === 'string' ? location : location?.pathname || '';
  const search = typeof location === 'string' ? '' : location?.search || '';
  const state = typeof location === 'string' ? null : location?.state || null;

  if (pathname.startsWith('/weaving')) {
    return true;
  }

  try {
    if (new URLSearchParams(search).get('moduleScope') === WEAVING_MODULE_SCOPE) {
      return true;
    }
  } catch {
    return false;
  }

  return (
    state?.moduleScope === WEAVING_MODULE_SCOPE ||
    state?.fromModule === WEAVING_MODULE_SCOPE ||
    state?.weavingContext === true
  );
};

export const buildWeavingRouteState = (returnTo = '/weaving/dashboard') => ({
  moduleScope: WEAVING_MODULE_SCOPE,
  fromModule: WEAVING_MODULE_SCOPE,
  weavingContext: true,
  returnTo,
});
