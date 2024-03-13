const express = require("express");
const router = express.Router();
const notificationQueries = require("../queries/notificationQueries"); // Update with the correct path
const {
  checkAuthenticated,
  checkNotAuthenticated,
} = require("../middleware/authMiddleware");

// Get all unread notifications for a user
router.get("/unread/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const notifications = await notificationQueries.getUnreadNotifications(
      userId
    );
    res.json(notifications);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get all notifications for a user
router.get("/all/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const notifications = await notificationQueries.getAllNotifications(userId);
    res.json(notifications);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/read/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const notifications = await notificationQueries.getReadNotifications(
      userId
    );
    res.json(notifications);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/", checkAuthenticated, async (req, res) => {
  try {
    res.render("notifications.ejs", { user: req.user });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Mark a notification as read
router.put("/markAsRead/:notificationId", async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    await notificationQueries.markAsRead(notificationId);
    res.send("Notification marked as read");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Create a new notification
router.post("/create", async (req, res) => {
  try {
    const { userId, type, message } = req.body;
    await notificationQueries.createNotification(userId, type, message);
    res.send("Notification created");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete a notification
router.delete("/:notificationId", async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    await notificationQueries.markAsRead(notificationId);
    res.send("Notification deleted");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/:userId/unread-count", checkAuthenticated, async (req, res) => {
  try {
    const userId = req.params.userId;
    const count = await notificationQueries.getUnreadNotificationCount(userId);
    res.json({ count });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Mark all notifications as read for a user
router.put("/markAllAsRead/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    await notificationQueries.markAllAsRead(userId);
    res.send("All notifications marked as read");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
