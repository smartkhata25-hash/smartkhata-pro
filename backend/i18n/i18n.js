const en = require("./en.json");
const ur = require("./ur.json");

const translations = {
  en,
  ur,
};

const t = (key, lang = "ur") => {
  const langPack = translations[lang] || translations.en;

  return langPack[key] || key;
};

module.exports = {
  t,
};
