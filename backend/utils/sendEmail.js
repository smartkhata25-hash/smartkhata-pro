const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (toEmail, code) => {
  try {
    await resend.emails.send({
      from: "Smart Khata <onboarding@resend.dev>",
      to: toEmail,
      subject: "Smart Khata Invite Code",
      html: `<p>Your verification code is: <b>${code}</b></p>`,
    });
  } catch (error) {
    console.error("❌ Email Error FULL:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      response: error.response?.data || null,
    });

    throw new Error("Email sending failed");
  }
};

module.exports = sendEmail;
