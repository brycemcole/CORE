document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/job-postings") // Replace with your actual API route
    .then((response) => response.json())
    .then((jobPostings) => {
      const jobListContainer = document.querySelector(".job-list");

      jobPostings.forEach((job) => {
        const jobElement = document.createElement("div");
        jobElement.classList.add("job");
        jobElement.onclick = () => {
          window.location.href = `/jobs/${job.id}`;
        };

        jobElement.innerHTML = `
        <div class="job-preview">
        <div class="job-info">
          <div class="company-info">
          <img src="${job.company_logo}" alt="${job.company_name} logo" /> 
          <p class="company-name">${job.company_name}</p>
        </div>
          <h3 class="job-title">${job.title}</h3>
          <p class="job-description">${job.description}</p>
          <div class="job-posting- flairs">
          <span class="job-flair" id="location-flair"><p class="job-location">${
            job.location
          }</p></span>
          <span class="job-flair" id="pay-flair"><p class="salary-range">$${Math.floor(
            (job.salary + job.salary_max) / 2 / 1000
          )}k</p></span>
          <span class="job-flair"><p class="experience-level">${
            job.experienceLevel
          }</p></span>
          <span class="job-flair"><p class="posted-date">${formatDate(
            job.postedDate
          )}</p></span>
          </div>
        </div>
      </div>
          `;

        jobListContainer.appendChild(jobElement);
      });
    })
    .catch((error) => {
      console.error("Error fetching job postings:", error);
    });
});

function formatDate(dateString) {
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}
