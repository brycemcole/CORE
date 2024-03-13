const express = require("express");
const router = express.Router();
const userQueries = require("../queries/userQueries");
const multer = require("multer");
const { checkAuthenticated } = require("../middleware/authMiddleware");
const storage = multer.diskStorage({
  destination: "./public/uploads/",
  filename: function (req, file, cb) {
    cb(null, "profile-" + Date.now() + ".jpg");
  },
});
const githubService = require("../services/githubService");
const cacheMiddleware = require("../middleware/cache");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 1200 }); // TTL is 20 minutes
const utilFunctions = require("../utils/utilFunctions");
const upload = multer({ storage });
const marked = require("marked");
const postQueries = require("../queries/postQueries");
const jobQueries = require("../queries/jobQueries");
const sql = require("mssql");

const renderer = new marked.Renderer();
renderer.image = function (href, title, text) {
  // Return HTML string with the image and its alt text as a caption below
  return `
      <div class="image-container">
          <img src="${href}" alt="${text}">
          <p class="alt-text">${text}</p>
      </div>
  `;
};
marked.setOptions({
  renderer: renderer,
});

router.get("/getUsername/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const user = await userQueries.findById(id);
    if (user) {
      res.json(user.username);
    } else {
      res.status(404).send("User not found");
    }
  } catch (err) {
    res.status(500).send("Server error");
  }
});

router.get("/job-postings", async (req, res) => {
  try {
    const jobPostings = await jobQueries.getJobs();
    res.json(jobPostings);
  } catch (err) {
    console.error("Error fetching job postings:", err);
    res.status(500).send("Error fetching job postings");
  }
});

router.get("/skills", async (req, res) => {
  try {
    const skills = await jobQueries.getSkills();
    res.json(skills);
  } catch (err) {
    console.error("Error fetching skills:", err);
    res.status(500).send("Error fetching skills");
  }
});

router.get("/jobs", async (req, res) => {
  try {
    const jobPostings = await jobQueries.getJobs();
    res.json(jobPostings);
  } catch (err) {
    console.error("Error fetching job postings:", err);
    res.status(500).send("Error fetching job postings");
  }
});

router.get("/jobs/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const jobPosting = await jobQueries.findById(id);
    res.json(jobPosting);
  } catch (err) {
    console.error("Error fetching job posting:", err);
    res.status(500).send("Error fetching job posting");
  }
});

router.post("/job-postings", async (req, res) => {
  try {
    const {
      title,
      salary,
      experienceLevel,
      location,
      postedDate,
      company_id,
      link,
      expiration_date,
      tags,
      description,
      salary_max,
      recruiter_id,
      skills,
    } = req.body;

    // Call the createJobPosting function
    const jobPostingId = await jobQueries.createJobPosting(
      title,
      salary,
      experienceLevel,
      location,
      postedDate,
      company_id,
      link,
      expiration_date,
      tags,
      description,
      salary_max,
      recruiter_id,
      skills
    );

    res
      .status(201)
      .json({ message: "Job posting created successfully", jobPostingId });
  } catch (error) {
    console.error("Error creating job posting:", error);
    res
      .status(500)
      .json({ error: "An error occurred while creating the job posting" });
  }
});
router.get("/posts/:postId/comments", async (req, res) => {
  try {
    const postId = req.params.postId;
    const comments = await utilFunctions.getComments(postId);
    res.json(comments);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).send("Error fetching comments");
  }
});

router.get("/posts/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const user = req.user ? req.user : null;
    const postData = await utilFunctions.getPostData(postId, user);
    postData.content = marked(postData.content);
    res.json(postData);
  } catch (err) {
    console.error("Error fetching post data:", err);
    res.status(500).send("Error fetching post data");
  }
});

router.get("/posts/:postId/getReaction", async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.query.userId; // Assuming userId is sent as a query parameter
    const reaction = await postQueries.getUserInteractions(postId, userId);
    return res.json(reaction);
  } catch (err) {
    console.error("Error fetching reaction:", err);
    res.status(500).send("Error fetching reaction");
  }
});

