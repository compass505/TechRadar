const NAV_ITEMS = [
  { key: "personalized", label: "おすすめ", route: "personalized" },
  {
    key: "yesterday",
    label: "昨日のニュース",
    route: "yesterday",
    yesterdayTab: "all",
    dropdown: [
      { label: "すべて", route: "yesterday", yesterdayTab: "all" },
      { label: "AIニュース", route: "yesterday", yesterdayTab: "ai" },
      { label: "企業ITニュース", route: "yesterday", yesterdayTab: "enterprise_it" },
      { label: "開発ニュース", route: "yesterday", yesterdayTab: "development" },
    ],
  },
  { key: "important", label: "直近の重大ニュース", route: "important" },
  {
    key: "archive",
    label: "過去ニュース",
    route: "archive",
    archiveTab: "all",
    dropdown: [
      { label: "すべて", route: "archive", archiveTab: "all" },
      { label: "AIニュース", route: "archive", archiveTab: "ai" },
      { label: "企業ITニュース", route: "archive", archiveTab: "enterprise_it" },
      { label: "開発ニュース", route: "archive", archiveTab: "development" },
    ],
  },
  { key: "search", label: "検索", route: "search" },
  { key: "favorites", label: "お気に入り", route: "favorites" },
];

const MOBILE_MENU_SECTIONS = [
  {
    title: "おすすめ",
    route: "personalized",
  },
  {
    title: "昨日のニュース",
    entries: [
      { label: "すべて", route: "yesterday", yesterdayTab: "all" },
      { label: "AI", route: "yesterday", yesterdayTab: "ai" },
      { label: "企業IT", route: "yesterday", yesterdayTab: "enterprise_it" },
      { label: "開発", route: "yesterday", yesterdayTab: "development" },
    ],
  },
  {
    title: "直近の重大ニュース",
    route: "important",
  },
  {
    title: "過去ニュース",
    entries: [
      { label: "すべて", route: "archive", archiveTab: "all" },
      { label: "AI", route: "archive", archiveTab: "ai" },
      { label: "企業IT", route: "archive", archiveTab: "enterprise_it" },
      { label: "開発", route: "archive", archiveTab: "development" },
    ],
  },
];

const FACET_LABELS = {
  ai: "AI",
  enterprise_it: "企業IT",
  security: "セキュリティ",
  development: "開発",
  cloud: "クラウド",
};

const SEARCH_CATEGORY_OPTIONS = [
  ["", "すべて"],
  ["ai", "AI"],
  ["enterprise_it", "企業IT"],
  ["development", "開発"],
  ["security", "セキュリティ"],
  ["cloud", "クラウド"],
];

const SEARCH_IMPORTANCE_OPTIONS = [
  ["0", "すべて"],
  ["5", "5以上"],
  ["4", "4以上"],
  ["3", "3以上"],
  ["2", "2以上"],
  ["1", "1以上"],
];

const DISPLAY_FACET_PRIORITY = ["security", "ai", "development", "cloud", "enterprise_it"];
const DATA_CACHE_VERSION = "news-20260531-7";
const USER_STORAGE_VERSION = "news-20260525-6";
const FAVORITES_RESET_KEY = "favorites-reset-version";
const USER_EVENTS_KEY = "techradar-user-events";
const USER_EVENTS_RESET_KEY = "techradar-user-events-version";
const USER_ID = "local-user";
const FEED_SESSION_ID = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const impressionKeys = new Set();
const PARAMETER_RANGES = {
  importance: [1.0, 2.0],
  interest: [0.6, 1.8],
  popularity: [0.7, 1.5],
  freshness: [0.5, 1.3],
  diversity: [0.7, 1.0],
};

function loadFavorites() {
  if (localStorage.getItem(FAVORITES_RESET_KEY) !== USER_STORAGE_VERSION) {
    localStorage.setItem("favorites", "[]");
    localStorage.setItem(FAVORITES_RESET_KEY, USER_STORAGE_VERSION);
    return new Set();
  }

  try {
    return new Set(JSON.parse(localStorage.getItem("favorites") || "[]"));
  } catch {
    localStorage.setItem("favorites", "[]");
    return new Set();
  }
}

function loadUserEvents() {
  if (localStorage.getItem(USER_EVENTS_RESET_KEY) !== USER_STORAGE_VERSION) {
    localStorage.setItem(USER_EVENTS_KEY, "[]");
    localStorage.setItem(USER_EVENTS_RESET_KEY, USER_STORAGE_VERSION);
    return [];
  }

  try {
    const events = JSON.parse(localStorage.getItem(USER_EVENTS_KEY) || "[]");
    return Array.isArray(events) ? events : [];
  } catch {
    localStorage.setItem(USER_EVENTS_KEY, "[]");
    return [];
  }
}

function saveUserEvents() {
  localStorage.setItem(USER_EVENTS_KEY, JSON.stringify(state.userEvents));
  localStorage.setItem(USER_EVENTS_RESET_KEY, USER_STORAGE_VERSION);
}

const state = {
  stories: [],
  storiesById: new Map(),
  manifest: null,
  edition: null,
  selectedEditionDate: "all",
  route: "personalized",
  personalizedTab: "unrated",
  yesterdayTab: "all",
  archiveTab: "all",
  openMenu: "",
  mobileMenuOpen: false,
  searchQuery: "",
  searchFilters: {
    category: "",
    source: "",
    importance: "0",
    dateFrom: "",
    dateTo: "",
  },
  favorites: loadFavorites(),
  userEvents: loadUserEvents(),
};

