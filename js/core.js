"use strict";

const STORAGE_KEY = "stash.bookmarks.v1";
const CORRUPT_KEY = "stash.bookmarks.corrupt";
const APP_VERSION = "1.0.0";
const DAY = 86400000;
const RECENT_DAYS = 14;
const FOLDER_COLORS = ["#6d5efc", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];
const SORTS = ["newest", "oldest", "title", "domain"];

const els = {
  app: document.getElementById("app"),
  sidebar: document.getElementById("sidebar"),
  folderTree: document.getElementById("folderTree"),
  sidebarFooter: document.getElementById("sidebarFooter"),
  searchInput: document.getElementById("searchInput"),
  searchClear: document.getElementById("searchClear"),
  sortSelect: document.getElementById("sortSelect"),
  gridBtn: document.getElementById("gridBtn"),
  listBtn: document.getElementById("listBtn"),
  viewTitle: document.getElementById("viewTitle"),
  viewSubtitle: document.getElementById("viewSubtitle"),
  toolbar: document.getElementById("toolbar"),
  emptyTrashBtn: document.getElementById("emptyTrashBtn"),
  subfolders: document.getElementById("subfolders"),
  tagBar: document.getElementById("tagBar"),
  bookmarks: document.getElementById("bookmarks"),
  emptyState: document.getElementById("emptyState"),
  content: document.getElementById("content"),
  menuRoot: document.getElementById("menuRoot"),
  modal: document.getElementById("appModal"),
  toastRoot: document.getElementById("toastRoot"),
  importInput: document.getElementById("importInput"),
  themeToggle: document.getElementById("themeToggle")
};

let didSeed = false;
let didRecover = false;
let storageUnavailable = false;
let themeTimer = null;
let resizeTimer = null;

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => escapeMap[character]);
}

function icon(name, className) {
  return '<svg class="icon' + (className ? " " + className : "") + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
}

function $(selector, root) {
  return (root || document).querySelector(selector);
}

function $$(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

function plural(count, singular, pluralWord) {
  return count + " " + (count === 1 ? singular : pluralWord || singular + "s");
}

function uid(prefix) {
  let random;
  try {
    random = crypto && crypto.randomUUID ? crypto.randomUUID() : "";
  } catch (error) {
    random = "";
  }
  if (!random) {
    random = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }
  return prefix + "_" + random;
}

function isSafeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    return JSON.parse(JSON.stringify(value));
  }
}

function parseUrl(input) {
  let value = String(input == null ? "" : input).trim();
  if (!value) {
    return { error: "Please enter a URL." };
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    value = "https://" + value;
  }
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    return { error: "That does not look like a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http and https links can be saved." };
  }
  if (!url.hostname) {
    return { error: "Please include a website domain." };
  }
  return { url: url.href, hostname: url.hostname.toLowerCase() };
}

function urlKey(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol + "//" + parsed.hostname.replace(/^www\./i, "").toLowerCase() + parsed.pathname.replace(/\/+$/, "") + parsed.search;
  } catch (error) {
    return String(url || "").toLowerCase();
  }
}

function rootDomain(hostname) {
  const parts = String(hostname || "").replace(/^www\./i, "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 1) {
    return parts[0] || "";
  }
  const secondLevel = { co: true, com: true, org: true, net: true, ac: true, gov: true, edu: true };
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3 && secondLevel[parts[parts.length - 2]]) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function domainInfo(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return { host: host, root: rootDomain(host) };
  } catch (error) {
    return { host: "", root: "" };
  }
}

function titleFromDomain(host) {
  const root = rootDomain(host || "");
  const label = (root.split(".")[0] || "Bookmark").replace(/[-_]+/g, " ").trim();
  return label.replace(/\b\w/g, (character) => character.toUpperCase()) || "Bookmark";
}

function avatarLetter(url, title) {
  const info = domainInfo(url);
  const source = info.root || title || "?";
  const match = source.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : "#";
}

function hashHue(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

function normalizeTag(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 30);
}

function normalizeTags(value) {
  if (value == null) {
    return [];
  }
  const list = Array.isArray(value) ? value : String(value).split(",");
  const tags = [];
  const seen = new Set();
  list.forEach((item) => {
    const tag = normalizeTag(item);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  });
  return tags.slice(0, 20);
}

function toTimestamp(value) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function systemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizePreferences(preferences) {
  const source = preferences && typeof preferences === "object" ? preferences : {};
  return {
    theme: source.theme === "dark" || source.theme === "light" ? source.theme : systemTheme(),
    layout: source.layout === "list" ? "list" : "grid",
    sort: SORTS.indexOf(source.sort) !== -1 ? source.sort : "newest",
    expandedFolders: Array.isArray(source.expandedFolders) ? source.expandedFolders.filter((id) => typeof id === "string") : []
  };
}

