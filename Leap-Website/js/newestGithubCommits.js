// githubCommits.js
document.addEventListener("DOMContentLoaded", () => {
  const repos = ["Leap-Website", "Leap-VSCPlugin", "Leap-Syntax"];
  const commitsPerRepo = 5;
  const container = document.querySelector(".newestGithubCommits");
  if (!container) return;

  let ul = document.getElementById("commitList");
  if (!ul) {
    ul = document.createElement("ul");
    ul.id = "commitList";
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    container.appendChild(ul);
  }
  ul.innerHTML = "";

  function appendRepoHeader(name) {
    const li = document.createElement("li");
    li.textContent = name;
    li.style.color = "#fff";
    li.style.fontWeight = "bold";
    li.style.marginTop = "1em";
    ul.appendChild(li);
  }

  function appendCommit(commit) {
    const date = new Date(commit.commit.author.date).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const msg = commit.commit.message.split("\n")[0];
    const authorName = commit.commit.author.name;
    const login = commit.author?.login || authorName;
    const avatarUrl = commit.author?.avatar_url ||
      "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";

    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.color = "#fff";
    li.style.fontWeight = "bold";
    li.style.marginLeft = "1em";
    li.style.marginTop = "0.1em";

    // Avatar-Wrapper
    const avatarWrapper = document.createElement("div");
    avatarWrapper.className = "avatar-wrapper";
    avatarWrapper.style.position = "relative";
    avatarWrapper.style.flexShrink = "0";

    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = login;
    img.className = "commit-avatar";
    avatarWrapper.appendChild(img);

    // Tooltip mit GitHub-Login
    const tooltip = document.createElement("span");
    tooltip.className = "avatar-tooltip";
    tooltip.textContent = login;
    avatarWrapper.appendChild(tooltip);

    li.appendChild(avatarWrapper);

    // Commit-Info (Datum & Nachricht)
    const infoSpan = document.createElement("span");
    infoSpan.className = "commit-info";
    infoSpan.textContent = ` ${date} | ${msg} `;
    li.appendChild(infoSpan);



    ul.appendChild(li);
  }

  async function handleRepo(repoName) {
    appendRepoHeader(repoName);
    const url = `https://api.github.com/repos/Leap-by-Focus/${repoName}/commits?per_page=${commitsPerRepo}`;
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        const emptyLi = document.createElement("li");
        emptyLi.textContent = "Keine Commits verfügbar.";
        emptyLi.style.color = "white";
        emptyLi.style.marginLeft = "1em";
        ul.appendChild(emptyLi);
        return;
      }
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const commits = await res.json();
      if (commits.length === 0) {
        const emptyLi = document.createElement("li");
        emptyLi.textContent = "Keine Commits verfügbar.";
        emptyLi.style.color = "white";
        emptyLi.style.marginLeft = "1em";
        ul.appendChild(emptyLi);
      } else {
        commits.forEach(c => appendCommit(c));
      }
    } catch (err) {
      const errLi = document.createElement("li");
      errLi.textContent = `Fehler: ${err.message}`;
      errLi.style.color = "salmon";
      errLi.style.marginLeft = "1em";
      ul.appendChild(errLi);
    }
  }

  (async () => {
    for (let repo of repos) {
      await handleRepo(repo);
    }
  })();
});