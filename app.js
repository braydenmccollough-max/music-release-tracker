const GENRES = [
  "All",
  "Rap",
  "Rock",
  "Pop",
  "Metal",
  "Country",
  "Alternative",
  "Grunge",
  "R&B/Soul",
  "Americana",
  "Reggae",
  "Other"
];

const GENRE_KEYWORDS = {
  Rap: ["rap", "hip-hop", "hip hop", "trap", "drill"],
  Rock: ["rock", "classic rock", "hard rock", "southern rock"],
  Pop: ["pop", "dance pop", "electropop"],
  Metal: ["metal", "nu metal", "heavy metal", "metalcore", "hardcore"],
  Country: ["country", "modern country", "country pop"],
  Alternative: ["alternative", "alt", "indie", "emo", "post-hardcore"],
  Grunge: ["grunge", "post-grunge", "seattle sound"],
  "R&B/Soul": ["r&b", "rnb", "soul", "neo soul", "contemporary r&b"],
  Americana: ["americana", "folk", "roots", "singer-songwriter", "red dirt"],
  Reggae: ["reggae", "ska", "dub", "roots reggae", "reggae rock"]
};

const STATUS_WINDOW_DAYS = 7;

const state = {
  releases: [],
  activeGenre: "All",
  search: "",
  status: "all"
};

const elements = {
  tabs: document.querySelector("#genreTabs"),
  grid: document.querySelector("#releaseGrid"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  lastUpdated: document.querySelector("#lastUpdated"),
  releaseCount: document.querySelector("#releaseCount"),
  newTotal: document.querySelector("#newTotal"),
  upcomingTotal: document.querySelector("#upcomingTotal"),
  droppedTotal: document.querySelector("#droppedTotal"),
  activeGenreTitle: document.querySelector("#activeGenreTitle"),
  activeGenreDescription: document.querySelector("#activeGenreDescription")
};

function inferGenre(release) {
  if (release.genre && GENRES.includes(release.genre)) return release.genre;

  const tags = [release.genre, ...(release.genreTags || [])]
    .filter(Boolean)
    .map((tag) => tag.toLowerCase());

  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (tags.some((tag) => keywords.some((keyword) => tag.includes(keyword)))) {
      return genre;
    }
  }

  return "Other";
}

function getStatus(releaseDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(`${releaseDate}T00:00:00`);
  const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

  if (date > today) return "Upcoming";
  if (diffDays >= 0 && diffDays <= STATUS_WINDOW_DAYS) return "New";
  return "Already Dropped";
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${dateString}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeRelease(release) {
  const genre = inferGenre(release);
  const status = getStatus(release.releaseDate);

  // Backward compatibility with older data where title was "Artist — Release".
  let artist = release.artist || "";
  let title = release.title || "Untitled release";
  if (!artist && title.includes(" — ")) {
    const parts = title.split(" — ");
    artist = parts.shift();
    title = parts.join(" — ");
  }

  return {
    ...release,
    artist,
    title,
    releaseType: release.releaseType || release.type || "Release",
    genre,
    status
  };
}

function renderTabs() {
  elements.tabs.innerHTML = GENRES.map((genre) => {
    const active = genre === state.activeGenre ? "active" : "";
    return `<button class="genre-tab ${active}" data-genre="${genre}">${genre}</button>`;
  }).join("");

  elements.tabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeGenre = button.dataset.genre;
      render();
    });
  });
}

function getFilteredReleases() {
  const search = state.search.toLowerCase().trim();

  return state.releases
    .filter((release) => state.activeGenre === "All" || release.genre === state.activeGenre)
    .filter((release) => state.status === "all" || release.status === state.status)
    .filter((release) => {
      if (!search) return true;
      return [release.artist, release.title, release.genre, release.releaseType]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search));
    })
    .sort((a, b) => {
      if (a.status === "Upcoming" && b.status !== "Upcoming") return -1;
      if (b.status === "Upcoming" && a.status !== "Upcoming") return 1;
      return new Date(b.releaseDate) - new Date(a.releaseDate);
    });
}

function statusClass(status) {
  if (status === "New") return "status-new";
  if (status === "Upcoming") return "status-upcoming";
  return "status-dropped";
}

function renderCards() {
  const releases = getFilteredReleases();
  elements.empty.hidden = releases.length > 0;

  elements.grid.innerHTML = releases.map((release) => `
    <article class="release-card">
      <div>
        <div class="release-meta-row">
          <span class="card-label">${escapeHtml(release.releaseType)}</span>
          <span class="genre-chip">${escapeHtml(release.genre)}</span>
        </div>
        <p class="release-artist">${escapeHtml(release.artist || "Unknown artist")}</p>
        <h3 class="release-title">${escapeHtml(release.title)}</h3>
      </div>
      <div>
        <p class="release-date"><strong>Release date:</strong> ${formatDate(release.releaseDate)}</p>
        <span class="status-pill ${statusClass(release.status)}">${release.status}</span>
      </div>
    </article>
  `).join("");
}

function renderStats() {
  const totals = state.releases.reduce((acc, release) => {
    acc[release.status] = (acc[release.status] || 0) + 1;
    return acc;
  }, {});

  elements.newTotal.textContent = totals.New || 0;
  elements.upcomingTotal.textContent = totals.Upcoming || 0;
  elements.droppedTotal.textContent = totals["Already Dropped"] || 0;
  elements.releaseCount.textContent = `${state.releases.length} releases tracked`;
}

function renderHeading() {
  const genre = state.activeGenre;
  elements.activeGenreTitle.textContent = genre === "All" ? "All Genres" : genre;
  elements.activeGenreDescription.textContent = genre === "All"
    ? "Everything currently tracked."
    : `Releases automatically categorized under ${genre}.`;
}

function render() {
  renderTabs();
  renderHeading();
  renderStats();
  renderCards();
}

async function loadData() {
  try {
    const response = await fetch(`data/releases.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.releases = (data.releases || [])
      .filter((release) => release.releaseDate)
      .map(normalizeRelease);
    elements.lastUpdated.textContent = data.updatedAt
      ? formatDate(data.updatedAt.slice(0, 10))
      : "Not updated yet";
  } catch (error) {
    console.error("Could not load release data:", error);
    state.releases = [];
  }

  render();
}

elements.search.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

elements.statusFilter.addEventListener("change", (event) => {
  state.status = event.target.value;
  render();
});

loadData();
