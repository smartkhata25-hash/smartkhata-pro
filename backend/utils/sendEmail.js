const nodemailer = require("nodemailer");

const sendEmail = async (toEmail, code) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: "Smart Khata Invite Code",
      text: `Your verification code is: ${code}`,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Email Error:", error);
  }
};

module.exports = sendEmail;
