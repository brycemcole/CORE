const app = require("./app");
const environment = require("./config/environment");
const jobBoardService = require("./services/jobBoardService");
const cluster = require("cluster");

const MS_PER_HOUR = 3600000;

function runJobBoardService() {
  if (cluster.isPrimary) {
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
}

function scheduleNextRun() {
  const delayHours = 12 + Math.random() * 6;
  const delayMs = delayHours * MS_PER_HOUR;

  console.log(
    `Next job board service run scheduled in ${delayHours.toFixed(2)} hours`
  );

  setTimeout(runJobBoardService, delayMs);
}

app.listen(environment.port, () => {
  console.log(
    `Worker ${
      cluster.worker ? cluster.worker.id : "Master"
    } running on http://localhost:${environment.port}`
  );
  // Uncomment the following line when you're ready to run the job board service
  if (cluster.isPrimary) {
    //runJobBoardService();
  }
});
