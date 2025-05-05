// githubCommits.js
document.addEventListener("DOMContentLoaded", () => {
    // exakt so, wie sie in "name" stehen
    const repos = [
      "Leap-Website",
      "Leap-VSCode-Plugin",
      "Leap-Syntax-Highlighter"
    ];
    const commitsPerRepo = 5;
  
    const container = document.querySelector(".newestGithubCommits");
    if (!container) return console.error("Kein .newestGithubCommits-Container gefunden");
  
    // wir legen hier eine UL an, wenn noch keine da ist
    let ul = document.getElementById("commitList");
    if (!ul) {
      ul = document.createElement("ul");
      ul.id = "commitList";
      ul.style.listStyle = "none";
      ul.style.padding = "0";
      container.appendChild(ul);
    }
    ul.innerHTML = "";
  
    async function fetchLatestCommits(repoName, count = commitsPerRepo) {
      const url = `https://api.github.com/repos/Leap-by-Focus/${repoName}/commits?per_page=${count}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GitHub ${res.status} für ${repoName}`);
      return res.json();
    }
  
    async function renderCommits() {
      for (let repo of repos) {
        // Repo-Überschrift
        const headerLi = document.createElement("li");
        headerLi.textContent = repo;
        headerLi.style.color = "#fff";
        headerLi.style.fontWeight = "bold";
        headerLi.style.marginTop = "1em";
        ul.appendChild(headerLi);
  
        try {
          const commits = await fetchLatestCommits(repo);
          commits.forEach(c => {
            const date = new Date(c.commit.author.date)
              .toLocaleDateString("de-DE", {
                day: "2-digit", month: "2-digit", year: "numeric"
              });
            const li = document.createElement("li");
            li.textContent = `${date} | ${c.commit.message.split("\n")[0]} | ${c.commit.author.name}`;
            li.style.color = "#fff";
            li.style.fontWeight = "bold";
            li.style.marginLeft = "1em";
            ul.appendChild(li);
          });
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