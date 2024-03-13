const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");

// Route for search
router.get("/", searchController.searchAll);

router.get("/preview", searchController.searchPreview);

module.exports = router;