function normalizeData(raw) {
  const source = raw && raw.data && (Array.isArray(raw.data.bookmarks) || Array.isArray(raw.data.folders)) ? raw.data : raw;
  if (!source || !Array.isArray(source.bookmarks) || !Array.isArray(source.folders)) {
    return null;
  }

  const seenFolderIds = new Set();
  const idMap = new Map();
  const drafts = [];

  source.folders.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const name = String(item.name == null ? "" : item.name).trim().slice(0, 60);
    if (!name) {
      return;
    }
    const originalId = typeof item.id === "string" ? item.id : "";
    let id = isSafeId(originalId) ? originalId : uid("f");
    if (seenFolderIds.has(id)) {
      id = uid("f");
    }
    seenFolderIds.add(id);
    if (originalId && !idMap.has(originalId)) {
      idMap.set(originalId, id);
    }
    drafts.push({
      id: id,
      name: name,
      parentRef: item.parentId == null ? null : String(item.parentId),
      color: normalizeColor(item.color, FOLDER_COLORS[hashHue(name) % FOLDER_COLORS.length]),
      createdAt: toTimestamp(item.createdAt) || Date.now()
    });
  });

  const folders = drafts.map((draft) => ({
    id: draft.id,
    name: draft.name,
    parentId: null,
    color: draft.color,
    createdAt: draft.createdAt
  }));
  const lookup = new Map(folders.map((folder) => [folder.id, folder]));

  drafts.forEach((draft, index) => {
    const mappedParent = draft.parentRef == null ? null : idMap.get(draft.parentRef);
    if (mappedParent && mappedParent !== draft.id && lookup.has(mappedParent)) {
      folders[index].parentId = mappedParent;
    }
  });

  folders.forEach((folder) => {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      if (seen.has(parentId)) {
        folder.parentId = null;
        break;
      }
      seen.add(parentId);
      const parent = lookup.get(parentId);
      if (!parent) {
        folder.parentId = null;
        break;
      }
      parentId = parent.parentId;
    }
  });

  const seenBookmarkIds = new Set();
  const bookmarks = [];

  source.bookmarks.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const parsed = parseUrl(item.url);
    if (parsed.error) {
      return;
    }
    const originalId = typeof item.id === "string" ? item.id : "";
    let id = isSafeId(originalId) ? originalId : uid("b");
    if (seenBookmarkIds.has(id)) {
      id = uid("b");
    }
    seenBookmarkIds.add(id);
    const createdAt = toTimestamp(item.createdAt) || Date.now();
    const mappedFolder = item.folderId == null ? null : idMap.get(String(item.folderId));
    bookmarks.push({
      id: id,
      url: parsed.url,
      title: String(item.title == null ? "" : item.title).trim().slice(0, 200),
      description: String(item.description == null ? "" : item.description).trim().slice(0, 600),
      tags: normalizeTags(item.tags),
      folderId: mappedFolder && lookup.has(mappedFolder) ? mappedFolder : null,
      starred: Boolean(item.starred),
      createdAt: createdAt,
      updatedAt: toTimestamp(item.updatedAt) || createdAt,
      deletedAt: item.deletedAt == null ? null : toTimestamp(item.deletedAt) || Date.now()
    });
  });

  return {
    version: 1,
    folders: folders,
    bookmarks: bookmarks,
    preferences: normalizePreferences(source.preferences)
  };
}

