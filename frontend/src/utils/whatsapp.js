// 📁 src/utils/whatsapp.js

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

// ===============================
// ✅ MESSAGE BUILDER
// ===============================
export const buildReminderMessage = ({
  customerName = '',
  balance = '0',
  businessName = '',
  mobile = '',
  lang = 'en',
}) => {
  const safeName = customerName || 'Customer';
  const safeBalance = balance || '0';

  if (lang === 'ur') {
    return `السلام علیکم

محترم ${safeName}

آپ کا بقایا:
Rs ${safeBalance}

براہ کرم جلد ادائیگی کریں۔

شکریہ
${businessName || ''}
${mobile || ''}`;
  }

  return `Hello ${safeName},

Your outstanding balance is:
Rs ${safeBalance}

Please make the payment at your earliest convenience.

Thank you
${businessName || ''}
${mobile || ''}`;
};

// ===============================
// ✅ ENCODE MESSAGE
// ===============================
export const encodeMessage = (message) => {
  if (!message) return '';
  return encodeURIComponent(message);
};

// ===============================
// ✅ GENERATE WHATSAPP LINK (SMART)
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
// ✅ MAIN FUNCTION (FINAL)
// ===============================
export const sendWhatsAppReminder = ({
  phone,
  customerName,
  balance,
  businessName,
  mobile,
  lang,
}) => {
  const formattedPhone = formatPhone(phone);

  // ❌ invalid → کچھ نہ کرو
  if (!formattedPhone) return;

  const message = buildReminderMessage({
    customerName,
    balance,
    businessName,
    mobile,
    lang,
  });

  const link = generateWhatsAppLink(formattedPhone, message);

  if (!link) return;

  // 🔥 SAME TAB reuse (important fix)
  window.open(link, '_blank');
};
