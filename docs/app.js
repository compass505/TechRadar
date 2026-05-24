const NAV_ITEMS = [
  {
    key: "yesterday",
    label: "昨日のニュース",
    dropdown: [
      { label: "AIニュース", route: "yesterday", yesterdayTab: "ai" },
      { label: "企業ITニュース", route: "yesterday", yesterdayTab: "enterprise_it" },
      { label: "開発ニュース", route: "yesterday", yesterdayTab: "development" },
    ],
  },
  { key: "important", label: "直近の重大ニュース", route: "important" },
  {
    key: "archive",
    label: "過去ニュース",
    dropdown: [
      { label: "AIニュース", route: "archive", archiveTab: "ai" },
      { label: "企業ITニュース", route: "archive", archiveTab: "enterprise_it" },
      { label: "開発ニュース", route: "archive", archiveTab: "development" },
    ],
  },
  { key: "search", label: "検索", route: "search" },
  { key: "favorites", label: "お気に入り", route: "favorites" },
];

const FACET_LABELS = {
  ai: "AI",
  enterprise_it: "企業IT",
  security: "セキュリティ",
  development: "開発",
  cloud: "クラウド",
};

const DISPLAY_FACET_PRIORITY = ["security", "ai", "development", "cloud", "enterprise_it"];
const DATA_VERSION = "news-20260525-1";
const FAVORITES_RESET_KEY = "favorites-reset-version";

function loadFavorites() {
  if (localStorage.getItem(FAVORITES_RESET_KEY) !== DATA_VERSION) {
    localStorage.setItem("favorites", "[]");
    localStorage.setItem(FAVORITES_RESET_KEY, DATA_VERSION);
    return new Set();
  }

  try {
    return new Set(JSON.parse(localStorage.getItem("favorites") || "[]"));
  } catch {
    localStorage.setItem("favorites", "[]");
    return new Set();
  }
}

const state = {
  stories: [],
  storiesById: new Map(),
  manifest: null,
  edition: null,
  route: "top",
  yesterdayTab: "all",
  archiveTab: "all",
  openMenu: "",
  searchQuery: "",
  favorites: loadFavorites(),
};

const brandHome = document.querySelector("#brand-home");
const nav = document.querySelector("#primary-nav");
const headerDropdown = document.querySelector("#header-dropdown");
const editionSelect = document.querySelector("#edition-select");
const eyebrow = document.querySelector("#eyebrow");
const pageTitle = document.querySelector("#page-title");
const pageMeta = document.querySelector("#page-meta");
const pageContent = document.querySelector("#page-content");
const cardTemplate = document.querySelector("#story-card-template");

function dataUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${DATA_VERSION}`;
}

async function boot() {
  const [manifest, stories] = await Promise.all([
    fetch(dataUrl("data/manifest.json")).then((response) => response.json()),
    fetch(dataUrl("data/stories.json")).then((response) => response.json()),
  ]);

  state.manifest = manifest;
  state.stories = stories;
  state.storiesById = new Map(stories.map((story) => [story.id, story]));

  brandHome.addEventListener("click", () => {
    state.route = "top";
    state.openMenu = "";
    renderNav();
    renderPage();
  });

  renderNav();
  renderEditionPicker();
  await loadEdition(manifest.default_edition_date);
}

function renderNav() {
  nav.innerHTML = "";
  NAV_ITEMS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.className = navItemIsActive(item) ? "active" : "";
    button.setAttribute("aria-expanded", item.dropdown ? String(state.openMenu === item.key) : "false");

    button.addEventListener("click", () => {
      if (item.dropdown) {
        state.openMenu = state.openMenu === item.key ? "" : item.key;
        renderNav();
        return;
      }

      state.route = item.route;
      state.openMenu = "";
      renderNav();
      renderPage();
    });

    nav.append(button);
  });

  renderHeaderDropdown();
}

function navItemIsActive(item) {
  if (item.key === "yesterday") {
    return state.route === "yesterday";
  }
  if (item.key === "archive") {
    return state.route === "archive";
  }
  return state.route === item.route;
}

function renderHeaderDropdown() {
  headerDropdown.innerHTML = "";
  const item = NAV_ITEMS.find((navItem) => navItem.key === state.openMenu);
  if (!item || !item.dropdown) {
    headerDropdown.hidden = true;
    return;
  }

  item.dropdown.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.label;
    button.className = dropdownItemIsActive(entry) ? "active" : "";
    button.addEventListener("click", () => {
      state.route = entry.route;
      if (entry.yesterdayTab) {
        state.yesterdayTab = entry.yesterdayTab;
      }
      if (entry.archiveTab) {
        state.archiveTab = entry.archiveTab;
      }
      state.openMenu = "";
      renderNav();
      renderPage();
    });
    headerDropdown.append(button);
  });

  headerDropdown.hidden = false;
}

function dropdownItemIsActive(entry) {
  if (entry.route !== state.route) {
    return false;
  }
  if (entry.yesterdayTab) {
    return state.yesterdayTab === entry.yesterdayTab;
  }
  if (entry.archiveTab) {
    return state.archiveTab === entry.archiveTab;
  }
  return true;
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
  if (!target) {
    return;
  }
  state.edition = await fetch(dataUrl(target.path)).then((response) => response.json());
  renderPage();
}

function renderPage() {
  switch (state.route) {
    case "top":
      renderTop();
      break;
    case "yesterday":
      renderYesterday();
      break;
    case "yesterday-ai":
      state.yesterdayTab = "ai";
      state.route = "yesterday";
      renderYesterday();
      break;
    case "yesterday-enterprise-it":
      state.yesterdayTab = "enterprise_it";
      state.route = "yesterday";
      renderYesterday();
      break;
    case "yesterday-development":
      state.yesterdayTab = "development";
      state.route = "yesterday";
      renderYesterday();
      break;
    case "important":
      renderImportant();
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

function setHeader(title, meta, eyebrowText = "TechRadar 505") {
  eyebrow.textContent = eyebrowText;
  pageTitle.textContent = title;
  pageMeta.textContent = meta;
}

function getStories(ids = []) {
  return ids.map((id) => state.storiesById.get(id)).filter(Boolean);
}

function renderTop() {
  setHeader("TOP", `${state.edition.edition_date} 版`, "Today");
  pageContent.innerHTML = "";
  pageContent.append(
    renderSection(
      "昨日のニュース",
      getStories(state.edition.surfaces.top_yesterday),
      "重要度の高い記事",
    ),
  );
  pageContent.append(
    renderSection(
      "直近の重大ニュース",
      getStories(state.edition.surfaces.recent_important),
      "昨日を含む直近3日 / 重要度4以上",
    ),
  );
}

function renderYesterday() {
  setHeader("昨日のニュース", `${yesterdayTabLabel()} / ${state.edition.edition_date} 版`, "Yesterday");
  pageContent.innerHTML = "";
  pageContent.append(renderYesterdayTabs());
  pageContent.append(
    renderSection(
      yesterdayTabLabel(),
      getYesterdayStories(),
      state.yesterdayTab === "all" ? "前日分すべて" : "前日分",
    ),
  );
}

function renderYesterdayTabs() {
  return renderTabRow(
    [
      ["all", "すべて"],
      ["ai", "AI"],
      ["enterprise_it", "企業IT"],
      ["development", "開発"],
    ],
    state.yesterdayTab,
    (key) => {
      state.yesterdayTab = key;
      renderYesterday();
      renderNav();
    },
  );
}

function getYesterdayStories() {
  if (state.yesterdayTab === "ai") {
    return getStories(state.edition.surfaces.yesterday_ai);
  }
  if (state.yesterdayTab === "enterprise_it") {
    return getStories(state.edition.surfaces.yesterday_enterprise_it);
  }
  if (state.yesterdayTab === "development") {
    return getStories(state.edition.surfaces.yesterday_development);
  }

  const targetDate = previousDate(state.edition.edition_date);
  return sortStories(state.stories.filter((story) => story.published_date === targetDate));
}

function previousDate(editionDate) {
  const [year, month, day] = editionDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function sortStories(stories) {
  return stories.slice().sort((left, right) => {
    const scoreDiff = Number(right.importance_score) - Number(left.importance_score);
    if (scoreDiff) {
      return scoreDiff;
    }
    const sourceDiff = Number(right.source_count) - Number(left.source_count);
    if (sourceDiff) {
      return sourceDiff;
    }
    return String(right.published_at || right.published_date).localeCompare(
      String(left.published_at || left.published_date),
    );
  });
}

function yesterdayTabLabel() {
  return {
    all: "すべて",
    ai: "AIニュース",
    enterprise_it: "企業ITニュース",
    development: "開発ニュース",
  }[state.yesterdayTab];
}

function renderImportant() {
  setHeader("直近の重大ニュース", `${state.edition.edition_date} 版`, "Important");
  pageContent.innerHTML = "";
  pageContent.append(
    renderSection(
      "直近の重大ニュース",
      getStories(state.edition.surfaces.recent_important),
      "昨日を含む直近3日 / 重要度4以上",
    ),
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
  const summary = fragment.querySelector(".story-summary");
  const reason = fragment.querySelector(".story-reason");
  const reasonText = fragment.querySelector(".story-reason p");
  const meta = fragment.querySelector(".story-meta");
  const link = fragment.querySelector(".source-button");

  const importanceScore = normalizeImportanceScore(story.importance_score);
  const importanceBadge = document.createElement("span");
  importanceBadge.className = `badge importance-badge importance-score-${importanceScore}`;
  importanceBadge.textContent = `重要度 ${importanceScore}`;
  badges.append(importanceBadge);

  const sourceBadge = document.createElement("span");
  sourceBadge.className = "badge source-badge";
  sourceBadge.textContent = story.representative_source || "Source";
  badges.append(sourceBadge);

  const categoryLabel = story.category || representativeFacetLabel(story);
  if (categoryLabel) {
    const categoryBadge = document.createElement("span");
    categoryBadge.className = "badge facet-badge";
    categoryBadge.textContent = categoryLabel;
    badges.append(categoryBadge);
  }

  favoriteButton.textContent = state.favorites.has(story.id) ? "★" : "☆";
  favoriteButton.classList.toggle("active", state.favorites.has(story.id));
  favoriteButton.addEventListener("click", () => toggleFavorite(story.id));

  title.textContent = story.title;
  summary.textContent = story.summary || "";
  summary.hidden = !story.summary;
  reasonText.textContent = story.reason || "";
  reason.hidden = !story.reason;
  meta.textContent = `${story.published_at || story.published_date} / ${story.source_count}媒体`;
  link.href = story.representative_url;
  return card;
}

function normalizeImportanceScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.round(value)));
}

function representativeFacetLabel(story) {
  const facets = Array.isArray(story.facets) ? story.facets : [];
  const primaryFacet =
    DISPLAY_FACET_PRIORITY.find((facet) => facets.includes(facet)) || facets[0];
  return primaryFacet ? FACET_LABELS[primaryFacet] || primaryFacet : "";
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
  setHeader("過去ニュース", `${archiveTabLabel()} / 全保存ニュース`, "Archive");
  pageContent.innerHTML = "";
  pageContent.append(
    renderTabRow(
      [
        ["all", "すべて"],
        ["ai", "AI"],
        ["enterprise_it", "企業IT"],
        ["development", "開発"],
      ],
      state.archiveTab,
      (key) => {
        state.archiveTab = key;
        renderArchive();
        renderNav();
      },
    ),
  );

  const stories = state.stories
    .filter((story) => state.archiveTab === "all" || story.facets.includes(state.archiveTab))
    .sort((left, right) => right.published_date.localeCompare(left.published_date));
  pageContent.append(renderSection("ニュース一覧", stories, `${stories.length}件`));
}

function renderTabRow(tabs, activeKey, onSelect) {
  const tabRow = document.createElement("div");
  tabRow.className = "tab-row";
  tabs.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = key === activeKey ? "active" : "";
    button.addEventListener("click", () => onSelect(key));
    tabRow.append(button);
  });
  return tabRow;
}

function archiveTabLabel() {
  return {
    all: "すべて",
    ai: "AIニュース",
    enterprise_it: "企業ITニュース",
    development: "開発ニュース",
  }[state.archiveTab];
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
          story.summary,
          story.reason,
          story.category,
          story.representative_source,
          ...story.sources,
          ...story.facets,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
  shell.append(
    renderSection(
      "検索結果",
      stories,
      query ? `${stories.length}件` : "検索語を入力してください",
    ),
  );
  pageContent.append(shell);
}

function renderFavorites() {
  setHeader("お気に入り", "あとで読み返すための保存分", "Saved");
  pageContent.innerHTML = "";
  const stories = [...state.favorites]
    .map((id) => state.storiesById.get(id))
    .filter(Boolean);
  pageContent.append(renderSection("保存したニュース", stories, `${stories.length}件`));
}

boot().catch((error) => {
  pageContent.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = `読み込みに失敗しました: ${error.message}`;
  pageContent.append(empty);
});
