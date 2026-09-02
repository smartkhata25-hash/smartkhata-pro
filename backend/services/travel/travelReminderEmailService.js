const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const escapeHtml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const safeValue = (value, fallback = "-") => {
  const cleaned = String(value || "").trim();
  return cleaned || fallback;
};

const buildEmailHtml = ({
  customerName,
  bookingNumber,
  eventType,
  eventDate,
  eventTime,
  businessName,
}) => {
  const cleanCustomerName = escapeHtml(safeValue(customerName, "Customer"));
  const cleanBookingNumber = escapeHtml(safeValue(bookingNumber));
  const cleanEventType = escapeHtml(safeValue(eventType, "Travel Event"));
  const cleanEventDate = escapeHtml(safeValue(eventDate));
  const cleanEventTime = escapeHtml(safeValue(eventTime));
  const cleanBusinessName = escapeHtml(safeValue(businessName, "Smart Khata"));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>Travel Reminder</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f1f5f9;
    font-family:Arial,Helvetica,sans-serif;
    color:#0f172a;
  "
>
  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="
      width:100%;
      margin:0;
      padding:0;
      background:#f1f5f9;
    "
  >
    <tr>
      <td
        align="center"
        style="
          padding:32px 14px;
        "
      >
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            width:100%;
            max-width:620px;
            background:#ffffff;
            border-radius:20px;
            overflow:hidden;
            border:1px solid #dbeafe;
            box-shadow:0 12px 35px rgba(15,23,42,0.10);
          "
        >

          <!-- HEADER -->
          <tr>
            <td
              style="
                padding:0;
                background:#0e7490;
              "
            >
              <div
                style="
                  padding:30px 28px;
                  background:linear-gradient(
                    135deg,
                    #0e7490 0%,
                    #0891b2 45%,
                    #2563eb 100%
                  );
                  color:#ffffff;
                "
              >
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>
                    <td>
                      <div
                        style="
                          display:inline-block;
                          margin-bottom:14px;
                          padding:7px 12px;
                          border-radius:999px;
                          background:rgba(255,255,255,0.16);
                          border:1px solid rgba(255,255,255,0.24);
                          font-size:11px;
                          line-height:1;
                          font-weight:700;
                          letter-spacing:0.8px;
                          text-transform:uppercase;
                          color:#ffffff;
                        "
                      >
                        ✈ Travel Reminder
                      </div>

                      <h1
                        style="
                          margin:0;
                          padding:0;
                          font-size:26px;
                          line-height:1.25;
                          font-weight:800;
                          color:#ffffff;
                        "
                      >
                        ${cleanBusinessName}
                      </h1>

                      <p
                        style="
                          margin:8px 0 0;
                          padding:0;
                          font-size:14px;
                          line-height:1.6;
                          color:#cffafe;
                        "
                      >
                        Your upcoming journey is getting closer.
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td
              style="
                padding:28px;
                background:#ffffff;
              "
            >
              <p
                style="
                  margin:0 0 10px;
                  padding:0;
                  font-size:18px;
                  line-height:1.5;
                  font-weight:700;
                  color:#0f172a;
                "
              >
                Assalamualaikum ${cleanCustomerName},
              </p>

              <p
                style="
                  margin:0 0 24px;
                  padding:0;
                  font-size:14px;
                  line-height:1.8;
                  color:#475569;
                "
              >
                This is a friendly reminder regarding your upcoming travel
                booking. Please review the details below and make sure
                everything is ready for your journey.
              </p>

              <!-- BOOKING NUMBER -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  margin:0 0 18px;
                  border-collapse:separate;
                  border-spacing:0;
                "
              >
                <tr>
                  <td
                    style="
                      padding:15px 17px;
                      border:1px solid #dbeafe;
                      border-radius:12px;
                      background:#eff6ff;
                    "
                  >
                    <div
                      style="
                        margin-bottom:5px;
                        font-size:10px;
                        line-height:1.4;
                        font-weight:700;
                        letter-spacing:1px;
                        text-transform:uppercase;
                        color:#64748b;
                      "
                    >
                      Booking Number
                    </div>

                    <div
                      style="
                        font-size:17px;
                        line-height:1.4;
                        font-weight:800;
                        color:#1d4ed8;
                      "
                    >
                      ${cleanBookingNumber}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- EVENT CARD -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  margin:0 0 22px;
                  border-collapse:separate;
                  border-spacing:0;
                "
              >
                <tr>
                  <td
                    style="
                      padding:20px;
                      border:1px solid #bae6fd;
                      border-radius:16px;
                      background:#ecfeff;
                    "
                  >
                    <div
                      style="
                        margin-bottom:6px;
                        font-size:10px;
                        line-height:1.4;
                        font-weight:700;
                        letter-spacing:1px;
                        text-transform:uppercase;
                        color:#0891b2;
                      "
                    >
                      Upcoming Event
                    </div>

                    <div
                      style="
                        margin-bottom:17px;
                        font-size:21px;
                        line-height:1.4;
                        font-weight:800;
                        color:#0f172a;
                      "
                    >
                      ${cleanEventType}
                    </div>

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                    >
                      <tr>
                        <td
                          width="50%"
                          valign="top"
                          style="
                            padding-right:6px;
                          "
                        >
                          <div
                            style="
                              padding:12px;
                              border-radius:10px;
                              background:#ffffff;
                              border:1px solid #cffafe;
                            "
                          >
                            <div
                              style="
                                margin-bottom:4px;
                                font-size:10px;
                                line-height:1.4;
                                font-weight:700;
                                text-transform:uppercase;
                                letter-spacing:0.8px;
                                color:#64748b;
                              "
                            >
                              Date
                            </div>

                            <div
                              style="
                                font-size:14px;
                                line-height:1.4;
                                font-weight:800;
                                color:#0f766e;
                              "
                            >
                              ${cleanEventDate}
                            </div>
                          </div>
                        </td>

                        <td
                          width="50%"
                          valign="top"
                          style="
                            padding-left:6px;
                          "
                        >
                          <div
                            style="
                              padding:12px;
                              border-radius:10px;
                              background:#ffffff;
                              border:1px solid #cffafe;
                            "
                          >
                            <div
                              style="
                                margin-bottom:4px;
                                font-size:10px;
                                line-height:1.4;
                                font-weight:700;
                                text-transform:uppercase;
                                letter-spacing:0.8px;
                                color:#64748b;
                              "
                            >
                              Time
                            </div>

                            <div
                              style="
                                font-size:14px;
                                line-height:1.4;
                                font-weight:800;
                                color:#0f766e;
                              "
                            >
                              ${cleanEventTime}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- TRAVEL NOTICE -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  margin:0 0 22px;
                  border-collapse:separate;
                  border-spacing:0;
                "
              >
                <tr>
                  <td
                    style="
                      padding:16px 18px;
                      border-left:4px solid #0ea5e9;
                      background:#f0f9ff;
                      border-radius:8px;
                    "
                  >
                    <div
                      style="
                        margin-bottom:5px;
                        font-size:13px;
                        line-height:1.5;
                        font-weight:800;
                        color:#0369a1;
                      "
                    >
                      Travel Notice
                    </div>

                    <div
                      style="
                        font-size:13px;
                        line-height:1.7;
                        color:#475569;
                      "
                    >
                      Please keep your required travel documents, tickets and
                      booking information ready before departure.
                    </div>
                  </td>
                </tr>
              </table>

              <p
                style="
                  margin:0;
                  padding:0;
                  font-size:13px;
                  line-height:1.8;
                  color:#64748b;
                "
              >
                If you need any change, confirmation or assistance regarding
                this booking, please contact
                <strong style="color:#0f172a;">
                  ${cleanBusinessName}
                </strong>.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              style="
                padding:22px 28px;
                background:#0f172a;
                text-align:center;
              "
            >
              <p
                style="
                  margin:0 0 6px;
                  padding:0;
                  font-size:13px;
                  line-height:1.5;
                  font-weight:700;
                  color:#ffffff;
                "
              >
                ${cleanBusinessName}
              </p>

              <p
                style="
                  margin:0;
                  padding:0;
                  font-size:11px;
                  line-height:1.6;
                  color:#94a3b8;
                "
              >
                Automated Travel Reminder powered by Smart Khata
              </p>

              <p
                style="
                  margin:8px 0 0;
                  padding:0;
                  font-size:10px;
                  line-height:1.5;
                  color:#64748b;
                "
              >
                This email was generated automatically for booking
                ${cleanBookingNumber}.
              </p>
            </td>
          </tr>

        </table>

        <p
          style="
            margin:14px 0 0;
            padding:0;
            text-align:center;
            font-size:10px;
            line-height:1.5;
            color:#94a3b8;
          "
        >
          Please do not reply to this automated reminder unless your travel
          provider has instructed otherwise.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>
`;
};

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

  const safeBookingNumber = safeValue(bookingNumber, "Booking");
  const safeCustomerName = safeValue(customerName, "Customer");
  const safeEventType = safeValue(eventType, "Travel Event");
  const safeEventDate = safeValue(eventDate);
  const safeEventTime = safeValue(eventTime);
  const safeBusinessName = safeValue(businessName, "Smart Khata");

  const subject = `✈ Travel Reminder | ${safeBookingNumber}`;

  const text = [
    `Assalamualaikum ${safeCustomerName},`,
    "",
    "This is a friendly reminder regarding your upcoming travel booking.",
    "",
    `Booking Number: ${safeBookingNumber}`,
    `Event: ${safeEventType}`,
    `Date: ${safeEventDate}`,
    `Time: ${safeEventTime}`,
    "",
    "Please keep your required travel documents, tickets and booking information ready before departure.",
    "",
    `If you need any change, confirmation or assistance, please contact ${safeBusinessName}.`,
    "",
    `Sent by: ${safeBusinessName}`,
    "Powered by Smart Khata",
  ].join("\n");

  const response = await resend.emails.send({
    from,
    to: cleanEmail,
    subject,
    text,
    html: buildEmailHtml({
      customerName: safeCustomerName,
      bookingNumber: safeBookingNumber,
      eventType: safeEventType,
      eventDate: safeEventDate,
      eventTime: safeEventTime,
      businessName: safeBusinessName,
    }),
  });

  if (response?.error) {
    throw new Error(
      response.error.message || "Travel reminder email sending failed",
    );
  }

  return response;
};

module.exports = {
  sendTravelReminderEmail,
};
