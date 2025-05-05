// githubCommits.js

document.addEventListener("DOMContentLoaded", () => {
    const repos = ["Leap-Website", "Leap-VSCPlugin", "Leap-Syntax"];
    const commitsPerRepo = 5;
  
    const container = document.querySelector(".newestGithubCommits");
    if (!container) {
      console.error("❌ Kein .newestGithubCommits-Container gefunden");
      return;
    }
  
    let ul = container.querySelector("#commitList");
    if (!ul) {
      ul = document.createElement("ul");
      ul.id = "commitList";
      container.appendChild(ul);
    }
  
    async function fetchLatestCommits(repoName, count = 5) {
      const url = `https://api.github.com/repos/Leap-by-Focus/${repoName}/commits?per_page=${count}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GitHub API ${res.status} für ${repoName}`);
      return res.json();
    }
  
    async function renderCommits() {
      ul.innerHTML = "";
  
      for (let repo of repos) {
        // Repo-Überschrift
        const headerLi = document.createElement("li");
        headerLi.innerHTML = `<strong style="display:block; margin-top:1em;">${repo}</strong>`;
        ul.appendChild(headerLi);
  
        try {
          const commits = await fetchLatestCommits(repo, commitsPerRepo);
          if (!Array.isArray(commits) || commits.length === 0) {
            const emptyLi = document.createElement("li");
            emptyLi.textContent = "Keine Commits gefunden.";
            ul.appendChild(emptyLi);
            continue;
          }
  
          for (let c of commits) {
            const date = new Date(c.commit.author.date)
              .toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });
            const message = c.commit.message.split("\n")[0];
            const author = c.commit.author.name;
  
            const li = document.createElement("li");
            li.textContent = `${date} | ${message} | ${author}`;
            ul.appendChild(li);
          }
        } catch (err) {
          const errLi = document.createElement("li");
          errLi.textContent = `Fehler bei ${repo}: ${err.message}`;
          errLi.style.color = "salmon";
          ul.appendChild(errLi);
        }
      }
    }
  
    renderCommits();
  });