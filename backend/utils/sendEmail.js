const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (toEmail, code) => {
  try {
    // 🔍 DEBUG: check API key
    console.log(
      "🔑 RESEND API KEY:",
      process.env.RESEND_API_KEY ? "Loaded ✅" : "Missing ❌",
    );

    // 🔍 DEBUG: email info
    console.log("📧 Sending email to:", toEmail);
    console.log("🔢 Code:", code);

    // 🚀 Send email
    const response = await resend.emails.send({
      from: "Smart Khata <onboarding@resend.dev>",
      to: toEmail,
      subject: "Smart Khata Invite Code",
      html: `<p>Your verification code is: <b>${code}</b></p>`,
    });

    // 🔍 DEBUG: success response
    console.log("✅ Email sent successfully");
    console.log("📦 Resend Response:", response);

    return response;
  } catch (error) {
    // ❌ FULL ERROR DEBUG
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
