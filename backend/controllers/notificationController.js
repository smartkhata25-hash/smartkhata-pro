const Notification = require("../models/Notification");

/* ================= SEND NOTIFICATION (ADMIN) ================= */

const sendNotification = async (req, res) => {
  try {
    const { message, userId, type } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ msg: "Message is required" });
    }

    const notification = await Notification.create({
      message,
      userId: userId || null, // null = all users
      type: type || "info",
    });

    res.json({
      msg: "Notification sent successfully",
      notification,
    });
  } catch (err) {
    console.error("Send Notification Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ================= GET MY NOTIFICATIONS ================= */

const getMyNotifications = async (req, res) => {
  try {
    const userId = req.userId;

    const notifications = await Notification.find({
      $or: [{ userId: null }, { userId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(notifications);
  } catch (err) {
    console.error("Fetch Notification Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ================= MARK AS SEEN ================= */

const markAsSeen = async (req, res) => {
  try {
    const userId = req.userId;

    await Notification.updateMany(
      {
        $or: [{ userId: null }, { userId: userId }],
        seenBy: { $ne: userId },
      },
      {
        $push: { seenBy: userId },
      },
    );

    res.json({ msg: "Marked as seen" });
  } catch (err) {
    console.error("Mark Seen Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = {
  sendNotification,
  getMyNotifications,
  markAsSeen,
};
