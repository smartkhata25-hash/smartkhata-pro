import { formatPhone, buildReminderMessage } from './whatsapp';
import { sharePdfDocument } from './documentShare';

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const sendPdfToWhatsApp = async ({
  phone,
  customerName,
  balance,
  businessName,
  mobile,
  lang,
  pdfUrl,
  token,
  preferredApp = 'whatsapp',
}) => {
  void preferredApp;

  const formattedPhone = formatPhone(phone);

  if (!formattedPhone) {
    alert('Invalid phone number');
    return;
  }

  const message = buildReminderMessage({
    customerName,
    balance,
    businessName,
    mobile,
    lang,
  });

  const encodedMessage = encodeURIComponent(message);
  const whatsappLink = isMobileDevice()
    ? `https://wa.me/${formattedPhone}?text=${encodedMessage}`
    : `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;

  try {
    const fileName = `${customerName || 'ledger'}.pdf`;

    await sharePdfDocument({
      pdfUrl,
      token,
      fileName,
      title: fileName,
      text: message,
      fallbackTextUrl: whatsappLink,
      openFallbackText: true,
    });
  } catch (err) {
    console.error(err);
    alert('PDF generate failed');
  }
};