const brandHome = document.querySelector("#brand-home");
const nav = document.querySelector("#primary-nav");
const headerDropdown = document.querySelector("#header-dropdown");
const editionAll = document.querySelector("#edition-all");
const editionDate = document.querySelector("#edition-date");
const mobileSearch = document.querySelector("#mobile-search");
const mobileFavorites = document.querySelector("#mobile-favorites");
const mobileMenuToggle = document.querySelector("#mobile-menu-toggle");
const mobileMenu = document.querySelector("#mobile-menu");
const eyebrow = document.querySelector("#eyebrow");
const pageTitle = document.querySelector("#page-title");
const pageMeta = document.querySelector("#page-meta");
const pageContent = document.querySelector("#page-content");
const cardTemplate = document.querySelector("#story-card-template");

function dataUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${DATA_CACHE_VERSION}`;
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
    navigateTo("personalized");
  });

  mobileSearch.addEventListener("click", () => {
    navigateTo("search");
  });

  mobileFavorites.addEventListener("click", () => {
    navigateTo("favorites");
  });

  mobileMenuToggle.addEventListener("click", () => {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    state.openMenu = "";
    renderNav();
  });

  renderNav();
  renderEditionPicker();
  await loadEdition("all");
}

function navigateTo(route, options = {}) {
  state.route = route;
  if (options.yesterdayTab) {
    state.yesterdayTab = options.yesterdayTab;
  }
  if (options.archiveTab) {
    state.archiveTab = options.archiveTab;
  }
  state.openMenu = "";
  state.mobileMenuOpen = false;
  renderNav();
  renderPage();
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
        if (item.yesterdayTab) {
          state.yesterdayTab = item.yesterdayTab;
        }
        if (item.archiveTab) {
          state.archiveTab = item.archiveTab;
        }
        if (item.route) {
          state.route = item.route;
        }
        state.openMenu = state.openMenu === item.key ? "" : item.key;
        state.mobileMenuOpen = false;
        renderNav();
        renderPage();
        return;
      }

      navigateTo(item.route);
    });

    nav.append(button);
  });

  renderHeaderDropdown();
  renderMobileMenu();
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
      navigateTo(entry.route, entry);
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

function renderMobileMenu() {
  mobileMenuToggle.setAttribute("aria-expanded", String(state.mobileMenuOpen));
  mobileSearch.classList.toggle("active", state.route === "search");
  mobileFavorites.classList.toggle("active", state.route === "favorites");

  mobileMenu.innerHTML = "";
  mobileMenu.hidden = !state.mobileMenuOpen;
  MOBILE_MENU_SECTIONS.forEach((section) => {
    mobileMenu.append(renderMobileMenuSection(section));
  });

  if (state.manifest) {
    const picker = document.createElement("div");
    picker.className = "mobile-edition-picker";

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.textContent = "すべて";
    allButton.className = state.selectedEditionDate === "all" ? "active" : "";
    allButton.addEventListener("click", async () => {
      await loadEdition("all");
    });

    const label = document.createElement("label");
    const labelText = document.createElement("span");
    labelText.textContent = "表示日";

    const input = document.createElement("input");
    input.type = "date";
    applyEditionDateBounds(input);
    input.value = activeEditionDateForInput();
    input.addEventListener("change", async (event) => {
      await loadEdition(event.target.value);
    });

    label.append(labelText, input);
    picker.append(allButton, label);
    mobileMenu.append(picker);
  }
}

function renderMobileMenuSection(section) {
  const wrapper = document.createElement("section");
  wrapper.className = "mobile-menu-section";

  if (section.route) {
    const button = createMobileMenuButton({ label: section.title, route: section.route });
    button.classList.add("mobile-menu-link");
    wrapper.append(button);
    return wrapper;
  }

  const heading = document.createElement("div");
  heading.className = "mobile-menu-heading";
  heading.textContent = section.title;
  wrapper.append(heading);

  const tabs = document.createElement("div");
  tabs.className = "mobile-menu-tabs";
  section.entries.forEach((entry) => tabs.append(createMobileMenuButton(entry)));
  wrapper.append(tabs);
  return wrapper;
}

function createMobileMenuButton(entry) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = entry.label;
  button.dataset.route = entry.route;
  if (entry.yesterdayTab) {
    button.dataset.yesterdayTab = entry.yesterdayTab;
  }
  if (entry.archiveTab) {
    button.dataset.archiveTab = entry.archiveTab;
  }
  button.classList.toggle("active", mobileEntryIsActive(entry));
  button.addEventListener("click", () => {
    navigateTo(entry.route, entry);
  });
  return button;
}

function mobileEntryIsActive(entry) {
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
  applyEditionDateBounds(editionDate);
  editionAll.addEventListener("click", async () => {
    await loadEdition("all");
  });
  editionDate.addEventListener("change", async (event) => {
    await loadEdition(event.target.value);
  });
  syncEditionPicker();
}

async function loadEdition(editionDate) {
  if (!editionDate) {
    await loadEdition("all");
    return;
  }

  if (editionDate === "all") {
    const fallback = state.edition || (await fetchEditionData(state.manifest.default_edition_date));
    state.edition = fallback;
    state.selectedEditionDate = "all";
    syncEditionPicker();
    renderNav();
    renderPage();
    return;
  }

  const target = state.manifest.editions.find((edition) => edition.date === editionDate);
  if (!target) {
    return;
  }
  state.edition = await fetch(dataUrl(target.path)).then((response) => response.json());
  state.selectedEditionDate = editionDate;
  syncEditionPicker();
  renderNav();
  renderPage();
}

async function fetchEditionData(editionDate) {
  const target = state.manifest.editions.find((edition) => edition.date === editionDate);
  if (!target) {
    return null;
  }
  return fetch(dataUrl(target.path)).then((response) => response.json());
}

function applyEditionDateBounds(input) {
  const dates = state.manifest.editions.map((edition) => edition.date).sort();
  input.min = dates[0] || "";
  input.max = dates[dates.length - 1] || "";
}

function activeEditionDateForInput() {
  return state.selectedEditionDate === "all" ? state.manifest.default_edition_date : state.selectedEditionDate;
}

function syncEditionPicker() {
  editionDate.value = activeEditionDateForInput();
  editionAll.classList.toggle("active", state.selectedEditionDate === "all");
}

function renderPage() {
  switch (state.route) {
    case "personalized":
      renderPersonalized();
      break;
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

function getScopedStories() {
  if (state.selectedEditionDate === "all") {
    return state.stories;
  }
  const storyIds = new Set(Object.values(state.edition?.surfaces || {}).flat());
  return getStories([...storyIds]);
}

function selectedEditionLabel() {
  return state.selectedEditionDate === "all" ? "すべて" : `${state.selectedEditionDate} 版`;
}

function selectedEditionContextLabel() {
  return state.selectedEditionDate === "all" ? "全期間" : `${state.selectedEditionDate} 版`;
}

function renderPersonalized() {
  const model = buildUserModel();
  const decisionMap = getDecisionMap();
  const recommendations = rankPersonalizedStories(getScopedStories(), model);
  const unratedRecommendations = recommendations.filter(({ story }) => !decisionMap.has(story.id));
  registerImpressions(unratedRecommendations.slice(0, 8));
  setHeader(
    "おすすめ",
    `${selectedEditionLabel()} / 未評価ニュースを評価して学習`,
    "Personalized",
  );

  pageContent.innerHTML = "";
  pageContent.append(renderPersonalizedTabs(decisionMap, unratedRecommendations.length));
  const shell = document.createElement("div");
  shell.className = "personalized-shell";

  if (state.personalizedTab === "liked") {
    shell.append(renderReviewedList(decisionMap, "swipe_right", model));
  } else if (state.personalizedTab === "rejected") {
    shell.append(renderReviewedList(decisionMap, "swipe_left", model));
  } else {
    shell.append(renderSwipePanel(unratedRecommendations), renderPersonalizedList(unratedRecommendations));
  }

  pageContent.append(shell);
}

function renderPersonalizedTabs(decisionMap, unratedCount) {
  const tabRow = document.createElement("div");
  tabRow.className = "personalized-tabs";
  const positiveCount = [...decisionMap.values()].filter((event) => event.event_type === "swipe_right").length;
  const negativeCount = [...decisionMap.values()].filter((event) => event.event_type === "swipe_left").length;
  const tabs = [
    ["unrated", `未評価 ${unratedCount}`],
    ["liked", `気になる ${positiveCount}`],
    ["rejected", `興味なし ${negativeCount}`],
  ];

  tabs.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = state.personalizedTab === key ? "active" : "";
    button.addEventListener("click", () => {
      state.personalizedTab = key;
      renderPage();
    });
    tabRow.append(button);
  });

  return tabRow;
}

function renderLearningPanel(model, recommendations, decisionMap = getDecisionMap()) {
  const panel = document.createElement("section");
  panel.className = "learning-panel";

  const decisions = [...decisionMap.values()];
  const positiveCount = decisions.filter((event) => event.event_type === "swipe_right").length;
  const negativeCount = decisions.filter((event) => event.event_type === "swipe_left").length;
  const effectiveEvents = getModelEvents();
  const clickCount = effectiveEvents.filter((event) => event.event_type === "click").length;
  const topFeatures = Object.entries(model.profile)
    .filter(([, value]) => Math.abs(value) >= 0.25)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 8);

  panel.innerHTML = `
    <div class="learning-summary">
      <div>
        <p class="eyebrow">User model</p>
        <h2>学習中の好み</h2>
      </div>
      <button class="subtle-button" type="button" data-learning-reset>学習をリセット</button>
    </div>
    <div class="learning-metrics">
      <div><strong>${positiveCount}</strong><span>気になる</span></div>
      <div><strong>${negativeCount}</strong><span>興味なし</span></div>
      <div><strong>${clickCount}</strong><span>クリック</span></div>
      <div><strong>${recommendations.length}</strong><span>全記事</span></div>
    </div>
    <div class="profile-tags">
      ${
        topFeatures.length
          ? topFeatures
              .map(([key, value]) => `<span class="${value >= 0 ? "positive" : "negative"}">${featureLabel(key)} ${value.toFixed(1)}</span>`)
              .join("")
          : "<span>まだ評価データがありません</span>"
      }
    </div>
  `;

  panel.querySelector("[data-learning-reset]").addEventListener("click", () => {
    state.userEvents = [];
    saveUserEvents();
    impressionKeys.clear();
    renderPage();
  });

  return panel;
}

function renderSwipePanel(recommendations) {
  const panel = document.createElement("section");
  panel.className = "swipe-panel";

  const next = recommendations[0];
  if (!next) {
    panel.innerHTML = `
      <div class="empty-state">
        未評価のニュースはありません。気になる / 興味なし タブで分類済みニュースを確認できます。
      </div>
    `;
    return panel;
  }

  const { story, score } = next;
  const swipeImportance = normalizeImportanceScore(story.importance_score);
  panel.innerHTML = `
    <div class="swipe-card" data-swipe-story="${story.id}">
      <div class="swipe-card-top">
        <div class="swipe-badges">
          <span>${story.category || representativeFacetLabel(story) || "News"}</span>
          <span class="importance-score-${swipeImportance}">重要度 ${swipeImportance}</span>
        </div>
        <strong>${score.final.toFixed(2)}</strong>
      </div>
      <h2>${story.title}</h2>
      <p>${story.summary || ""}</p>
      ${renderRecommendationDetails(score)}
      <div class="swipe-actions">
        <button class="signal-button reject" type="button" data-signal="swipe_left">← 興味なし</button>
        <button class="signal-button accept" type="button" data-signal="swipe_right">気になる →</button>
      </div>
    </div>
  `;

  const card = panel.querySelector(".swipe-card");
  attachSwipeDrag(card, story);
  panel.querySelectorAll("[data-signal]").forEach((button) => {
    button.addEventListener("click", () => recordUserSignal(story, button.dataset.signal, 1));
  });
  return panel;
}

function renderPersonalizedList(recommendations) {
  const section = document.createElement("section");
  section.className = "section personalized-list";

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `<h2>未評価ニュース</h2><span>${recommendations.length}件</span>`;
  section.append(header);

  if (!recommendations.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "未評価のニュースはありません。分類タブで評価済みニュースを確認できます。";
    section.append(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "story-grid";
  recommendations.slice(0, 12).forEach((item, index) => {
    grid.append(renderStoryCard(item.story, { allowSignals: true, score: item.score, position: index + 1 }));
  });
  section.append(grid);
  return section;
}

function renderReviewedList(decisionMap, decisionType, model) {
  const section = document.createElement("section");
  section.className = "section reviewed-list";
  const title = decisionType === "swipe_right" ? "気になるニュース" : "興味なしニュース";
  const note = decisionType === "swipe_right" ? "右スワイプ / 気になる に分類済み" : "左スワイプ / 興味なし に分類済み";
  const stories = [...decisionMap.values()]
    .filter((event) => event.event_type === decisionType)
    .map((event) => state.storiesById.get(event.story_id))
    .filter(Boolean);
  const recommendations = rankPersonalizedStories(stories, model);

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `<h2>${title}</h2><span>${note}</span>`;
  section.append(header);

  if (!recommendations.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "まだ分類されたニュースはありません。未評価タブでニュースを評価してください。";
    section.append(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "story-grid";
  recommendations.forEach(({ story, score }, index) => {
    grid.append(renderStoryCard(story, { allowSignals: false, decisionType, score, position: index + 1 }));
  });
  section.append(grid);
  return section;
}

function renderEventLog() {
  const log = document.createElement("section");
  log.className = "event-log-panel";
  const events = state.userEvents.slice(-6).reverse();
  log.innerHTML = `
    <div class="section-header">
      <h2>学習ログ</h2>
      <span>user_events のMVP</span>
    </div>
    ${
      events.length
        ? events
            .map((event) => {
              const story = state.storiesById.get(event.story_id);
              return `<div class="event-row"><strong>${event.event_type}</strong><span>${story ? story.title : event.story_id}</span></div>`;
            })
            .join("")
        : '<div class="empty-state">まだイベントはありません。</div>'
    }
  `;
  return log;
}

function renderTop() {
  setHeader("TOP", selectedEditionLabel(), "Today");
  pageContent.innerHTML = "";
  const stories = sortStories(getScopedStories());
  pageContent.append(
    renderSection(
      state.selectedEditionDate === "all" ? "ニュース一覧" : "昨日のニュース",
      state.selectedEditionDate === "all" ? stories : getStories(state.edition.surfaces.top_yesterday),
      state.selectedEditionDate === "all" ? `${stories.length}件` : "重要度の高い記事",
    ),
  );
  pageContent.append(
    renderSection(
      "直近の重大ニュース",
      getImportantStories(),
      state.selectedEditionDate === "all" ? "全期間 / 重要度4以上" : "昨日を含む直近3日 / 重要度4以上",
    ),
  );
}

function renderYesterday() {
  setHeader("昨日のニュース", `${yesterdayTabLabel()} / ${selectedEditionContextLabel()}`, "Yesterday");
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
  const stories =
    state.selectedEditionDate === "all"
      ? state.stories
      : state.stories.filter((story) => story.published_date === previousDate(state.selectedEditionDate));
  return sortStories(
    stories.filter((story) => state.yesterdayTab === "all" || storyFacets(story).includes(state.yesterdayTab)),
  );
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

function rankPersonalizedStories(stories, model) {
  const criticalStories = stories.filter((story) => normalizeImportanceScore(story.importance_score) === 5);
  const regularStories = stories.filter((story) => normalizeImportanceScore(story.importance_score) !== 5);
  return [
    ...rankStoryGroup(criticalStories, model, { criticalFirst: true }),
    ...rankStoryGroup(regularStories, model, { criticalFirst: false }),
  ];
}

function rankStoryGroup(stories, model, options = {}) {
  const scored = stories.map((story) => ({
    story,
    score: calculatePersonalizedScore(story, model),
  }));
  const selected = [];
  const remaining = scored.slice();
  const facetCounts = new Map();
  const sourceCounts = new Map();

  while (remaining.length) {
    let bestIndex = 0;
    let bestFinal = -Infinity;

    remaining.forEach((item, index) => {
      const facet = primaryFacet(storyFacets(item.story));
      const source = item.story.representative_source || "unknown";
      const facetPenalty = Math.pow(0.88, facetCounts.get(facet) || 0);
      const sourcePenalty = Math.pow(0.92, sourceCounts.get(source) || 0);
      const diversity = clamp(facetPenalty * sourcePenalty, PARAMETER_RANGES.diversity[0], PARAMETER_RANGES.diversity[1]);
      const orderBase = options.criticalFirst
        ? item.score.interest * item.score.popularity * item.score.freshness
        : item.score.base;
      const final = orderBase * diversity;
      if (final > bestFinal) {
        bestFinal = final;
        bestIndex = index;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);
    const facet = primaryFacet(storyFacets(picked.story));
    const source = picked.story.representative_source || "unknown";
    const facetPenalty = Math.pow(0.88, facetCounts.get(facet) || 0);
    const sourcePenalty = Math.pow(0.92, sourceCounts.get(source) || 0);
    picked.score.diversity = clamp(facetPenalty * sourcePenalty, PARAMETER_RANGES.diversity[0], PARAMETER_RANGES.diversity[1]);
    picked.score.final = picked.score.base * picked.score.diversity;
    picked.score.priority = options.criticalFirst ? "重要度5優先" : "";
    selected.push(picked);
    facetCounts.set(facet, (facetCounts.get(facet) || 0) + 1);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  }

  return selected;
}

function calculatePersonalizedScore(story, model) {
  const [importanceMin, importanceMax] = PARAMETER_RANGES.importance;
  const importance =
    importanceMin + (normalizeImportanceScore(story.importance_score) / 5) * (importanceMax - importanceMin);
  const interest = predictUserInterest(story, model);
  const popularity = predictPopularity(story);
  const freshness = calculateFreshnessScore(story);
  const base = importance * interest * popularity * freshness;
  return {
    importance,
    interest,
    popularity,
    freshness,
    diversity: 1,
    base,
    final: base,
  };
}

function predictUserInterest(story, model) {
  if (!model.eventCount) {
    return 1;
  }

  const keys = storyFeatureKeys(story);
  const positiveRaw = keys.reduce((sum, key) => sum + (model.positiveProfile[key] || 0), 0);
  const negativeRaw = keys.reduce((sum, key) => sum + (model.negativeProfile[key] || 0), 0);
  const raw = (positiveRaw + (normalizeImportanceScore(story.importance_score) === 5 ? 0 : negativeRaw)) / Math.max(1, keys.length);
  const confidence = clamp(model.eventCount / 8, 0.2, 1);
  return clamp(1 + raw * 0.55 * confidence, PARAMETER_RANGES.interest[0], PARAMETER_RANGES.interest[1]);
}

function predictPopularity(story) {
  const events = getModelEvents().filter((event) => event.story_id === story.id);
  const impressions = events.filter((event) => event.event_type === "impression").length;
  const right = events.filter((event) => event.event_type === "swipe_right").length;
  const left = events.filter((event) => event.event_type === "swipe_left").length;
  const clicks = events.filter((event) => event.event_type === "click").length;
  const reactionRate = (right + clicks * 0.6) / Math.max(1, impressions + right + left);
  const basePopularity =
    normalizeImportanceScore(story.importance_score) * 0.08 +
    Math.min(3, Number(story.source_count || 1)) * 0.08 +
    Math.min(3, Number(story.article_count || 1)) * 0.05 +
    Number(story.urgency_score || 0) * 0.08;
  return clamp(0.76 + basePopularity + reactionRate * 0.32 - left * 0.035, PARAMETER_RANGES.popularity[0], PARAMETER_RANGES.popularity[1]);
}

function calculateFreshnessScore(story) {
  const published = new Date(String(story.published_at || story.published_date).replace(" ", "T"));
  if (Number.isNaN(published.getTime())) {
    return 1;
  }
  const ageHours = Math.max(0, (Date.now() - published.getTime()) / 36e5);
  return clamp(0.5 + 0.8 * Math.exp(-ageHours / 72), PARAMETER_RANGES.freshness[0], PARAMETER_RANGES.freshness[1]);
}

function buildUserModel() {
  const profile = {};
  const positiveProfile = {};
  const negativeProfile = {};
  const effectiveEvents = getModelEvents();

  effectiveEvents.forEach((event) => {
    const story = state.storiesById.get(event.story_id);
    if (!story) {
      return;
    }

    const weights = userEventWeights(event);
    if (!weights) {
      return;
    }

    storyFeatureKeys(story).forEach((key) => {
      const weight = featureWeightForKey(key, weights);
      profile[key] = clamp((profile[key] || 0) + weight, -4, 4);
      if (weight >= 0) {
        positiveProfile[key] = clamp((positiveProfile[key] || 0) + weight, 0, 4);
      } else {
        negativeProfile[key] = clamp((negativeProfile[key] || 0) + weight, -4, 0);
      }
    });
  });

  return {
    profile,
    positiveProfile,
    negativeProfile,
    eventCount: effectiveEvents.filter((event) => userEventWeights(event)).length,
  };
}

function storyFeatureKeys(story) {
  const keys = [];
  storyFacets(story).forEach((facet) => keys.push(`facet:${facet}`));
  if (story.category) {
    keys.push(`category:${story.category}`);
  }
  if (story.representative_source) {
    keys.push(`source:${story.representative_source}`);
  }
  tokenizeStory(story).forEach((token) => keys.push(`token:${token}`));
  return [...new Set(keys)];
}

function tokenizeStory(story) {
  return [story.title, story.summary, story.reason]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && token.length <= 24)
    .slice(0, 18);
}

function storyFacets(story) {
  const facets = Array.isArray(story.facets) ? story.facets : [];
  return facets.length ? facets : [story.category || "general"];
}

function primaryFacet(facets) {
  return DISPLAY_FACET_PRIORITY.find((facet) => facets.includes(facet)) || facets[0] || "general";
}

function userEventWeights(event) {
  const weights = {
    swipe_right: { token: 0.6, facet: 0.3, category: 0.3, source: 0.2 },
    swipe_left: { token: -0.35, facet: -0.1, category: -0.1, source: -0.1 },
    click: { token: 0.18, facet: 0.08, category: 0.08, source: 0.06 },
    favorite: { token: 0.32, facet: 0.16, category: 0.16, source: 0.12 },
  };
  return weights[event.event_type] || null;
}

function featureWeightForKey(key, weights) {
  const type = key.split(":")[0];
  return weights[type] || 0;
}

function getEffectiveUserEvents() {
  const undone = new Set(
    state.userEvents.filter((event) => event.event_type === "undo").map((event) => event.target_event_id),
  );
  return state.userEvents.filter((event) => event.event_type !== "undo" && !undone.has(event.id));
}

function getDecisionMap() {
  const decisions = new Map();
  getEffectiveUserEvents().forEach((event) => {
    if (event.event_type !== "swipe_right" && event.event_type !== "swipe_left") {
      return;
    }
    if (!decisions.has(event.story_id)) {
      decisions.set(event.story_id, event);
    }
  });
  return decisions;
}

function getModelEvents() {
  const decisionMap = getDecisionMap();
  return getEffectiveUserEvents().filter((event) => {
    if (event.event_type !== "swipe_right" && event.event_type !== "swipe_left") {
      return true;
    }
    return decisionMap.get(event.story_id)?.id === event.id;
  });
}

function getHandledStoryIds() {
  return new Set(getDecisionMap().keys());
}

function registerImpressions(recommendations) {
  recommendations.forEach(({ story }, index) => {
    const key = `${FEED_SESSION_ID}:${story.id}:${index + 1}`;
    if (impressionKeys.has(key)) {
      return;
    }
    impressionKeys.add(key);
    pushUserEvent(story, "impression", 1, index + 1);
  });
}

function recordUserSignal(story, eventType, position, options = {}) {
  if ((eventType === "swipe_right" || eventType === "swipe_left") && getDecisionMap().has(story.id)) {
    if (options.rerender !== false) {
      renderPage();
    }
    return false;
  }
  pushUserEvent(story, eventType, eventType === "swipe_left" ? -1 : 1, position);
  if (options.rerender !== false) {
    renderPage();
  }
  return true;
}

function resetStoryDecision(story) {
  const decision = getDecisionMap().get(story.id);
  if (!decision) {
    state.personalizedTab = "unrated";
    renderPage();
    return false;
  }

  pushUserEvent(story, "undo", 0, decision.position || 1, {
    target_event_id: decision.id,
  });
  state.personalizedTab = "unrated";
  renderPage();
  return true;
}

function pushUserEvent(story, eventType, eventValue, position, extra = {}) {
  state.userEvents.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    user_id: USER_ID,
    story_id: story.id,
    event_type: eventType,
    event_value: eventValue,
    feed_session_id: FEED_SESSION_ID,
    position,
    created_at: new Date().toISOString(),
    ...extra,
  });
  saveUserEvents();
}

function featureLabel(key) {
  return key.replace(/^facet:|^category:|^source:|^token:/, "");
}

function renderScoreBar(label, value) {
  const width = clamp(((value - 0.45) / 1.55) * 100, 8, 100);
  return `<div class="score-row"><span>${label}</span><div><i style="width:${width}%"></i></div><strong>${value.toFixed(2)}</strong></div>`;
}

function renderRecommendationDetails(score) {
  return `
    <details class="story-reason recommendation-details">
      <summary>おすすめパラメータを見る</summary>
      <div class="card-score">
        <div class="card-score-head"><span>final</span><strong>${score.final.toFixed(2)}</strong></div>
        ${score.priority ? `<div class="priority-note">${score.priority}</div>` : ""}
        ${renderScoreBar("重要度", score.importance)}
        ${renderScoreBar("興味", score.interest)}
        ${renderScoreBar("人気", score.popularity)}
        ${renderScoreBar("新鮮さ", score.freshness)}
        ${renderScoreBar("多様性", score.diversity)}
      </div>
    </details>
  `;
}

function renderCardScore(score) {
  const template = document.createElement("template");
  template.innerHTML = renderRecommendationDetails(score).trim();
  return template.content.firstElementChild;
}

function renderSignalActions(story, position) {
  const actions = document.createElement("div");
  actions.className = "signal-actions";

  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "signal-button reject";
  reject.textContent = "← 興味なし";
  reject.addEventListener("click", () => recordUserSignal(story, "swipe_left", position));

  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "signal-button accept";
  accept.textContent = "気になる →";
  accept.addEventListener("click", () => recordUserSignal(story, "swipe_right", position));

  actions.append(reject, accept);
  return actions;
}

function attachSwipeDrag(card, story) {
  let startX = 0;
  let currentX = 0;
  let pointerId = null;

  card.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    currentX = 0;
    pointerId = event.pointerId;
    card.setPointerCapture(pointerId);
    card.classList.add("dragging");
  });

  card.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    currentX = event.clientX - startX;
    card.style.transform = `translateX(${currentX}px) rotate(${currentX / 18}deg)`;
  });

  card.addEventListener("pointerup", (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    card.classList.remove("dragging");
    pointerId = null;
    if (currentX > 92) {
      recordUserSignal(story, "swipe_right", 1);
      return;
    }
    if (currentX < -92) {
      recordUserSignal(story, "swipe_left", 1);
      return;
    }
    card.style.transform = "";
  });

  card.addEventListener("pointercancel", () => {
    pointerId = null;
    card.classList.remove("dragging");
    card.style.transform = "";
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  setHeader("直近の重大ニュース", selectedEditionLabel(), "Important");
  pageContent.innerHTML = "";
  pageContent.append(
    renderSection(
      "直近の重大ニュース",
      getImportantStories(),
      state.selectedEditionDate === "all" ? "全期間 / 重要度4以上" : "昨日を含む直近3日 / 重要度4以上",
    ),
  );
}

function getImportantStories() {
  if (state.selectedEditionDate === "all") {
    return sortStories(state.stories.filter((story) => normalizeImportanceScore(story.importance_score) >= 4));
  }
  return getStories(state.edition.surfaces.recent_important);
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

function renderStoryCard(story, options = {}) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".story-card");
  const badges = fragment.querySelector(".badges");
  const favoriteButton = fragment.querySelector(".favorite-button");
  const title = fragment.querySelector("h3");
  const summary = fragment.querySelector(".story-summary");
  const meta = fragment.querySelector(".story-meta");
  const link = fragment.querySelector(".source-button");
  const footer = fragment.querySelector(".story-footer");

  const sourceBadge = document.createElement("span");
  sourceBadge.className = "badge source-badge";
  sourceBadge.textContent = story.representative_source || "Source";
  badges.append(sourceBadge);

  const importanceScore = normalizeImportanceScore(story.importance_score);
  const categoryLabel = story.category || representativeFacetLabel(story);
  if (categoryLabel) {
    const categoryBadge = document.createElement("span");
    categoryBadge.className = "badge facet-badge";
    categoryBadge.textContent = categoryLabel;
    badges.append(categoryBadge);
  }

  const importanceBadge = document.createElement("span");
  importanceBadge.className = `badge importance-badge importance-score-${importanceScore}`;
  importanceBadge.textContent = `重要度 ${importanceScore}`;
  badges.append(importanceBadge);

  favoriteButton.textContent = state.favorites.has(story.id) ? "★" : "☆";
  favoriteButton.classList.toggle("active", state.favorites.has(story.id));
  favoriteButton.addEventListener("click", () => toggleFavorite(story.id));

  title.textContent = story.title;
  summary.textContent = story.summary || "";
  summary.hidden = !story.summary;
  meta.textContent = `${story.published_at || story.published_date} / ${story.source_count}媒体`;
  link.href = story.representative_url;
  link.addEventListener("click", () => {
    recordUserSignal(story, "click", options.position || 1, { rerender: false });
  });

  if (options.decisionType) {
    card.classList.add(options.decisionType === "swipe_right" ? "liked-card" : "rejected-card");
    card.insertBefore(renderDecisionState(story, options.decisionType), summary);
  }

  if (options.score) {
    card.classList.add("personalized-card");
    card.insertBefore(renderCardScore(options.score), footer);
  }

  if (options.allowSignals) {
    card.insertBefore(renderSignalActions(story, options.position || 1), summary);
  }
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

function renderDecisionState(story, decisionType) {
  const wrapper = document.createElement("div");
  wrapper.className = "decision-row";

  const badge = document.createElement("span");
  badge.className = decisionType === "swipe_right" ? "decision-state liked" : "decision-state rejected";
  badge.textContent = decisionType === "swipe_right" ? "気になるに分類済み" : "興味なしに分類済み";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "reevaluate-button";
  reset.textContent = "再評価する";
  reset.addEventListener("click", () => resetStoryDecision(story));

  wrapper.append(badge, reset);
  return wrapper;
}

function toggleFavorite(storyId) {
  if (state.favorites.has(storyId)) {
    state.favorites.delete(storyId);
  } else {
    state.favorites.add(storyId);
    const story = state.storiesById.get(storyId);
    if (story) {
      recordUserSignal(story, "favorite", 1, { rerender: false });
    }
  }
  localStorage.setItem("favorites", JSON.stringify([...state.favorites]));
  renderPage();
}

function renderArchive() {
  setHeader("過去ニュース", `${archiveTabLabel()} / ${selectedEditionContextLabel()}`, "Archive");
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

  const stories = sortStories(
    getScopedStories().filter((story) => state.archiveTab === "all" || storyFacets(story).includes(state.archiveTab)),
  );
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
  setHeader("検索", "キーワード・カテゴリ・ニュースサイトで検索", "Search");
  pageContent.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "search-shell";

  const form = renderSearchForm();
  const stories = filterSearchStories();
  const summary = document.createElement("p");
  summary.className = "search-summary";
  summary.textContent = `${stories.length}件のニュースが見つかりました。`;

  shell.append(form, summary);
  shell.append(
    renderSection(
      "検索結果",
      stories,
      searchHasActiveFilters() ? describeSearchFilters() : "すべての保存ニュース",
    ),
  );
  pageContent.append(shell);
}

function renderSearchForm() {
  const form = document.createElement("form");
  form.className = "search-panel";

  const keyword = document.createElement("input");
  keyword.className = "search-input";
  keyword.type = "search";
  keyword.placeholder = "例: OpenAI / 脆弱性 / Publickey";
  keyword.value = state.searchQuery;
  form.append(createSearchField("キーワード", keyword, "search-keyword-field"));

  const category = createSelect(SEARCH_CATEGORY_OPTIONS, state.searchFilters.category);
  form.append(createSearchField("カテゴリ", category, "search-category-field"));

  const sourceOptions = [["", "すべて"], ...getSearchSourceOptions().map((source) => [source, source])];
  const source = createSelect(sourceOptions, state.searchFilters.source);
  form.append(createSearchField("ニュースサイト", source, "search-source-field"));

  const importance = createSelect(SEARCH_IMPORTANCE_OPTIONS, state.searchFilters.importance);
  form.append(createSearchField("重要度", importance, "search-importance-field"));

  const dateFrom = document.createElement("input");
  dateFrom.type = "date";
  dateFrom.value = state.searchFilters.dateFrom;
  form.append(createSearchField("開始日", dateFrom, "search-date-field search-date-from-field"));

  const dateTo = document.createElement("input");
  dateTo.type = "date";
  dateTo.value = state.searchFilters.dateTo;
  form.append(createSearchField("終了日", dateTo, "search-date-field search-date-to-field"));

  const actions = document.createElement("div");
  actions.className = "search-actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "検索";

  const reset = document.createElement("button");
  reset.type = "reset";
  reset.textContent = "リセット";

  actions.append(submit, reset);
  form.append(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.searchQuery = keyword.value.trim();
    state.searchFilters = {
      category: category.value,
      source: source.value,
      importance: importance.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    };
    renderSearch();
  });

  form.addEventListener("reset", () => {
    state.searchQuery = "";
    state.searchFilters = {
      category: "",
      source: "",
      importance: "0",
      dateFrom: "",
      dateTo: "",
    };
    window.setTimeout(renderSearch, 0);
  });

  return form;
}

function createSearchField(labelText, control, className = "") {
  const label = document.createElement("label");
  if (className) {
    label.className = className;
  }

  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function createSelect(options, selectedValue) {
  const select = document.createElement("select");
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  select.value = selectedValue;
  return select;
}

function getSearchSourceOptions() {
  const sources = new Set();
  state.stories.forEach((story) => {
    if (story.representative_source) {
      sources.add(story.representative_source);
    }
    (story.sources || []).forEach((source) => {
      if (source) {
        sources.add(source);
      }
    });
  });
  return [...sources].sort((left, right) => left.localeCompare(right, "ja"));
}

function filterSearchStories() {
  return sortStories(state.stories.filter((story) => storyMatchesSearch(story)));
}

function storyMatchesSearch(story) {
  const filters = state.searchFilters;
  const query = normalizeSearchText(state.searchQuery);
  const targetText = normalizeSearchText(
    [
      story.title,
      story.summary,
      story.reason,
      story.category,
      story.representative_source,
      ...(story.sources || []),
      ...(story.facets || []),
      ...(story.facets || []).map((facet) => FACET_LABELS[facet] || facet),
    ].join(" "),
  );

  if (query && !targetText.includes(query)) {
    return false;
  }

  if (filters.category && !(story.facets || []).includes(filters.category)) {
    return false;
  }

  if (
    filters.source &&
    story.representative_source !== filters.source &&
    !(story.sources || []).includes(filters.source)
  ) {
    return false;
  }

  const minImportance = Number.parseInt(filters.importance, 10);
  if (minImportance && normalizeImportanceScore(story.importance_score) < minImportance) {
    return false;
  }

  const publishedDate = story.published_date || String(story.published_at || "").slice(0, 10);
  if ((filters.dateFrom || filters.dateTo) && !publishedDate) {
    return false;
  }

  if (filters.dateFrom && publishedDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && publishedDate > filters.dateTo) {
    return false;
  }

  return true;
}

function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function searchHasActiveFilters() {
  return Boolean(
    state.searchQuery ||
      state.searchFilters.category ||
      state.searchFilters.source ||
      state.searchFilters.dateFrom ||
      state.searchFilters.dateTo ||
      Number.parseInt(state.searchFilters.importance, 10),
  );
}

function describeSearchFilters() {
  const labels = [];
  if (state.searchQuery) {
    labels.push(`キーワード: ${state.searchQuery}`);
  }
  if (state.searchFilters.category) {
    labels.push(`カテゴリ: ${FACET_LABELS[state.searchFilters.category] || state.searchFilters.category}`);
  }
  if (state.searchFilters.source) {
    labels.push(`ニュースサイト: ${state.searchFilters.source}`);
  }
  if (Number.parseInt(state.searchFilters.importance, 10)) {
    labels.push(`重要度${state.searchFilters.importance}以上`);
  }
  if (state.searchFilters.dateFrom || state.searchFilters.dateTo) {
    labels.push(`${state.searchFilters.dateFrom || "指定なし"} - ${state.searchFilters.dateTo || "指定なし"}`);
  }
  return labels.join(" / ");
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
