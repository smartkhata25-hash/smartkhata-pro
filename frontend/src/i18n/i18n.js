import en from './en.json';
import ur from './ur.json';

const translations = {
  en,
  ur,
};

export const getCurrentLanguage = () => {
  return localStorage.getItem('lang') || 'en';
};

export const setLanguage = (lang) => {
  localStorage.setItem('lang', lang);
};

export const t = (key) => {
  const lang = getCurrentLanguage();
  const langPack = translations[lang] || translations.en;

  return langPack[key] || key;
};
