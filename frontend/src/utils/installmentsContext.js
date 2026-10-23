export const isInstallmentsContext = (location = {}) =>
  String(location?.pathname || '').startsWith('/installments');

