const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendInviteEmail = async (toEmail, code) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is missing");
    }

    const cleanEmail = String(toEmail || "")
      .trim()
      .toLowerCase();

    const cleanCode = String(code || "").trim();

    if (!cleanEmail || !cleanCode) {
      throw new Error("Email and invite code are required");
    }

    console.log("📧 Sending Smart Khata invite email to:", cleanEmail);

    const response = await resend.emails.send({
      from: "Smart Khata <noreply@smartkhataapp.uk>",
      to: cleanEmail,
      subject: "Your Smart Khata Invite Code",

      text: `
Smart Khata Invitation

You have been invited to create a Smart Khata account.

Your invite code is: ${cleanCode}

This code will expire in 24 hours.

If you were not expecting this invitation, you can safely ignore this email.
      `.trim(),

      html: `
        <!DOCTYPE html>
        <html>
          <body
            style="
              margin: 0;
              padding: 20px;
              background-color: #f3f4f6;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
            "
          >
            <div
              style="
                max-width: 480px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                border: 1px solid #e5e7eb;
              "
            >
              <div
                style="
                  background-color: #2563eb;
                  color: #ffffff;
                  text-align: center;
                  padding: 22px;
                "
              >
                <h2 style="margin: 0;">
                  SMART KHATA
                </h2>

                <p
                  style="
                    margin: 6px 0 0;
                    font-size: 13px;
                  "
                >
                  Account Invitation
                </p>
              </div>

              <div
                style="
                  padding: 28px 22px;
                  text-align: center;
                "
              >
                <p
                  style="
                    margin: 0;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #4b5563;
                  "
                >
                  You have been invited to create a Smart Khata account.
                  Use the invite code below during registration.
                </p>

                <div
                  style="
                    margin: 22px auto;
                    padding: 15px 20px;
                    background-color: #eff6ff;
                    border: 1px solid #bfdbfe;
                    border-radius: 10px;
                    max-width: 220px;
                  "
                >
                  <div
                    style="
                      font-size: 30px;
                      font-weight: bold;
                      letter-spacing: 6px;
                      color: #1d4ed8;
                    "
                  >
                    ${cleanCode}
                  </div>
                </div>

                <p
                  style="
                    margin: 0;
                    font-size: 14px;
                    color: #6b7280;
                  "
                >
                  This invite code will expire in
                  <strong>24 hours</strong>.
                </p>

                <p
                  style="
                    margin: 22px 0 0;
                    padding-top: 18px;
                    border-top: 1px solid #e5e7eb;
                    font-size: 12px;
                    line-height: 1.6;
                    color: #9ca3af;
                  "
                >
                  If you were not expecting this invitation,
                  you can safely ignore this email.
                </p>
              </div>

              <div
                style="
                  background-color: #f9fafb;
                  padding: 14px;
                  text-align: center;
                  font-size: 12px;
                  color: #9ca3af;
                "
              >
                Smart Khata
                <br />
                smartkhataapp.uk
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (response?.error) {
      console.error("❌ Resend Invite Error:", response.error);

      throw new Error(response.error.message || "Invite email sending failed");
    }

    console.log("✅ Smart Khata invite email sent successfully");

    return response;
  } catch (error) {
    console.error("❌ Invite Email Sending Error:", error.message);

    throw new Error("Invite email sending failed");
  }
};

module.exports = sendInviteEmail;
