const PREFIX = 'weaving_commercial_meta_cache_v1';
const SECTIONS = ['parties', 'yarns', 'items', 'godowns', 'looms', 'contracts', 'paymentAccounts', 'debitAccounts'];

const scope = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.businessOwnerId || user.businessOwner || user.ownerId || user._id || user.id || localStorage.getItem('userId') || 'anonymous';
  } catch (error) {
    return localStorage.getItem('userId') || 'anonymous';
  }
};
const key = () => `${PREFIX}:${scope()}`;
const read = () => { try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch (error) { return null; } };
const write = (value) => { try { localStorage.setItem(key(), JSON.stringify(value)); } catch (error) { /* storage is optional */ } };

export const getCachedCommercialMeta = () => read()?.data || null;
export const getCachedCommercialVersions = () => read()?.versions || {};
export const setCachedCommercialMeta = (data, versions) => write({ data, versions, savedAt: Date.now() });
export const invalidateCommercialSections = (...sections) => {
  const cached = read(); if (!cached) return;
  sections.forEach((section) => { if (SECTIONS.includes(section)) delete cached.versions?.[section]; });
  write(cached);
};
export const commercialVersionsMatch = (server = {}, cached = {}) => SECTIONS.every((section) => server[section] && server[section] === cached[section]);
