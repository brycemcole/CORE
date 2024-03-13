const sql = require("mssql");
const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 1200 }); // TTL is 20 minutes

const utilFunctions = {
  uuid: () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (Math.random() * 16) | 0,
          v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  },
  getPosts: async (sortBy = "trending", userId) => {
    try {
      const result = await sql.query`
      SELECT 
        p.id, 
        p.created_at, 
        p.deleted, 
        p.title, 
        p.content, 
        p.link, 
        p.communities_id, 
        p.react_like, 
        p.react_love, 
        p.react_curious, 
        p.react_interesting, 
        p.react_celebrate, 
        p.post_type, 
        p.views, 
        u.currentJob, 
        u.username, 
        u.avatar,
        CASE WHEN ur.follower_id IS NOT NULL THEN 1 ELSE 0 END AS is_following,
        c.name AS community_name, 
        c.shortname AS community_shortname,
        SUM(CASE WHEN upa.action_type = 'LOVE' THEN 1 ELSE 0 END) as loveCount,
        SUM(CASE WHEN upa.action_type = 'B' THEN 1 ELSE 0 END) as boostCount,
        SUM(CASE WHEN upa.action_type = 'INTERESTING' THEN 1 ELSE 0 END) as interestingCount,
        SUM(CASE WHEN upa.action_type = 'CURIOUS' THEN 1 ELSE 0 END) as curiousCount,
        SUM(CASE WHEN upa.action_type = 'LIKE' THEN 1 ELSE 0 END) as likeCount,
        SUM(CASE WHEN upa.action_type = 'CELEBRATE' THEN 1 ELSE 0 END) as celebrateCount,
        (
          SELECT TOP 1 upa2.action_type 
          FROM userPostActions upa2
          WHERE upa2.post_id = p.id AND upa2.user_id = ${userId}
        ) as userReaction
      FROM posts p
      INNER JOIN users u ON p.user_id = u.id
      LEFT JOIN userPostActions upa ON p.id = upa.post_id
      LEFT JOIN communities c ON p.communities_id = c.id
      LEFT JOIN user_relationships ur ON u.id = ur.followed_id AND ur.follower_id = ${userId}
      WHERE p.deleted = 0
      GROUP BY 
        p.id, p.created_at, p.deleted, u.username, p.title, p.content, p.link, 
        p.communities_id, u.avatar, u.currentJob, c.name, c.shortname, 
        p.react_like, p.react_love, p.react_curious, p.react_interesting, 
        p.react_celebrate, p.post_type, p.views, ur.follower_id
    `;

      let sortedResult;

      switch (sortBy) {
        case "trending":
          const now = new Date();
          sortedResult = result.recordset.sort((a, b) => {
            const minutesA = (now - new Date(a.created_at)) / (1000 * 60);
            const minutesB = (now - new Date(b.created_at)) / (1000 * 60);

            const reactionsA =
              a.loveCount * 5 +
              a.boostCount * 4 +
              a.interestingCount * 3 +
              a.curiousCount * 2 +
              a.likeCount +
              a.celebrateCount * 3;
            const reactionsB =
              b.loveCount * 5 +
              b.boostCount * 4 +
              b.interestingCount * 3 +
              b.curiousCount * 2 +
              b.likeCount +
              b.celebrateCount * 3;

            const reactionsPerMinuteA = reactionsA / minutesA;
            const reactionsPerMinuteB = reactionsB / minutesB;

            const followingWeightA = a.is_following ? 1.2 : 1;
            const followingWeightB = b.is_following ? 1.2 : 1;

            return (
              reactionsPerMinuteB * followingWeightB -
              reactionsPerMinuteA * followingWeightA
            );
          });
          break;

        case "top":
          sortedResult = result.recordset.sort((a, b) => {
            const weightedReactionsA =
              a.loveCount * 5 +
              a.boostCount * 4 +
              a.interestingCount * 3 +
              a.curiousCount * 2 +
              a.likeCount +
              a.celebrateCount * 3;
            const weightedReactionsB =
              b.loveCount * 5 +
              b.boostCount * 4 +
              b.interestingCount * 3 +
              b.curiousCount * 2 +
              b.likeCount +
              b.celebrateCount * 3;
            return weightedReactionsB - weightedReactionsA;
          });
          break;

        case "new":
          sortedResult = result.recordset.sort((a, b) => {
            const dateA = new Date(a.created_at);
            const dateB = new Date(b.created_at);

            const followingWeightA = a.is_following ? 1.00005 : 1;
            const followingWeightB = b.is_following ? 1.00005 : 1;

            if (dateB - dateA === 0) {
              return followingWeightB - followingWeightA;
            }
            return (dateB - dateA) * (followingWeightB - followingWeightA);
          });
          break;

        case "explore":
          sortedResult = result.recordset.sort((a, b) => {
            const totalReactionsA =
              a.loveCount +
              a.boostCount +
              a.interestingCount +
              a.curiousCount +
              a.likeCount +
              a.celebrateCount;
            const totalReactionsB =
              b.loveCount +
              b.boostCount +
              b.interestingCount +
              b.curiousCount +
              b.likeCount +
              b.celebrateCount;
            const viewsWeightA = Math.log(a.views + 1);
            const viewsWeightB = Math.log(b.views + 1);
            return (
              totalReactionsB * viewsWeightB - totalReactionsA * viewsWeightA
            );
          });
          break;

        default:
          sortedResult = result.recordset.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          );
      }

      return sortedResult;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getTagById: async (tagId) => {
    try {
      const result = await sql.query`
        SELECT * FROM tags WHERE id = ${tagId}
      `;
      return result.recordset[0];
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getCommunityName: async (communityId, getFullName) => {
    try {
      if (getFullName) {
        const result = await sql.query`
        SELECT name FROM communities WHERE id = ${communityId}
      `;
        return result.recordset[0].name;
      }
      const result = await sql.query`
        SELECT shortname FROM communities WHERE id = ${communityId}
      `;
      return result.recordset[0].shortname;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getAllTags: async () => {
    try {
      const result = await sql.query`
        SELECT * FROM tags
      `;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getPostsForCommunity: async (communityId) => {
    try {
      const result = await sql.query`
        SELECT p.id, p.created_at, p.deleted, p.title, p.content, p.link, p.communities_id, p.react_like, p.react_love, p.react_curious, p.react_interesting, p.react_celebrate, p.post_type, p.views,
        u.currentJob, u.username, u.avatar,
        c.name AS community_name, c.shortname AS community_shortname,
              SUM(CASE WHEN upa.action_type = 'LOVE' THEN 1 ELSE 0 END) as loveCount,
              SUM(CASE WHEN upa.action_type = 'B' THEN 1 ELSE 0 END) as boostCount,
              SUM(CASE WHEN upa.action_type = 'INTERESTING' THEN 1 ELSE 0 END) as interestingCount,
              SUM(CASE WHEN upa.action_type = 'CURIOUS' THEN 1 ELSE 0 END) as curiousCount,
              SUM(CASE WHEN upa.action_type = 'LIKE' THEN 1 ELSE 0 END) as likeCount,
              SUM(CASE WHEN upa.action_type = 'CELEBRATE' THEN 1 ELSE 0 END) as celebrateCount
        FROM posts p
        INNER JOIN users u ON p.user_id = u.id
        LEFT JOIN userPostActions upa ON p.id = upa.post_id
        LEFT JOIN communities c ON p.communities_id = c.id
        WHERE p.communities_id = ${communityId} AND p.deleted = 0
        GROUP BY p.id, p.created_at, p.deleted, u.username, p.title, p.content, p.link, p.communities_id, u.avatar, u.currentJob, p.react_like, p.react_love, p.react_curious, p.react_interesting, p.react_celebrate, p.post_type, p.views, c.name, c.shortname
        ORDER BY p.created_at DESC
      `;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getCommunities: async () => {
    try {
      const result = await sql.query`
        SELECT name FROM communities`;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getTrendingPosts: async () => {
    try {
      const result = await sql.query`
        SELECT TOP 7 * FROM (
          SELECT p.id, p.created_at, p.deleted, p.title, p.content, p.link, p.communities_id, p.react_like, p.react_love, p.react_curious, p.react_interesting, p.react_celebrate,
          u.currentJob, u.username, u.avatar, u.currentCompany,
                SUM(CASE WHEN upa.action_type = 'LOVE' THEN 1 ELSE 0 END) as loveCount,
                SUM(CASE WHEN upa.action_type = 'B' THEN 1 ELSE 0 END) as boostCount,
                SUM(CASE WHEN upa.action_type = 'INTERESTING' THEN 1 ELSE 0 END) as interestingCount,
                SUM(CASE WHEN upa.action_type = 'CURIOUS' THEN 1 ELSE 0 END) as curiousCount,
                SUM(CASE WHEN upa.action_type = 'LIKE' THEN 1 ELSE 0 END) as likeCount,
                SUM(CASE WHEN upa.action_type = 'CELEBRATE' THEN 1 ELSE 0 END) as celebrateCount
          FROM posts p
          INNER JOIN users u ON p.user_id = u.id
          LEFT JOIN userPostActions upa ON p.id = upa.post_id
          WHERE p.deleted = 0
          GROUP BY p.id, p.created_at, p.deleted, u.currentCompany, p.title, p.content, p.link, p.communities_id, u.username, u.avatar, u.currentJob, p.react_like, p.react_love, p.react_curious, p.react_interesting, p.react_celebrate
        ) AS SubQuery
        ORDER BY (loveCount + boostCount + interestingCount + curiousCount + likeCount + celebrateCount) DESC
      `;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getPostData: async (postId, user) => {
    try {
      await sql.query`UPDATE posts SET views = ISNULL(views, 0) + 1 WHERE id = ${postId}`;

      let userId;
      if (user) {
        userId = user.id;
      } else {
        userId = null;
      }

      const result = await sql.query`
        SELECT 
          p.id, p.created_at, p.deleted, p.title, p.content, p.link, p.communities_id, 
          p.link_description, p.link_image, p.link_title, p.react_like, p.react_love, 
          p.react_curious, p.react_interesting, p.react_celebrate, p.post_type, p.updated_at, 
          p.views, u.username, u.id as user_id, u.avatar,
          ISNULL(u2.username, 'unknown') AS user_username,
          ISNULL(u2.avatar, null) AS user_avatar,
          SUM(CASE WHEN upa.action_type = 'LOVE' THEN 1 ELSE 0 END) as loveCount,
          SUM(CASE WHEN upa.action_type = 'B' THEN 1 ELSE 0 END) as boostCount,
          SUM(CASE WHEN upa.action_type = 'INTERESTING' THEN 1 ELSE 0 END) as interestingCount,
          SUM(CASE WHEN upa.action_type = 'CURIOUS' THEN 1 ELSE 0 END) as curiousCount,
          SUM(CASE WHEN upa.action_type = 'LIKE' THEN 1 ELSE 0 END) as likeCount,
          SUM(CASE WHEN upa.action_type = 'CELEBRATE' THEN 1 ELSE 0 END) as celebrateCount,
          upa2.action_type as userReaction
        FROM posts p
        INNER JOIN users u ON p.user_id = u.id
        LEFT JOIN userPostActions upa ON p.id = upa.post_id
        LEFT JOIN users u2 ON u.id = u2.id
        LEFT JOIN userPostActions upa2 ON p.id = upa2.post_id AND upa2.user_id = ${userId}
        WHERE p.id = ${postId}
        GROUP BY 
          p.id, p.created_at, p.deleted, u.username, p.title, p.content, p.link, p.communities_id,
          p.link_description, p.link_image, p.link_title, p.react_like, p.react_love, p.react_curious,
          p.react_interesting, p.react_celebrate, u.avatar, u.id, p.post_type, p.updated_at,
          p.views, u2.username, u2.avatar, upa2.action_type
      `;

      const postData = result.recordset[0];
      return postData;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getAllCommunities: async () => {
    try {
      const result = await sql.query`
        SELECT id, name, mini_icon, shortname FROM communities WHERE PrivacySetting = 'Public'
      `;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getCommunities: async (communityId) => {
    try {
      const result = await sql.query`
        SELECT * FROM communities WHERE id = ${communityId}
      `;
      return result.recordset[0];
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getRepliesForComment: async (commentId) => {
    try {
      const result = await sql.query`
        SELECT * FROM comments WHERE parent_comment_id = ${commentId}
      `;
      const commentList = result.recordset;
      return await utilFunctions.getNestedComments(commentList);
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },
  getComments: async (postId) => {
    try {
      const result = await sql.query`
        SELECT * FROM comments WHERE post_id = ${postId} AND deleted = 0
      `;
      const commentList = result.recordset;
      return await utilFunctions.getNestedComments(commentList);
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },
  getTags: async (postId) => {
    try {
      const result = await sql.query`
        SELECT t.* FROM tags t
        INNER JOIN post_tags pt ON t.id = pt.tag_id
        WHERE pt.post_id = ${postId}
      `;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getUserDetails: async (userId) => {
    try {
      const userResult =
        await sql.query`SELECT * FROM users WHERE id = ${userId}`;
      if (userResult.recordset.length > 0) {
        return userResult.recordset[0];
      } else {
        // Return a default user object instead of throwing an error
        return { id: userId, username: "unknown", avatar: null };
      }
    } catch (err) {
      console.error("Database query error:", err);
      // Optionally, you can still return a default user object in case of query error
      return { id: userId, username: "error", avatar: null };
    }
  },

  getUserDetailsFromGithub: async (githubUsername) => {
    try {
      const query = `SELECT * FROM users WHERE github_url = '${githubUsername}'`;
      const result = await sql.query(query);

      if (result.recordset.length > 0) {
        return result.recordset[0];
      } else {
        return null;
      }
    } catch (err) {
      console.error("Database query error:", err);
      return null;
    }
  },

  linkify: (text) => {
    const urlRegex =
      /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;
    return text.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" class="comment-url">${url}</a>`;
    });
  },

  checkMissingFields: async (userId) => {
    let missingFields = [];

    const result = await sql.query`
      SELECT firstname, lastname FROM users WHERE id = ${userId}
    `;

    try {
      if (result.recordset.length > 0) {
        let user = result.recordset[0];
        if (!user.firstname) missingFields.push("firstname");
        if (!user.lastname) missingFields.push("lastname");
      }
      return missingFields;
    } catch (err) {
      console.error("Error in checking missing fields:", err);
    }
  },

  getLinkPreview: async (url) => {
    const getMetaTag = async ($, name) => {
      return (
        $(`meta[name=${name}]`).attr("content") ||
        $(`meta[name="twitter:${name}"]`).attr("content") ||
        $(`meta[property="og:${name}"]`).attr("content")
      );
    };
    try {
      // Ensure the URL is a string
      if (typeof url !== "string") {
        throw new Error("URL must be a string");
      }

      // check if url exists in the LinkPreviewData table
      const linkPreviewDataQuery = `SELECT * FROM LinkPreviewData WHERE link = '${url}'`;
      const linkPreviewDataResult = await sql.query(linkPreviewDataQuery);

      if (linkPreviewDataResult.recordset.length > 0) {
        const linkPreviewData = linkPreviewDataResult.recordset[0];
        return {
          url: linkPreviewData.link,
          image: linkPreviewData.image_url,
          description: linkPreviewData.description,
          title: linkPreviewData.title,
          favicon: linkPreviewData.favicon,
        };
      }

      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      };

      const response = await axios.get(url, { headers, timeout: 5000 });
      const { data, status } = response;

      if (status !== 200) {
        throw new Error(`Request failed with status code ${status}`);
      }

      const $ = cheerio.load(data);
      const metaTags = await Promise.all([
        getMetaTag($, "description"),
        getMetaTag($, "image"),
        getMetaTag($, "author"),
      ]);

      const favicon =
        $('link[rel="shortcut icon"]').attr("href") ||
        $('link[rel="icon"]').attr("href") ||
        $('link[rel="alternate icon"]').attr("href");

      if (favicon) {
        // If favicon is a relative path, convert it to an absolute URL
        if (!favicon.startsWith("http")) {
          const urlObject = new URL(url);
          favicon = urlObject.protocol + "//" + urlObject.host + favicon;
        }
      }

      const preview = {
        url,
        title: $("title").first().text(),
        favicon: favicon,
        description: metaTags[0],
        image: metaTags[1],
        author: metaTags[2],
      };

      // insert into LinkPreviewData table
      const insertLinkPreviewDataQuery = `INSERT INTO LinkPreviewData (link, image_url, description, title, favicon) VALUES ('${preview.url}', '${preview.image}', '${preview.description}', '${preview.title}', '${preview.favicon}')`;
      await sql.query(insertLinkPreviewDataQuery);

      return preview;
    } catch (error) {
      console.error("Error fetching URL:", error);
      return null;
    }
  },

  getFavicon: async (url) => {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const { data, status } = response;

      if (status !== 200) {
        throw new Error(`Request failed with status code ${status}`);
      }

      const $ = cheerio.load(data);
      const favicon =
        $('link[rel="shortcut icon"]').attr("href") ||
        $('link[rel="icon"]').attr("href") ||
        $('link[rel="alternate icon"]').attr("href");

      console.log(favicon);

      if (favicon) {
        // If favicon is a relative path, convert it to an absolute URL
        if (!favicon.startsWith("http")) {
          const urlObject = new URL(url);
          favicon = urlObject.protocol + "//" + urlObject.host + favicon;
        }
      }
    } catch (error) {
      console.error("Error fetching URL:", error);
      return null;
    }
  },

  upsertGitHubData: async (userData, reposData) => {
    const pool = new sql.ConnectionPool(config); // Ensure 'config' is your SQL Server configuration
    await pool.connect();

    try {
      const transaction = pool.transaction();
      await transaction.begin();

      let request = transaction.request(); // Use the request from the transaction

      // Upsert user data
      let userUpsertQuery = `
        MERGE INTO GitHubUserData AS target
        USING (SELECT ${userData.id} AS id) AS source
        ON (target.id = source.id)
        WHEN MATCHED THEN
          UPDATE SET 
            username = '${userData.username.replace(/'/g, "''")}', 
            user_url = '${userData.user_url.replace(/'/g, "''")}', 
            avatar_url = '${userData.avatar_url.replace(/'/g, "''")}', 
            time_fetched = GETDATE(), 
            raw_json = '${JSON.stringify(userData).replace(/'/g, "''")}'
        WHEN NOT MATCHED THEN
          INSERT (id, username, user_url, avatar_url, time_fetched, raw_json)
          VALUES (${userData.id}, '${userData.username.replace(
        /'/g,
        "''"
      )}', '${userData.user_url.replace(
        /'/g,
        "''"
      )}', '${userData.avatar_url.replace(
        /'/g,
        "''"
      )}', GETDATE(), '${JSON.stringify(userData).replace(/'/g, "''")}');
      `;
      await request.query(userUpsertQuery);

      // Upsert repos data
      for (const repo of reposData) {
        let repoUpsertQuery = `
          MERGE INTO GitHubUserRepos AS target
          USING (SELECT ${repo.id} AS repo_id) AS source
          ON (target.repo_id = source.repo_id)
          WHEN MATCHED THEN
            UPDATE SET 
              user_id = ${userData.id},
              repo_name = '${repo.name.replace(/'/g, "''")}',
              repo_url = '${repo.html_url.replace(/'/g, "''")}',
              description = '${(repo.description || "").replace(/'/g, "''")}',
              stars = ${repo.stargazers_count},
              time_fetched = GETDATE(),
              raw_json = '${JSON.stringify(repo).replace(/'/g, "''")}'
          WHEN NOT MATCHED THEN
            INSERT (repo_id, user_id, repo_name, repo_url, description, stars, time_fetched, raw_json)
            VALUES (${repo.id}, ${userData.id}, '${repo.name.replace(
          /'/g,
          "''"
        )}', '${repo.html_url.replace(/'/g, "''")}', '${(
          repo.description || ""
        ).replace(/'/g, "''")}', ${
          repo.stargazers_count
        }, GETDATE(), '${JSON.stringify(repo).replace(/'/g, "''")}');
        `;
        await request.query(repoUpsertQuery);
      }

      // Commit transaction
      await transaction.commit();
    } catch (error) {
      console.error("Error updating GitHub data:", error);
      if (pool.connected) {
        await pool.close();
      }
      throw error; // Rethrow the error for further handling
    }

    if (pool.connected) {
      await pool.close();
    }
  },

  getGitHubUserReposPreview: async (url) => {
    const isGitHubUserUrl = /^https?:\/\/github\.com\/[^\/]+\/?$/.test(url);
    if (!isGitHubUserUrl) {
      throw new Error("URL must be a GitHub user profile URL");
    }

    const [, username] = url.match(/github\.com\/([^\/]+)/);

    try {
      const userApiUrl = `https://api.github.com/users/${username}`;
      const reposApiUrl = `${userApiUrl}/repos`;

      const [userResponse, reposResponse] = await Promise.all([
        axios.get(userApiUrl, {
          headers: { "User-Agent": "request" },
          timeout: 5000,
        }),
        axios.get(reposApiUrl, {
          headers: { "User-Agent": "request" },
          params: { per_page: 5 },
          timeout: 5000,
        }),
      ]);

      if (userResponse.status !== 200 || reposResponse.status !== 200) {
        throw new Error(
          `Request to GitHub API failed with status: ${userResponse.status} or ${reposResponse.status}`
        );
      }

      const userData = userResponse.data;
      const reposData = reposResponse.data;

      // Convert data to JSON strings for storing
      const rawUserJson = JSON.stringify(userData);
      const rawReposJson = JSON.stringify(reposData);

      // Here you would insert/update the data into your database as required.
      // For example, you could update an existing user record with new repo data,
      // or insert a new record if one doesn't exist.
      // This part is omitted for brevity and should be implemented according to your application's needs.

      return {
        username: userData.login,
        user_url: userData.html_url,
        avatar_url: userData.avatar_url,
        repos: reposData.map((repo) => ({
          id: repo.id,
          repo_url: repo.html_url,
          repo_name: repo.name,
          description: repo.description,
          stars: repo.stargazers_count,
        })),
        time_fetched: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching GitHub user and repository data:", error);
      throw error; // Re-throw the error for handling in the calling code
    }
  },

  getGitHubRepoPreview: async (url) => {
    const isGitHubUrl = /^https?:\/\/github\.com\/.+\/.+/.test(url);
    if (!isGitHubUrl) {
      throw new Error("URL must be a GitHub repository URL");
    }

    // Extract the repository's owner and name from the URL
    const [, owner, repo] = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);

    try {
      // Check if recent data (within the last 30 minutes) already exists in the GitHubRepoData table
      const existingDataQuery = `
      SELECT *, DATEDIFF(minute, time_fetched, GETDATE()) AS time_diff
      FROM GitHubRepoData
      WHERE repo_url = '${url}'
    `;
      const existingDataResult = await sql.query(existingDataQuery);

      let repoData, commitsData;

      // Check if data needs to be fetched or updated
      if (
        existingDataResult.recordset.length === 0 ||
        existingDataResult.recordset[0].time_diff > 30
      ) {
        // No existing data or data is older than 30 minutes, fetch new data from GitHub API
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        const commitsUrl = `${apiUrl}/commits`;
        const repoResponse = await axios.get(apiUrl, {
          headers: { "User-Agent": "request" },
          timeout: 5000,
        });
        const commitsResponse = await axios.get(commitsUrl, {
          headers: { "User-Agent": "request" },
          params: { per_page: 5 },
          timeout: 5000,
        });

        if (repoResponse.status !== 200 || commitsResponse.status !== 200) {
          throw new Error(
            `Request to GitHub API failed with status: ${repoResponse.status} or ${commitsResponse.status}`
          );
        }

        repoData = repoResponse.data;
        commitsData = commitsResponse.data;
      } else {
        // Use existing data if it's recent enough
        repoData = JSON.parse(existingDataResult.recordset[0].raw_json);
        commitsData = JSON.parse(
          existingDataResult.recordset[0].raw_commits_json
        );
      }

      const rawRepoJson = JSON.stringify(repoData);
      const rawCommitsJson = JSON.stringify(commitsData);

      if (existingDataResult.recordset.length > 0 && repoData && commitsData) {
        // Data exists, so update it with the new data from GitHub
        const updateQuery = `
        UPDATE GitHubRepoData
        SET repo_name = '${repoData.name.replace(/'/g, "''")}',
            raw_json = '${rawRepoJson.replace(/'/g, "''")}',
            raw_commits_json = '${rawCommitsJson.replace(/'/g, "''")}',
            time_fetched = GETDATE()
        WHERE repo_url = '${url}'
      `;
        await sql.query(updateQuery);
      } else if (!existingDataResult.recordset.length) {
        // No existing data, insert new data into GitHubRepoData table
        const insertQuery = `
        INSERT INTO GitHubRepoData (id, repo_url, repo_name, raw_json, raw_commits_json, time_fetched)
        VALUES (${repoData.id},
          '${url}', '${repoData.name.replace(
          /'/g,
          "''"
        )}', '${rawRepoJson.replace(/'/g, "''")}', '${rawCommitsJson.replace(
          /'/g,
          "''"
        )}', GETDATE())
      `;
        await sql.query(insertQuery);
      }

      return {
        id: repoData.id,
        repo_url: repoData.html_url,
        repo_name: repoData.name,
        raw_json: rawRepoJson,
        raw_commits_json: rawCommitsJson,
        time_fetched: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching GitHub repository data:", error);
      throw error; // Changed to rethrow the error to make error handling more consistent
    }
  },

  getNestedComments: async (commentList) => {
    const commentMap = {};

    // Create a map of comments
    commentList.forEach((comment) => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    const nestedComments = [];
    for (let comment of commentList) {
      if (comment.parent_comment_id && commentMap[comment.parent_comment_id]) {
        commentMap[comment.parent_comment_id].replies.push(
          commentMap[comment.id]
        );
      } else {
        nestedComments.push(commentMap[comment.id]);
      }
    }

    // Fetch user details for each comment
    for (let comment of nestedComments) {
      comment.user = await utilFunctions.getUserDetails(comment.user_id);
      for (let reply of comment.replies) {
        reply.user = await utilFunctions.getUserDetails(reply.user_id);
      }
    }

    return nestedComments;
  },

  getPostScore: async (postId) => {
    try {
      const result = await sql.query`
        SELECT boosts, detracts FROM posts WHERE id = ${postId}
      `;
      const boosts = result.recordset[0].boosts;
      const detracts = result.recordset[0].detracts;
      const score = boosts - detracts;
      return score;
    } catch (err) {
      console.error("Database query error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },

  nestComments: async (commentList) => {
    const commentMap = {};

    // Create a map of comments
    commentList.forEach((comment) => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    const nestedComments = [];
    for (let comment of commentList) {
      if (comment.parent_comment_id && commentMap[comment.parent_comment_id]) {
        commentMap[comment.parent_comment_id].replies.push(
          commentMap[comment.id]
        );
      } else {
        nestedComments.push(commentMap[comment.id]);
      }
    }

    // Fetch user details for each comment
    for (let comment of nestedComments) {
      comment.user = await utilFunctions.getUserDetails(comment.user_id);
      for (let reply of comment.replies) {
        reply.user = await utilFunctions.getUserDetails(reply.user_id);
      }
    }

    return nestedComments;
  },

  getCommunityDetails: async (communityId) => {
    try {
      const result = await sql.query`
        SELECT * FROM communities WHERE id = ${communityId}
      `;
      return result.recordset[0];
    } catch (err) {
      console.error("Database query error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },
};

module.exports = utilFunctions;