function createSeedData() {
  const now = Date.now();
  const folders = [
    { id: "f_work", name: "Work", parentId: null, color: "#6d5efc", createdAt: now - 40 * DAY },
    { id: "f_design", name: "Design", parentId: null, color: "#0ea5e9", createdAt: now - 38 * DAY },
    { id: "f_inspiration", name: "Inspiration", parentId: "f_design", color: "#ec4899", createdAt: now - 36 * DAY },
    { id: "f_personal", name: "Personal", parentId: null, color: "#10b981", createdAt: now - 34 * DAY },
    { id: "f_recipes", name: "Recipes", parentId: "f_personal", color: "#f59e0b", createdAt: now - 32 * DAY },
    { id: "f_reading", name: "Reading List", parentId: null, color: "#8b5cf6", createdAt: now - 30 * DAY },
    { id: "f_learning", name: "Learning", parentId: null, color: "#14b8a6", createdAt: now - 28 * DAY }
  ];

  const make = (id, url, title, description, folderId, tags, starred, daysAgo, deletedDaysAgo) => {
    const created = now - daysAgo * DAY;
    return {
      id: id,
      url: url,
      title: title,
      description: description,
      folderId: folderId,
      tags: tags,
      starred: Boolean(starred),
      createdAt: created,
      updatedAt: created,
      deletedAt: deletedDaysAgo == null ? null : now - deletedDaysAgo * DAY
    };
  };

  const bookmarks = [
    make("b_linear", "https://linear.app/", "Linear", "The issue tracker built for modern product teams. Fast, focused, and keyboard-first.", "f_work", ["productivity", "tools"], true, 2),
    make("b_notion", "https://www.notion.so/", "Notion", "Docs, wikis, and project plans in one connected workspace.", "f_work", ["productivity", "notes"], false, 6),
    make("b_figma", "https://www.figma.com/", "Figma", "Collaborative interface design. Prototype, iterate, and hand off in one place.", "f_design", ["design", "tools"], true, 3),
    make("b_dribbble", "https://dribbble.com/", "Dribbble", "A daily dose of visual inspiration from designers around the world.", "f_inspiration", ["inspiration", "design"], false, 5),
    make("b_awwwards", "https://www.awwwards.com/", "Awwwards", "A showcase of the best web design, judged by industry professionals.", "f_inspiration", ["inspiration", "web"], false, 9),
    make("b_refactoring", "https://www.refactoringui.com/", "Refactoring UI", "Practical design tactics for developers who want to make things look good.", "f_design", ["design", "ux", "reference"], true, 12),
    make("b_behance", "https://www.behance.net/", "Behance", "Portfolios and creative work from every discipline. Endless reference material.", "f_inspiration", ["inspiration", "portfolio"], false, 18),
    make("b_seriouseats", "https://www.seriouseats.com/", "Serious Eats", "Rigorous recipes and food science from the team behind some of the best home cooking on the web.", "f_recipes", ["recipes", "cooking"], false, 1),
    make("b_nyt", "https://cooking.nytimes.com/", "NYT Cooking", "A deep, dependable recipe archive with helpful notes and ratings.", "f_recipes", ["recipes", "food"], false, 4),
    make("b_budget", "https://www.budgetbytes.com/", "Budget Bytes", "Cheap, delicious recipes with clear cost breakdowns for every meal.", "f_recipes", ["recipes", "budget"], false, 10),
    make("b_mdn", "https://developer.mozilla.org/", "MDN Web Docs", "The definitive reference for HTML, CSS, JavaScript, and the open web.", "f_learning", ["reference", "frontend"], true, 2),
    make("b_css", "https://css-tricks.com/", "CSS-Tricks", "Practical articles, snippets, and guides for people who build websites.", "f_learning", ["css", "frontend"], false, 8),
    make("b_webdev", "https://web.dev/", "web.dev", "Google's guidance on performance, accessibility, and modern web fundamentals.", "f_learning", ["performance", "frontend"], false, 15),
    make("b_hn", "https://news.ycombinator.com/", "Hacker News", "A daily pulse on startups, engineering, and the tech industry.", "f_reading", ["tech", "news"], false, 1),
    make("b_verge", "https://www.theverge.com/", "The Verge", "Consumer tech news, reviews, and the occasional deep dive.", "f_reading", ["tech", "news"], false, 11),
    make("b_arena", "https://www.are.na/", "Are.na", "A quiet, ad-free place to collect ideas and build connections.", "f_inspiration", ["inspiration", "curation"], false, 7),
    make("b_github", "https://github.com/", "GitHub", "Where the world builds software. Keep an eye on the projects you rely on.", null, ["code", "tools"], true, 20),
    make("b_unsplash", "https://unsplash.com/", "Unsplash", "High-resolution photography for moodboards, prototypes, and side projects.", "f_design", ["photography", "assets"], false, 3),
    make("b_perplexity", "https://www.perplexity.ai/", "Perplexity", "An answer engine that cites its sources. Useful for quick research.", null, ["research", "ai"], false, 2),
    make("b_pocket", "https://getpocket.com/", "Pocket", "Save articles for later and read them without the noise.", "f_reading", ["reading", "tools"], false, 30, 2),
    make("b_typescale", "https://typescale.com/", "Typescale", "A tiny tool for exploring type scales before you commit to a system.", "f_design", ["typography", "tools"], false, 14),
    make("b_lobsters", "https://lobste.rs/", "Lobsters", "A link aggregator for computing enthusiasts with thoughtful discussion.", "f_learning", ["tech", "community"], false, 16)
  ];

  return {
    version: 1,
    folders: folders,
    bookmarks: bookmarks,
    preferences: {
      theme: systemTheme(),
      layout: "grid",
      sort: "newest",
      expandedFolders: ["f_design", "f_personal"]
    }
  };
}

function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    storageUnavailable = true;
    didSeed = true;
    return createSeedData();
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeData(parsed);
      if (normalized) {
        return normalized;
      }
      didRecover = true;
    } catch (error) {
      didRecover = true;
    }
    try {
      localStorage.setItem(CORRUPT_KEY, raw);
    } catch (error) {
      void error;
    }
  }
  didSeed = true;
  return createSeedData();
}

