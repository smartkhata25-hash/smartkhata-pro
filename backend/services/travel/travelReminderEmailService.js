const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const escapeHtml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const buildEmailHtml = ({
  customerName,
  bookingNumber,
  eventType,
  eventDate,
  eventTime,
  businessName,
}) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:20px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#0891b2;color:#ffffff;padding:20px;">
        <h2 style="margin:0;font-size:20px;">${escapeHtml(businessName)}</h2>
        <p style="margin:6px 0 0;font-size:13px;">Travel Reminder</p>
      </div>
      <div style="padding:22px;">
        <p style="margin:0 0 14px;">Assalamualaikum ${escapeHtml(customerName)},</p>
        <p style="margin:0 0 16px;line-height:1.6;">
          This is a reminder for booking <strong>${escapeHtml(bookingNumber)}</strong>.
        </p>
        <div style="border:1px solid #cffafe;background:#ecfeff;border-radius:10px;padding:14px;margin:0 0 16px;">
          <p style="margin:0 0 6px;font-size:13px;color:#475569;">Event</p>
          <p style="margin:0;font-size:18px;font-weight:bold;">${escapeHtml(eventType)}</p>
          <p style="margin:8px 0 0;color:#0f766e;font-weight:bold;">
            ${escapeHtml(eventDate)} ${escapeHtml(eventTime)}
          </p>
        </div>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">
          Please contact ${escapeHtml(businessName)} if you need any change or confirmation.
        </p>
      </div>
    </div>
  </body>
</html>
`;

const sendTravelReminderEmail = async ({
  toEmail,
  customerName,
  bookingNumber,
  eventType,
  eventDate,
  eventTime,
  businessName,
}) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing");
  }

  const cleanEmail = String(toEmail || "")
    .trim()
    .toLowerCase();

  if (!cleanEmail) {
    throw new Error("Customer email is missing");
  }

  const from =
    process.env.TRAVEL_REMINDER_EMAIL_FROM ||
    "Smart Khata <noreply@smartkhataapp.uk>";

  const subject = `Travel reminder: ${bookingNumber || "Booking"}`;

  const text = [
    `Assalamualaikum ${customerName || "Customer"},`,
    "",
    `This is a reminder for booking ${bookingNumber || "-"}.`,
    `${eventType || "Travel event"}: ${eventDate || "-"} ${eventTime || ""}`.trim(),
    "",
    `Sent by: ${businessName || "Smart Khata"}`,
  ].join("\n");

  const response = await resend.emails.send({
    from,
    to: cleanEmail,
    subject,
    text,
    html: buildEmailHtml({
      customerName,
      bookingNumber,
      eventType,
      eventDate,
      eventTime,
      businessName,
    }),
  });

  if (response?.error) {
    throw new Error(response.error.message || "Email sending failed");
  }

  return response;
};

module.exports = {
  sendTravelReminderEmail,
};
