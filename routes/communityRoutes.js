const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { checkAuthenticated } = require("../middleware/authMiddleware");
const communityQueries = require("../queries/communityQueries");
const postQueries = require("../queries/postQueries");

router.get("/:communityName", async (req, res) => {
  const communityName = req.params.communityName;

  try {
    const community =
      await sql.query`SELECT * FROM communities WHERE shortname = ${communityName}`;

    if (!community.recordset[0]) {
      return res.render("error.ejs", {
        user: req.user,
        error: { message: "That community was not found." },
      });
    }

    if (community.recordset[0].PrivacySetting === "Private") {
      return res.render("error.ejs", {
        user: r,
        error: { message: "That community is private." },
      });
    }

    const communityId = community.recordset[0].id;

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
  "/:communityShortName/create",
  checkAuthenticated,
  async (req, res) => {
    const communityShortName = req.params.communityShortName;
    const communityId = await communityQueries.getCommunityIdByShortName(
      communityShortName
    );

    if (!communityId) {
      res.status(404).send("Community not found");
    }

    const tags = await postQueries.getAllTags();
    res.render("create-post.ejs", { user: req.user, tags, communityId });
  }
);

router.post("/community-update", checkAuthenticated, async (req, res) => {
  const {
    id,
    description,
    rules,
    PrivacySetting,
    JobsEnabled,
    Tags,
    mini_icon,
  } = req.body;
  console.log(req.body);

  const user = req.user;
  const userIsModerator = await communityQueries.checkModerator(user.id, id);

  if (!userIsModerator) {
    return res.status(403).send("Access denied. Moderators only.");
  }

  if (!id) {
    return res.status(400).send("Community ID is required.");
  }

  const updateData = {};
  if (description !== undefined) updateData.description = description;
  if (rules !== undefined) updateData.rules = rules;
  if (PrivacySetting !== undefined) updateData.PrivacySetting = PrivacySetting;
  if (JobsEnabled !== undefined) updateData.JobsEnabled = JobsEnabled;
  if (Tags !== undefined) updateData.Tags = Tags;
  if (mini_icon !== undefined) updateData.mini_icon = mini_icon;

  try {
    const success = await communityQueries.updateCommunityInfo(id, updateData);
    if (success) {
      res.status(200).send("Community information updated successfully.");
    } else {
      res.status(500).send("Failed to update community information.");
    }
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).send("Server error.");
  }
});

router.get("/:communityName/isMember", checkAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const communityName = req.params.communityName;

  try {
    const community =
      await sql.query`SELECT id FROM communities WHERE shortname = ${communityName}`;
    if (!community.recordset[0]) {
      return res.status(404).send("Community not found");
    }
    const communityId = community.recordset[0].id;

    const isMember = await communityQueries.checkMembership(
      userId,
      communityId
    );

    const isModerator = await communityQueries.checkModerator(
      userId,
      communityId
    );
    res.json({ isMember, isModerator });
  } catch (error) {
    console.error("Check membership error:", error);
    res.status(500).send("Error checking membership status");
  }
});

router.post("/:communityName/join", checkAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const communityName = req.params.communityName;

  try {
    const community =
      await sql.query`SELECT id FROM communities WHERE shortname = ${communityName}`;
    if (!community.recordset[0]) {
      return res.status(404).send("Community not found");
    }
    const communityId = community.recordset[0].id;

    const message = await communityQueries.joinCommunity(userId, communityId);
    res.status(200).json({ message });
  } catch (error) {
    console.error("Join community error:", error.message);
    return res.status(500).send("Error joining community");
  }
});

router.get("/:communityName/members", async (req, res) => {
  const communityName = req.params.communityName;

  try {
    const community =
      await sql.query`SELECT id FROM communities WHERE shortname = ${communityName}`;
    if (!community.recordset[0]) {
      return res.status(404).send("Community not found");
    }
    const communityId = community.recordset[0].id;

    const members = await communityQueries.getCommunityMembers(communityId);
    res.json({ members });
  } catch (error) {
    console.error("Get community members error:", error.message);
    return res.status(500).send("Error fetching community members");
  }
});

router.get("/:communityName/admin", checkAuthenticated, async (req, res) => {
  const communityName = req.params.communityName;
  const user = req.user;
  const communityId = await communityQueries.getCommunityIdByShortName(
    communityName
  );
  const userIsMod = communityQueries.checkModerator(user.id, communityId);

  if (!userIsMod) {
    return res.status(403).send("You are not a moderator of this community");
  }

  try {
    const community =
      await sql.query`SELECT * FROM communities WHERE shortname = ${communityName}`;
    if (!community.recordset[0]) {
      return res.status(404).send("Community not found");
    }

    res.render("edit-community.ejs", {
      user: req.user,
      community: community.recordset[0],
    });
  } catch (error) {
    console.error("Get community error:", error.message);
    return res.status(500).send("Error fetching community");
  }
});

router.get("/", async (req, res) => {
  try {
    const user = req.user;
    let communities = await communityQueries.getCommunities();

    if (user && user.id) {
      const userMemberships = await communityQueries.getUserMemberships(user.id);

      communities = communities.map(community => ({
        ...community,
        isMember: userMemberships.some(m => m.community_id === community.id),
        isModerator: userMemberships.some(m => m.community_id === community.id && m.is_moderator)
      }));
    }

    res.render("community.ejs", { user, communities });
  } catch (error) {
    console.error("Get communities error:", error.message);
    return res.status(500).send("Error fetching communities");
  }
});

router.post("/:communityName/leave", checkAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const communityName = req.params.communityName;

  try {
    const community =
      await sql.query`SELECT id FROM communities WHERE shortname = ${communityName}`;
    if (!community.recordset[0]) {
      return res.status(404).send("Community not found");
    }
    const communityId = community.recordset[0].id;

    const message = await communityQueries.leaveCommunity(userId, communityId);
    res.status(200).json({ message });
  } catch (error) {
    console.error("Leave community error:", error.message);
    return res.status(500).send("Error leaving community");
  }
});

module.exports = router;
