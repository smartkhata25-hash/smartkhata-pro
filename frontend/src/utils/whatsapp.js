// 📁 src/utils/whatsapp.js

export const DEFAULT_WHATSAPP_TEMPLATES = {
  ur: `💰 ادائیگی یاد دہانی

السلام علیکم

محترم {{name}}

آپ کا بقایا:
Rs {{balance}}

براہ کرم جلد ادائیگی کریں۔

بھیجنے والا:
{{businessName}}`,
  en: `💰 PAYMENT REMINDER

Aslamoalaikum: {{name}},

Your Remaining balance is:
Rs {{balance}}

Please pay soon.

Sent by:
{{businessName}}`,
};

// ===============================
// ✅ PHONE FORMATTER (PRO LEVEL)
// ===============================
export const formatPhone = (phone) => {
  if (!phone) return '';

  let cleaned = String(phone).replace(/\D/g, '');

  if (cleaned.length < 10) return '';

  // 03001234567 → 923001234567
  if (cleaned.startsWith('03') && cleaned.length === 11) {
    return '92' + cleaned.slice(1);
  }

  // 3001234567 → 923001234567
  if (cleaned.length === 10 && cleaned.startsWith('3')) {
    return '92' + cleaned;
  }

  // already correct
  if (cleaned.startsWith('92') && cleaned.length >= 12) {
    return cleaned;
  }

  return '';
};

// ===============================
// ✅ CHECK VALID PHONE
// ===============================
export const isValidPhone = (phone) => {
  const formatted = formatPhone(phone);
  return formatted && formatted.length >= 12;
};

const getTemplateText = (template, lang = 'en') => {
  if (typeof template === 'string' && template.trim()) {
    return template;
  }

  if (template && typeof template === 'object') {
    if (lang === 'ur' && template.urduTemplate) {
      return template.urduTemplate;
    }

    if (template.englishTemplate) {
      return template.englishTemplate;
    }
  }

  return DEFAULT_WHATSAPP_TEMPLATES[lang === 'ur' ? 'ur' : 'en'];
};

export const applyReminderTemplate = (templateText, values = {}) =>
  String(templateText || '')
    .replace(/{{\s*name\s*}}/gi, values.name || '')
    .replace(/{{\s*balance\s*}}/gi, values.balance || '0')
    .replace(/{{\s*businessName\s*}}/gi, values.businessName || '');

// ===============================
// ✅ MESSAGE BUILDER
// ===============================
export const buildReminderMessage = ({
  customerName = '',
  balance = '0',
  businessName = '',
  lang = 'en',
  template = null,
}) => {
  const safeName = customerName || 'Customer';
  const safeBalance = balance || '0';

  return applyReminderTemplate(getTemplateText(template, lang), {
    name: safeName,
    balance: safeBalance,
    businessName: businessName || '',
  });
};

// ===============================
// ✅ ENCODE MESSAGE
// ===============================
export const encodeMessage = (message) => {
  if (!message) return '';
  return encodeURIComponent(message);
};

// ===============================
// ✅ GENERATE WHATSAPP LINK
// ===============================
export const generateWhatsAppLink = (phone, message) => {
  const formattedPhone = formatPhone(phone);

  if (!formattedPhone) return '';

  const encodedMessage = encodeMessage(message);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // 📱 Mobile → WhatsApp App
  if (isMobile) {
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  }

  // 💻 Desktop → WhatsApp Web
  return `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;
};

// ===============================
// ✅ MAIN FUNCTION
// ===============================
export const sendWhatsAppReminder = ({
  phone,
  customerName,
  balance,
  businessName,
  lang,
  template = null,
}) => {
  const formattedPhone = formatPhone(phone);

  // ❌ invalid phone
  if (!formattedPhone) return;

  const message = buildReminderMessage({
    customerName,
    balance,
    businessName,
    lang,
    template,
  });

  const link = generateWhatsAppLink(formattedPhone, message);

  if (!link) return;

  // 🚀 OPEN WHATSAPP
  window.open(link, '_blank');
};
