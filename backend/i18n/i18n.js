const en = require("./en.json");
const ur = require("./ur.json");

const translations = {
  en,
  ur,
};

const getCurrentLanguage = () => {
  return process.env.DEFAULT_LANG || "ur";
};

const t = (key) => {
  const lang = getCurrentLanguage();

  const langPack = translations[lang] || translations.en;

  return langPack[key] || key;
};

module.exports = {
  t,
};
