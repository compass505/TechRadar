const ROUTES = [
  { key: "top", label: "TOP" },
  { key: "yesterday-ai", label: "昨日のAIニュース" },
  { key: "yesterday-enterprise-it", label: "昨日の企業ITニュース" },
  { key: "yesterday-development", label: "昨日の開発ニュース" },
  { key: "archive", label: "過去のニュース一覧" },
  { key: "search", label: "検索" },
  { key: "favorites", label: "お気に入り" },
];

const FACET_LABELS = {
  ai: "AI",
  enterprise_it: "企業IT",
  security: "セキュリティ",
  development: "開発",
  cloud: "クラウド",
};

const state = {
  stories: [],
  storiesById: new Map(),
  manifest: null,
  edition: null,
  route: "top",
  archiveTab: "all",
  searchQuery: "",
  favorites: new Set(JSON.parse(localStorage.getItem("favorites") || "[]")),
};

const nav = document.querySelector("#primary-nav");
const editionSelect = document.querySelector("#edition-select");
const eyebrow = document.querySelector("#eyebrow");
const pageTitle = document.querySelector("#page-title");
const pageMeta = document.querySelector("#page-meta");
const pageContent = document.querySelector("#page-content");
const cardTemplate = document.querySelector("#story-card-template");

async function boot() {
  const [manifest, stories] = await Promise.all([
    fetch("data/manifest.json").then((response) => response.json()),
    fetch("data/stories.json").then((response) => response.json()),
  ]);

  state.manifest = manifest;
  state.stories = stories;
  state.storiesById = new Map(stories.map((story) => [story.id, story]));

  renderNav();
  renderEditionPicker();
  await loadEdition(manifest.default_edition_date);
}

function renderNav() {
  nav.innerHTML = "";
  ROUTES.forEach((route) => {
    const button = document.createElement("button");
    button.textContent = route.label;
    button.className = route.key === state.route ? "active" : "";
    button.addEventListener("click", () => {
      state.route = route.key;
      renderNav();
      renderPage();
    });
    nav.append(button);
  });
}

function renderEditionPicker() {
  editionSelect.innerHTML = "";
  state.manifest.editions
    .slice()
    .reverse()
    .forEach((edition) => {
      const option = document.createElement("option");
      option.value = edition.date;
      option.textContent = edition.date;
      editionSelect.append(option);
    });

  editionSelect.value = state.manifest.default_edition_date;
  editionSelect.addEventListener("change", async (event) => {
    await loadEdition(event.target.value);
  });
}

async function loadEdition(editionDate) {
  const target = state.manifest.editions.find((edition) => edition.date === editionDate);
  state.edition = await fetch(target.path).then((response) => response.json());
  renderPage();
}

function renderPage() {
  switch (state.route) {
    case "top":
      renderTop();
      break;
    case "yesterday-ai":
      renderSurface("昨日のAIニュース", "yesterday_ai");
      break;
    case "yesterday-enterprise-it":
      renderSurface("昨日の企業ITニュース", "yesterday_enterprise_it");
      break;
    case "yesterday-development":
      renderSurface("昨日の開発ニュース", "yesterday_development");
      break;
    case "archive":
      renderArchive();
      break;
    case "search":
      renderSearch();
      break;
    case "favorites":
      renderFavorites();
      break;
  }
}

function setHeader(title, meta, eyebrowText = "News Surfaces") {
  eyebrow.textContent = eyebrowText === "News Surfaces" ? "Tech Radar 505" : eyebrowText;
  pageTitle.textContent = title;
  pageMeta.textContent = meta;
}

function getStories(ids) {
  return ids.map((id) => state.storiesById.get(id)).filter(Boolean);
}

function renderTop() {
  setHeader(
    "TOP",
    `${state.edition.edition_date} 朝の版`,
    "Yesterday + recent"
  );
  pageContent.innerHTML = "";
  pageContent.append(
    renderSection(
      "昨日のニュース",
      getStories(state.edition.surfaces.top_yesterday),
      "ITmedia 5件 + 他媒体 最大3件"
    )
  );
  pageContent.append(
    renderSection(
      "直近の重要ニュース",
      getStories(state.edition.surfaces.recent_important),
      "前日を含む直近3日間 / 重要度4以上"
    )
  );
}