router.get("/communities", async (req, res) => {
  try {
    const communities = await utilFunctions.getAllCommunities();
    return res.json(communities);
  } catch (err) {
    console.error("Error fetching communities:", err);
    res.status(500).send("Error fetching communities");
  }
});

router.get("/communities/:communityId/posts", async (req, res) => {
  try {
    const communityId = req.params.communityId;
    const posts = await utilFunctions.getPostsForCommunity(communityId);
    res.json(posts);
  } catch (err) {
    res.status(500).send("Error fetching posts");
  }
});

router.get("/comments/:commentId/replies", async (req, res) => {
  try {
    const commentId = req.params.commentId;
    const replies = await utilFunctions.getRepliesForComment(commentId);
    res.json(replies);
  } catch (err) {
    console.error("Error fetching replies:", err);
    res.status(500).send("Error fetching replies");
  }
});

router.get("/tags", async (req, res) => {
  try {
    const tags = await utilFunctions.getAllTags();
    res.json(tags);
  } catch (err) {
    console.error("Error fetching tags:", err);
    res.status(500).send("Error fetching tags");
  }
});

router.get("/:postId/reactions/:userId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.params.userId;
    const reaction = await postQueries.getUserInteractions(postId, userId);
    return res.json(reaction);
  } catch (err) {
    console.error("Error fetching reaction:", err);
    res.status(500).send("Error fetching reaction");
  }
});

router.get("/get-latest-commit", cacheMiddleware(1200), async (req, res) => {
  try {
    const latestCommit = await githubService.getLatestCommit();
    res.json(latestCommit);
  } catch (error) {
    res.status(500).json({ message: "Error fetching latest commit" });
  }
});

router.get("/posts", async (req, res) => {
  try {
    const user = req.user ? req.user : null;
    const sortBy = req.query.sortBy || "best";
    const posts = await utilFunctions.getPosts(sortBy, user ? user.id : null);
    res.json(posts);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/trending-posts", async (req, res) => {
  try {
    const posts = await utilFunctions.getTrendingPosts();
    res.json(posts);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/user-details/:userId", async (req, res) => {
  try {
    const userDetails = await utilFunctions.getUserDetails(req.params.userId);
    res.json(userDetails);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/comments/:postId", async (req, res) => {
  try {
    let cachedData = cache.get(req.params.postId);
    if (cachedData) {
      return res.json(cachedData);
    }

    const comments = await utilFunctions.getComments(req.params.postId);

    cache.set(req.params.postId, comments);
    res.json(comments);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/tags/:postId", async (req, res) => {
  try {
    const tags = await utilFunctions.getTags(req.params.postId);
    res.json(tags);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/communities/:communitiesId", async (req, res) => {
  try {
    const communities = await utilFunctions.getCommunities(
      req.params.communitiesId
    );

    res.json(communities);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/link-preview/:link", cacheMiddleware(1200), async (req, res) => {
  try {
    const link = decodeURIComponent(decodeURIComponent(req.params.link));
    const linkPreview = await utilFunctions.getLinkPreview(link);
    res.json(linkPreview);
  } catch (err) {
    console.error("Error in link preview route:", err);
    res.status(500).send(err.message);
  }
});

router.get("/commits", async (req, res) => {
  try {
    const commits = await utilFunctions.fetchCommits();
    res.json(commits);
  } catch (error) {
    res.status(500).json({ message: "Error fetching commits" });
  }
});

router.post(
  "/upload-profile-picture",
  checkAuthenticated,
  upload.single("file"),
  async (req, res) => {
    try {
      if (req.file.size > 1000000) {
        return res.status(400).send("File size too large");
      }
      const userId = req.user.userId;
      const filePath = req.file.path;
      await userQueries.updateProfilePicture(userId, filePath);
      res.redirect("back");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  }
);

module.exports = router;
