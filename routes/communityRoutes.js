const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { checkAuthenticated } = require("../middleware/authMiddleware");
const communityQueries = require("../queries/communityQueries");

router.get("/:communityId", async (req, res) => {
  const communityId = parseInt(req.params.communityId, 10); // Convert to integer
  if (isNaN(communityId)) {
    return res.status(400).send("Invalid community ID"); // Handle invalid IDs
  }

  try {
    const community =
      await sql.query`SELECT * FROM communities WHERE id = ${communityId}`;

    // if no community was found, return a
    if (!community.recordset[0]) {
      return res.render("error.ejs", {
        user: req.user,
        error: { message: "That community was not found." },
      });
    }

    // if community is private, return error page with message
    if (community.recordset[0].PrivacySetting === "Private") {
      return res.render("error.ejs", {
        user: req.user,
        error: { message: "That community is private." },
      });
    }

    res.render("communities.ejs", {
      user: req.user,
      community: community.recordset[0],
      communityId: communityId,
      communityPostCount: await communityQueries.getCommunityPostCount(
        communityId
      ),
    });
  } catch (err) {
    return res.render("error.ejs", {
      user: req.user,
      error: { message: "Error fetching community" },
    });
  }
});

router.get(
  "/:communityId/isMember",
  checkAuthenticated,
  async (req, res) => {
    const userId = req.user.id; // Assuming req.user is populated by your authentication middleware
    const communityId = parseInt(req.params.communityId, 10);

    if (isNaN(communityId)) {
      return res.status(400).send("Invalid community ID");
    }

    try {
      const isMember = await communityQueries.checkMembership(
        userId,
        communityId
      );
      res.json({ isMember });
    } catch (error) {
      console.error("Check membership error:", error);
      res.status(500).send("Error checking membership status");
    }
  }
);

router.post("/:communityId/join", checkAuthenticated, async (req, res) => {
  const userId = req.user.id; // Assuming req.user is populated by your authentication middleware
  const communityId = parseInt(req.params.communityId, 10);

  if (isNaN(communityId)) {
    return res.status(400).send("Invalid community ID");
  }

  try {
    const message = await communityQueries.joinCommunity(userId, communityId);
    res.status(200).json({ message });
  } catch (error) {
    console.error("Join community error:", error.message);
    return res.status(500).send("Error joining community");
  }
});

router.post("/:communityId/leave", checkAuthenticated, async (req, res) => {
  const userId = req.user.id; // Assuming req.user is populated by your authentication middleware
  const communityId = parseInt(req.params.communityId, 10);

  if (isNaN(communityId)) {
    return res.status(400).send("Invalid community ID");
  }

  try {
    const message = await communityQueries.leaveCommunity(userId, communityId);
    res.status(200).json({ message });
  } catch (error) {
    console.error("Leave community error:", error.message);
    return res.status(500).send("Error leaving community");
  }
});

module.exports = router;
