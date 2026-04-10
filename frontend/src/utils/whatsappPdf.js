import { formatPhone, buildReminderMessage } from './whatsapp';

// ===============================
// ✅ DEVICE CHECK
// ===============================
const isMobileDevice = () => {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

// ===============================
// ✅ SHARE SUPPORT CHECK
// ===============================
const canShareFiles = (file) => {
  return navigator.share && navigator.canShare && navigator.canShare({ files: [file] });
};

// ===============================
// ✅ MAIN FUNCTION (FINAL PRO)
// ===============================
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
  const formattedPhone = formatPhone(phone);

  if (!formattedPhone) {
    alert('Invalid phone number');
    return;
  }

  // 🧾 Message
  const message = buildReminderMessage({
    customerName,
    balance,
    businessName,
    mobile,
    lang,
  });

  const encodedMessage = encodeURIComponent(message);

  // 📱 Device detect
  const isMobile = isMobileDevice();

  // 🔗 WhatsApp link (fallback use)
  const whatsappLink = isMobile
    ? `https://wa.me/${formattedPhone}?text=${encodedMessage}`
    : `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;

  try {
    // ===============================
    // 📄 STEP 1: Fetch PDF
    // ===============================
    const response = await fetch(pdfUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('PDF fetch failed');
    }

    const blob = await response.blob();

    // ===============================
    // 📁 STEP 2: Convert to File
    // ===============================
    const fileName = `${customerName || 'ledger'}.pdf`;

    const pdfFile = new File([blob], fileName, {
      type: 'application/pdf',
    });

    // ===============================
    // 🚀 STEP 3: MOBILE SHARE (MAIN MAGIC)
    // ===============================
    if (isMobile && canShareFiles(pdfFile)) {
      try {
        await navigator.share({
          files: [pdfFile],
          text: message,
          title: fileName,
        });

        return; // ✅ Done (no fallback needed)
      } catch (shareError) {
        // ❗ User cancelled → silent fallback
        console.warn('Share cancelled or failed', shareError);
      }
    }

    // ===============================
    // 💻 STEP 4: FALLBACK (DESKTOP / OLD MOBILE)
    // ===============================

    // 📥 Download PDF
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    // 📲 Open WhatsApp
    window.open(whatsappLink, '_blank');
  } catch (err) {
    console.error(err);
    alert('PDF generate failed');
  }
};