function renderSurface(title, key) {
  setHeader(title, `${state.edition.edition_date} 朝の版`, "Yesterday");
  pageContent.innerHTML = "";
  pageContent.append(
    renderSection(
      title,
      getStories(state.edition.surfaces[key]),
      "前日分"
    )
  );
}

function renderSection(title, stories, note) {
  const section = document.createElement("section");
  section.className = "section";

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `<h2>${title}</h2><span>${note}</span>`;
  section.append(header);

  if (!stories.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "この条件に合うニュースはありません。";
    section.append(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "story-grid";
  stories.forEach((story) => grid.append(renderStoryCard(story)));
  section.append(grid);
  return section;
}

function renderStoryCard(story) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".story-card");
  const badges = fragment.querySelector(".badges");
  const favoriteButton = fragment.querySelector(".favorite-button");
  const title = fragment.querySelector("h3");
  const meta = fragment.querySelector(".story-meta");
  const link = fragment.querySelector(".story-link");

  [
    `重要度 ${story.importance_score}`,
    story.representative_source,
    ...story.facets.map((facet) => FACET_LABELS[facet] || facet),
  ].forEach((label) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = label;
    badges.append(badge);
  });

  favoriteButton.textContent = state.favorites.has(story.id) ? "★" : "☆";
  favoriteButton.classList.toggle("active", state.favorites.has(story.id));
  favoriteButton.addEventListener("click", () => toggleFavorite(story.id));

  title.textContent = story.title;
  meta.textContent = `${story.published_date} · ${story.source_count}媒体`;
  link.href = story.representative_url;
  return card;
}

function toggleFavorite(storyId) {
  if (state.favorites.has(storyId)) {
    state.favorites.delete(storyId);
  } else {
    state.favorites.add(storyId);
  }
  localStorage.setItem("favorites", JSON.stringify([...state.favorites]));
  renderPage();
}

function renderArchive() {
  setHeader("過去のニュース一覧", "すべて / AI / 企業IT / 開発", "Archive");
  pageContent.innerHTML = "";

  const tabRow = document.createElement("div");
  tabRow.className = "tab-row";
  [
    ["all", "すべて"],
    ["ai", "AI"],
    ["enterprise_it", "企業IT"],
    ["development", "開発"],
  ].forEach(([key, label]) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.className = key === state.archiveTab ? "active" : "";
    button.addEventListener("click", () => {
      state.archiveTab = key;
      renderArchive();
    });
    tabRow.append(button);
  });
  pageContent.append(tabRow);

  const stories = state.stories
    .filter((story) => state.archiveTab === "all" || story.facets.includes(state.archiveTab))
    .sort((left, right) => right.published_date.localeCompare(left.published_date));
  pageContent.append(renderSection("ニュース一覧", stories, `${stories.length}件`));
}

function renderSearch() {
  setHeader("検索", "タイトル・媒体・タグで検索", "Search");
  pageContent.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "search-shell";

  const input = document.createElement("input");
  input.className = "search-input";
  input.placeholder = "例: OpenAI / 脆弱性 / Publickey";
  input.value = state.searchQuery;
  input.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    renderSearch();
  });
  shell.append(input);

  const query = state.searchQuery.trim().toLowerCase();
  const stories = !query
    ? []
    : state.stories.filter((story) =>
        [
          story.title,
          story.representative_source,
          ...story.sources,
          ...story.facets,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
  shell.append(
    renderSection(
      "検索結果",
      stories,
      query ? `${stories.length}件` : "検索語を入力してください"
    )
  );
  pageContent.append(shell);
}

function renderFavorites() {
  setHeader("お気に入り", "あとで読み返すための保存先", "Saved");
  pageContent.innerHTML = "";
  const stories = [...state.favorites]
    .map((id) => state.storiesById.get(id))
    .filter(Boolean);
  pageContent.append(renderSection("保存したニュース", stories, `${stories.length}件`));
}

boot();
