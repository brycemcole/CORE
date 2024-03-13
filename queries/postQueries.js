const sql = require("mssql");
const crypto = require("crypto");
const tagQueries = require("./tagsQueries");

const generateUniqueId = () => {
  // Use the last 4 characters of the current timestamp in base 36
  const timestampPart = Date.now().toString(36).slice(-4);

  // Generate a random 4-character string in base 36
  const randomPart = crypto.randomBytes(2).toString("hex").slice(0, 4);

  // Combine both parts to form an 8-character ID
  return `${timestampPart}${randomPart}`;
};

const postQueries = {
  getPosts: async () => {
    try {
      const result = await sql.query(
        "SELECT * FROM posts WHERE deleted = 0 ORDER BY created_at DESC"
      );
      const posts = result.recordset;

      // Cache the result for future requests
      return posts;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  acceptAnswer: async (postId, commentId, userId) => {
    try {
      // Check if the post exists
      const postResult = await sql.query`
        SELECT * FROM posts WHERE id = ${postId} AND deleted = 0`;
      if (postResult.recordset.length === 0) {
        throw new Error("Post not found");
      }

      // check if post is a question
      if (postResult.recordset[0].post_type !== "question") {
        throw new Error("Post is not a question");
      }

      // check if post is authored by the user
      if (postResult.recordset[0].user_id !== userId) {
        throw new Error("User is not the author of the post");
      }

      // check if comment exists
      const commentResult = await sql.query`
        SELECT * FROM comments WHERE id = ${commentId}`;
      if (commentResult.recordset.length === 0) {
        throw new Error("Comment not found");
      }

      // check if there is already an answer to the question
      const answerResult = await sql.query`
        SELECT * FROM QuestionSolutions WHERE OriginalPostID = ${postId}`;
      if (answerResult.recordset.length > 0) {
        // replace the accepted answer
        const result = await sql.query`
          UPDATE QuestionSolutions SET CommentID = ${commentId}, SolutionTimestamp = GETDATE() WHERE OriginalPostID = ${postId}`;
        if (result.rowsAffected[0] === 0) {
          throw new Error("Failed to accept the answer");
        }
        return true;
      }

      const result = await sql.query`
        INSERT INTO QuestionSolutions (OriginalPostID, CommentID, SolutionTimestamp) VALUES (${postId}, ${commentId}, GETDATE())`;

      if (result.rowsAffected[0] === 0) {
        throw new Error("Failed to accept the answer");
      } else {
        return true;
      }
    } catch (err) {
      console.error("Database update error:", err);
      throw err;
    }
  },

  getAcceptedAnswer: async (postId) => {
    try {
      const result = await sql.query`
        SELECT * FROM QuestionSolutions WHERE OriginalPostID = ${postId}`;

      // return the actual comment
      const comment = await sql.query`
        SELECT * FROM comments WHERE id = ${result.recordset[0].CommentID}`;

      return comment.recordset[0];
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  editPost: async (postId, postData) => {
    const transaction = new sql.Transaction(/* [connection] */);
    try {
      await transaction.begin();
      const updateRequest = new sql.Request(transaction);

      const trimmedLink = postData.link.trim();

      await updateRequest.query`UPDATE posts SET title = ${postData.title}, content = ${postData.content}, link = ${trimmedLink}, updated_at = GETDATE() WHERE id = ${postId} AND deleted = 0`;

      const deleteTagsRequest = new sql.Request(transaction);
      await deleteTagsRequest.query`DELETE FROM post_tags WHERE post_id = ${postId}`;

      for (const tagNameOrId of postData.tags) {
        const tagRequest = new sql.Request(transaction);
        let tagId;
        // Check if tagNameOrId is an ID (integer) or a new tag name (string)
        if (isNaN(parseInt(tagNameOrId))) {
          // It's a new tag name, check if it exists or create new
          let tag = await tagQueries.findTagByName(tagNameOrId);
          if (!tag) {
            // Tag doesn't exist, create it
            tag = await tagQueries.createTag(tagNameOrId); // Adjust to ensure it returns the new tag object
            tagId = tag.id; // Assuming createTag returns the new tag object including its ID
          } else {
            tagId = tag.id; // Use existing tag ID
          }
        } else {
          // It's an existing tag ID
          tagId = tagNameOrId;
        }

        // Insert the mapping between the post and the tag using the tag ID
        const insertPostTagRequest = new sql.Request(transaction);
        await insertPostTagRequest.query`INSERT INTO post_tags (post_id, tag_id) VALUES (${postId}, ${tagId})`;
      }

      await transaction.commit();

      return true;
    } catch (err) {
      return false;
    }
  },

  getPostById: async (postId) => {
    try {
      const result =
        await sql.query`SELECT * FROM posts WHERE id = ${postId} AND deleted = 0`;
      return result.recordset[0];
    } catch (err) {
      console.error("Database query error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },

  getParentAuthorUsernameByCommentId: async (commentId) => {
    try {
      // Query to check if the comment has a parent_comment_id and get the parent comment's author username or post's author username accordingly
      const result = await sql.query`
        SELECT 
          COALESCE(parentComment.user_id, post.user_id) as author_id
        FROM 
          comments as comment
          LEFT JOIN comments as parentComment ON comment.parent_comment_id = parentComment.id
          LEFT JOIN posts as post ON comment.post_id = post.id
        WHERE 
          comment.id = ${commentId}`;

      if (result.recordset.length === 0) {
        throw new Error("Comment not found");
      }

      const authorId = result.recordset[0].author_id;

      // Now fetch the username using the authorId
      const userResult = await sql.query`
        SELECT username
        FROM users
        WHERE id = ${authorId}`;

      if (userResult.recordset.length === 0) {
        throw new Error("User not found");
      }

      return userResult.recordset[0].username;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getCommentsByPostId: async (postId) => {
    try {
      const result = await sql.query`
        SELECT * 
        FROM replies 
        WHERE post_id = ${postId} AND deleted = 0`;

      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },

  createPost: async (
    userId,
    title,
    content,
    link = "",
    community_id,
    tags,
    post_type
  ) => {
    if (typeof link !== "string") {
      throw new Error("Link must be a string");
    }

    if (!Array.isArray(tags)) {
      tags = tags.split(",").map((tag) => tag.trim());
    }

    try {
      // Insert the post into the posts table
      const uniqueId = generateUniqueId();

      // Insert into the posts table
      await sql.query`INSERT INTO posts (id, user_id, title, content, link, communities_id, post_type) VALUES (${uniqueId}, ${userId}, ${title}, ${content}, ${link}, ${community_id}, ${post_type})`;

      if (tags && tags.length > 0) {
        for (const tag of tags) {
          // Find or create the tag and get its id
          let tagId;
          const tagRecord =
            await sql.query`SELECT id FROM tags WHERE name = ${tag}`;
          if (tagRecord.recordset.length > 0) {
            tagId = tagRecord.recordset[0].id;
          } else {
            // If tag does not exist, create it
            const newTag =
              await sql.query`INSERT INTO tags (name) OUTPUT INSERTED.id VALUES (${tag})`;
            tagId = newTag.recordset[0].id;
          }
          // Associate the tag with the post
          await sql.query`INSERT INTO post_tags (post_id, tag_id) VALUES (${uniqueId}, ${tagId})`;
        }
      }

      // Record user's upvote and set boosts and detracts
      await sql.query`INSERT INTO UserPostActions (post_id, user_id, action_type) VALUES (${uniqueId}, ${userId}, 'B')`;

      return uniqueId;
    } catch (err) {
      console.error("Database insert error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },

  getTagsByPostId: async (postId) => {
    try {
      const result = await sql.query`
        SELECT t.name
        FROM tags t
        JOIN post_tags pt ON t.id = pt.tag_id
        WHERE pt.post_id = ${postId}`;

      return result.recordset.map((record) => record.name);
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getAllTags: async () => {
    try {
      const result = await sql.query`SELECT * FROM tags`;
      return result.recordset;
    } catch (err) {
      return JSON.stringify(err);
    }
  },

  deletePostById: async (postId) => {
    try {
      await sql.query`UPDATE posts SET deleted = 1 WHERE id = ${postId}`;
    } catch (err) {
      console.error("Database delete error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },

  interactWithPost: async (postId, userId, actionType) => {
    try {
      // Validate actionType
      if (
        ![
          "LOVE",
          "LIKE",
          "CURIOUS",
          "INTERESTING",
          "CELEBRATE",
          "BOOST",
        ].includes(actionType)
      ) {
        throw new Error("Invalid action type");
      }

      if (actionType === "BOOST") {
        actionType = "B";
      }

      // Check if the user has already interacted with the post
      const userAction = await sql.query`
        SELECT action_type 
        FROM userPostActions 
        WHERE user_id = ${userId} AND post_id = ${postId}`;

      if (userAction.recordset.length === 0) {
        // If no previous interaction, insert new action
        await sql.query`
          INSERT INTO userPostActions (user_id, post_id, action_type) 
          VALUES (${userId}, ${postId}, ${actionType})`;
      } else if (userAction.recordset[0].action_type !== actionType) {
        // If existing interaction is different, update action
        await sql.query`
          UPDATE userPostActions 
          SET action_type = ${actionType}
          WHERE user_id = ${userId} AND post_id = ${postId}`;
      } else {
        // If user is repeating the same action, remove the action
        await sql.query`
          DELETE FROM userPostActions 
          WHERE user_id = ${userId} AND post_id = ${postId}`;
      }

      // Recalculate and update the reactions count for the post
      const reactionCounts = await sql.query`
        SELECT action_type, COUNT(*) as count 
        FROM userPostActions 
        WHERE post_id = ${postId}
        GROUP BY action_type`;

      // Initialize reaction counts
      let loveCount = 0,
        likeCount = 0,
        curiousCount = 0,
        interestingCount = 0,
        celebrateCount = 0,
        boostCount = 0;

      // Update reaction counts based on the query result
      reactionCounts.recordset.forEach((row) => {
        switch (row.action_type) {
          case "LOVE":
            loveCount = row.count;
            break;
          case "LIKE":
            likeCount = row.count;
            break;
          case "CURIOUS":
            curiousCount = row.count;
            break;
          case "INTERESTING":
            interestingCount = row.count;
            break;
          case "CELEBRATE":
            celebrateCount = row.count;
            break;
          case "B":
            boostCount = row.count;
            break;
        }
      });

      // Update the post with new reaction counts
      await sql.query`
        UPDATE posts 
        SET react_love = ${loveCount}, 
        react_like = ${likeCount},
        react_curious = ${curiousCount},
        react_interesting = ${interestingCount},
        react_celebrate = ${celebrateCount},
        boosts = ${boostCount}
        WHERE id = ${postId}`;

      // Return updated post info (or just the new reaction counts)
      return {
        love: loveCount,
        like: likeCount,
        curious: curiousCount,
        interesting: interestingCount,
        celebrate: celebrateCount,
        boosts: boostCount,
      };
    } catch (err) {
      console.error("Database update error:", err);
      throw err;
    }
  },
  

  getUserInteractions: async (postId, userId) => {
    try {
      const result = await sql.query`
    SELECT action_type 
    FROM userPostActions 
      WHERE user_id = ${userId} AND post_id = ${postId}`;

      if (result.recordset.length === 0) {
        return "";
      } else {
        let actionType = result.recordset[0].action_type;
        if (actionType.includes("B")) {
          actionType = "BOOST";
        }
        return actionType;
      }
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  removeDetract: async (postId, userId) => {
    try {
      // Update the detract count in posts table
      await sql.query`
        UPDATE posts 
        SET detracts = detracts - 1 
        WHERE id = ${postId}`;

      // Delete the record in userPostActions to indicate this user has removed the detract
      await sql.query`
        DELETE FROM userPostActions 
        WHERE user_id = ${userId} AND post_id = ${postId}`;

      const newScore =
        (await postQueries.getBoostCount(postId)) -
        (await postQueries.getDetractCount(postId));

      return newScore;
    } catch (err) {
      console.error("Database update error:", err);
      throw err; // Rethrow the error for the caller to handle
    }
  },
  getCommunityById: async (communityId) => {
    try {
      const result = await sql.query`
        SELECT * 
        FROM communities 
        WHERE id = ${communityId}`;

      return result.recordset[0];
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },
};

module.exports = postQueries;
