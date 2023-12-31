const express = require("express");
const path = require("path");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
const methodOverride = require("method-override");
const sql = require("mssql");

// Custom modules
const environment = require("./config/environment");
const dbConfig = require("./config/dbConfig");
const userQueries = require("./queries/userQueries");
const passportConfig = require("./config/passportConfig");
const errorHandler = require("./middleware/errorHandling");
const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const commentRoutes = require("./routes/commentRoutes");
const apiRoutes = require("./routes/apiRoutes");
const generalRoutes = require("./routes/generalRoutes");

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
  userQueries.findByUsername
);

// Express app setup
app.set("view-engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));app.use(flash());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: environment.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: environment.isProduction, maxAge: 1000 * 60 * 60 * 24 },
  })
);
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
app.use("/api", apiRoutes);
app.use(generalRoutes);

// Error handling
app.use(errorHandler);

// Server start
app.listen(environment.port, () => {
  console.log(`Server running on http://localhost:${environment.port}`);
});

module.exports = app;
