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
    console.error("Email Error:", error);
    throw error; // ⚠️ important
  }
};

module.exports = sendEmail;
