const axios = require("axios");
const NodeCache = require("node-cache");

// Create a cache instance with a TTL of 20 minutes (1200 seconds)
const cache = new NodeCache({ stdTTL: 1200 });

let lastFetchTime = 0; // Variable to track the last fetch time

const fetchCommitDetails = async (commitUrl) => {
  try {
    const response = await axios.get(commitUrl);
    return {
      totalLinesAdded: response.data.stats.additions,
      totalLinesDeleted: response.data.stats.deletions,
    };
  } catch (error) {
    console.error("Error fetching commit details:", error.message);
    return { totalLinesAdded: 0, totalLinesDeleted: 0 };
  }
};

const getLatestCommit = async () => {
  try {
    const response = await axios.get(
      "https://api.github.com/repos/brycemcole/CORE/commits"
    );
    const latestCommit = response.data[0];
    return {
      message: latestCommit.commit.message,
      author: latestCommit.author.login,
      date: latestCommit.commit.author.date,
    };
  } catch (error) {
    console.error("Error fetching latest commit:", error.message);
    return {};
  }
};

const fetchCommits = async () => {
  try {
    const currentTime = Date.now();

    // Check if data is in cache and if last fetch was less than 20 minutes ago
    const cachedData = cache.get("commits");
    if (cachedData && currentTime - lastFetchTime < 1200 * 1000) {
      return cachedData; // Return cached data if available and updated within 20 minutes
    }

    // Fetch data from GitHub API
    const response = await axios.get(
      "https://api.github.com/repos/brycemcole/CORE/commits"
    );

    // Fetch details for each commit
    const detailedCommits = await Promise.all(
      response.data.map(async (commit) => {
        const details = await fetchCommitDetails(commit.url);
        return {
          ...commit,
          linesAdded: details.totalLinesAdded,
          linesDeleted: details.totalLinesDeleted,
        };
      })
    );

    // Update last fetch time and save to cache
    lastFetchTime = currentTime;
    cache.set("commits", detailedCommits);
    return detailedCommits;
  } catch (error) {
    console.error("Error fetching commits:", error.message);
    return cache.get("commits") || [];
  }
};

module.exports = { fetchCommits, getLatestCommit };