const state = {
  data: loadData(),
  view: { type: "all" },
  search: "",
  dragId: null,
  menu: null,
  menuAnchor: null,
  modalType: null,
  modalEntityId: null,
  modalParentId: null,
  modalTag: null,
  confirmCallback: null,
  pendingImport: null,
  tagDraft: [],
  lastAddedId: null,
  expanded: new Set()
};

state.expanded = new Set(state.data.preferences.expandedFolders);

function persist() {
  state.data.preferences.expandedFolders = Array.from(state.expanded);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (error) {
    if (!storageUnavailable) {
      storageUnavailable = true;
      showToast("This browser blocked local storage. Changes will only last for this session.", "error", { duration: 6500 });
    }
  }
}

function applyTheme(theme, animate) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-changing");
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove("theme-changing"), 320);
  }
  root.dataset.theme = theme === "dark" ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#0a0c11" : "#f5f6fa");
  }
  if (els.themeToggle) {
    const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.setAttribute("title", label);
  }
}

function formatRelative(timestamp) {
  if (!timestamp) {
    return "";
  }
  const difference = Date.now() - timestamp;
  const absolute = Math.abs(difference);
  if (absolute < 60000) {
    return "Just now";
  }
  if (absolute < 3600000) {
    return Math.floor(absolute / 60000) + "m ago";
  }
  if (absolute < DAY) {
    return Math.floor(absolute / 3600000) + "h ago";
  }
  if (absolute < 7 * DAY) {
    return Math.floor(absolute / DAY) + "d ago";
  }
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

function formatFull(timestamp) {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getFolder(id) {
  return state.data.folders.find((folder) => folder.id === id) || null;
}

function getBookmark(id) {
  return state.data.bookmarks.find((bookmark) => bookmark.id === id) || null;
}

function folderChildren(parentId) {
  return state.data.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function folderRows() {
  const rows = [];
  const visited = new Set();
  const walk = (parentId, depth) => {
    folderChildren(parentId).forEach((folder) => {
      if (visited.has(folder.id)) {
        return;
      }
      visited.add(folder.id);
      rows.push({ folder: folder, depth: depth });
      walk(folder.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

function visibleFolderRows() {
  const rows = [];
  const walk = (parentId, depth) => {
    folderChildren(parentId).forEach((folder) => {
      rows.push({ folder: folder, depth: depth });
      if (state.expanded.has(folder.id)) {
        walk(folder.id, depth + 1);
      }
    });
  };
  walk(null, 0);
  return rows;
}

function folderPath(id, separator) {
  const names = [];
  const seen = new Set();
  let folder = getFolder(id);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    names.unshift(folder.name);
    folder = folder.parentId ? getFolder(folder.parentId) : null;
  }
  return names.join(separator || " / ");
}

function descendantIds(id) {
  const result = [];
  const walk = (parentId) => {
    folderChildren(parentId).forEach((folder) => {
      result.push(folder.id);
      walk(folder.id);
    });
  };
  walk(id);
  return result;
}

function expandAncestors(id) {
  const seen = new Set();
  let folder = getFolder(id);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    state.expanded.add(folder.id);
    folder = folder.parentId ? getFolder(folder.parentId) : null;
  }
}

function directCount(folderId) {
  return state.data.bookmarks.filter((bookmark) => !bookmark.deletedAt && bookmark.folderId === folderId).length;
}

function activeBookmarks() {
  return state.data.bookmarks.filter((bookmark) => !bookmark.deletedAt);
}

function tagsWithCounts(list, order) {
  const counts = new Map();
  list.forEach((bookmark) => {
    (bookmark.tags || []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  const tags = Array.from(counts.entries()).map((entry) => ({ tag: entry[0], count: entry[1] }));
  if (order === "count") {
    tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  } else {
    tags.sort((a, b) => a.tag.localeCompare(b.tag));
  }
  return tags;
}

function navMatches(type) {
  if (type === "tags") {
    return state.view.type === "tags" || state.view.type === "tag";
  }
  return state.view.type === type;
}

function captureSnapshot() {
  return {
    data: clone(state.data),
    expanded: Array.from(state.expanded),
    view: clone(state.view),
    search: state.search
  };
}

function restoreSnapshot(snapshot) {
  state.data = snapshot.data;
  state.expanded = new Set(snapshot.expanded);
  state.view = snapshot.view;
  state.search = snapshot.search || "";
  els.searchInput.value = state.search;
  els.searchClear.hidden = !state.search;
  applyTheme(state.data.preferences.theme, false);
  persist();
  render();
}

function findDuplicateBookmark(url, excludeId) {
  const key = urlKey(url);
  return state.data.bookmarks.find((bookmark) => !bookmark.deletedAt && bookmark.id !== excludeId && urlKey(bookmark.url) === key) || null;
}
