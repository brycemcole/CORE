const express = require("express");
const path = require("path");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const methodOverride = require("method-override");
const sql = require("mssql");
const rateLimit = require("express-rate-limit");
const MS_PER_HOUR = 3600000;

const environment = require("./config/environment");
const dbConfig = require("./config/dbConfig");
const userQueries = require("./queries/userQueries");
const passportConfig = require("./config/passportConfig");
const errorHandler = require("./middleware/errorHandling");
const authRoutes = require("./routes/authRoutes");
const jobRoutes = require("./routes/jobRoutes");
const adminRoutes = require("./routes/adminRoutes");
const searchRoutes = require("./routes/searchRoutes");
const postRoutes = require("./routes/postRoutes");
const commentRoutes = require("./routes/commentRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const apiRoutes = require("./routes/apiRoutes");
const generalRoutes = require("./routes/generalRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const communityRoutes = require("./routes/communityRoutes");
const jobBoardService = require("./services/jobBoardService");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: "bro please azure costs are so high",
});
const app = express();

// Database connection
sql
  .connect(dbConfig)
  .catch((err) => console.error("Error connecting to the database:", err));

// Passport configuration
passportConfig.initialize(
  passport,
  userQueries.findByEmail,
  userQueries.findById,
  userQueries.findByUsername,
  userQueries.findByGitHubUsername,
  userQueries.findByGithubId,
  userQueries.updateGitHubId,
  userQueries.updateUserGitHubAccessToken,
  userQueries.updateGitHubUsername,
  userQueries.createUserFromGitHubProfile,
  userQueries.findByGoogleId,
  userQueries.createUserFromGoogleProfile
);

// Express app setup
app.set("view-engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(flash());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: environment.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: environment.isProduction, maxAge: 1000 * 60 * 60 * 24 },
  })
);
app.use(limiter);

app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Routes
app.use(authRoutes);
app.use(postRoutes);
app.use(commentRoutes);
app.use("/admin", adminRoutes);
app.use("/search", searchRoutes);
app.use("/jobs", jobRoutes);
app.use("/api", apiRoutes);
app.use("/notifications", notificationRoutes);
app.use("/favorites", favoriteRoutes);
app.use("/c", communityRoutes);
app.use(generalRoutes);

app.use((req, res, next) => {
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  next();
});
// Error handling
app.use(errorHandler);



function runJobBoardService() {
  console.log("Job board service started");
  jobBoardService
    .start()
    .then(() => {
      console.log("Job board service completed successfully");
    })
    .catch((error) => {
      console.error("Error running job board service:", error);
    })
    .finally(() => {
      scheduleNextRun();
    });
}

function scheduleNextRun() {
  const delayHours = 12 + Math.random() * 6;
  const delayMs = delayHours * MS_PER_HOUR;

  console.log(
    `Next job board service run scheduled in ${delayHours.toFixed(2)} hours`
  );

  setTimeout(runJobBoardService, delayMs);
}

module.exports = app;
