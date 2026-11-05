"use strict";

function pageMeta() {
  const active = activeBookmarks();
  const meta = { title: "All bookmarks", subtitle: "" };
  if (state.view.type === "all") {
    meta.subtitle = plural(active.length, "bookmark") + " across " + plural(state.data.folders.length, "folder");
  } else if (state.view.type === "recent") {
    meta.title = "Recently added";
    meta.subtitle = "Everything saved in the last " + RECENT_DAYS + " days";
  } else if (state.view.type === "favorites") {
    meta.title = "Favorites";
    meta.subtitle = plural(active.filter((bookmark) => bookmark.starred).length, "bookmark") + " you starred";
  } else if (state.view.type === "tags") {
    meta.title = "Tags";
    meta.subtitle = "Browse your library by topic";
  } else if (state.view.type === "tag") {
    meta.title = "#" + state.view.tag;
    const count = active.filter((bookmark) => bookmark.tags.indexOf(state.view.tag) !== -1).length;
    meta.subtitle = plural(count, "bookmark") + " tagged #" + state.view.tag;
  } else if (state.view.type === "trash") {
    meta.title = "Trash";
    const count = state.data.bookmarks.filter((bookmark) => Boolean(bookmark.deletedAt)).length;
    meta.subtitle = count ? plural(count, "deleted bookmark") + " waiting to be cleared" : "Deleted bookmarks will appear here";
  } else if (state.view.type === "folder") {
    const folder = getFolder(state.view.folderId);
    if (folder) {
      meta.title = folder.name;
      const path = folderPath(folder.id, " / ");
      const direct = directCount(folder.id);
      meta.subtitle = path + " · " + plural(direct, "bookmark");
    } else {
      meta.title = "Folder";
    }
  }
  if (state.search) {
    meta.subtitle = 'Results for "' + state.search + '"';
  }
  return meta;
}

function renderSidebar() {
  const active = activeBookmarks();
  const now = Date.now();
  const counts = {
    all: active.length,
    recent: active.filter((bookmark) => now - bookmark.createdAt < RECENT_DAYS * DAY).length,
    favorites: active.filter((bookmark) => bookmark.starred).length,
    tags: tagsWithCounts(active, "alpha").length,
    trash: state.data.bookmarks.filter((bookmark) => Boolean(bookmark.deletedAt)).length
  };
  Object.keys(counts).forEach((name) => {
    const element = document.getElementById("count" + name.charAt(0).toUpperCase() + name.slice(1));
    if (element) {
      element.textContent = counts[name];
    }
  });
  $$("[data-nav]", els.sidebar).forEach((button) => {
    const isActive = navMatches(button.dataset.nav);
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  renderFolderTree();
  renderSidebarFooter();
}

function renderFolderTree() {
  if (!state.data.folders.length) {
    els.folderTree.innerHTML = '<div class="folder-empty">No folders yet.<br>Create one to start organizing.</div>';
    return;
  }
  const rows = visibleFolderRows();
  els.folderTree.innerHTML = rows.map((row) => {
    const folder = row.folder;
    const children = folderChildren(folder.id);
    const isExpanded = state.expanded.has(folder.id);
    const isActive = state.view.type === "folder" && state.view.folderId === folder.id;
    const toggle = children.length
      ? '<button class="tree-toggle" data-action="toggle-folder" data-folder-id="' + esc(folder.id) + '" aria-label="' + (isExpanded ? "Collapse " : "Expand ") + esc(folder.name) + '" title="' + (isExpanded ? "Collapse" : "Expand") + '">' + icon("chevron-right") + "</button>"
      : '<span class="tree-spacer"></span>';
    return '<div class="folder-row' + (isActive ? " active" : "") + (isExpanded ? " expanded" : "") + '" style="--depth:' + row.depth + '" data-folder-row="' + esc(folder.id) + '" data-drop-folder="' + esc(folder.id) + '" role="treeitem" aria-expanded="' + (children.length ? String(isExpanded) : "false") + '" aria-selected="' + String(isActive) + '">' +
      toggle +
      '<button class="folder-link" data-action="nav-folder" data-folder-id="' + esc(folder.id) + '" title="' + esc(folderPath(folder.id, " / ")) + '">' +
      '<span class="folder-dot" style="background:' + esc(folder.color) + '"></span>' +
      '<span class="folder-name">' + esc(folder.name) + "</span>" +
      '<span class="folder-count">' + directCount(folder.id) + "</span>" +
      "</button>" +
      '<button class="folder-actions" data-action="folder-menu" data-folder-id="' + esc(folder.id) + '" aria-label="Folder options" title="Folder options">' + icon("more") + "</button>" +
      "</div>";
  }).join("");
}

function renderSidebarFooter() {
  els.sidebarFooter.innerHTML =
    '<div class="privacy-card">' +
    '<span class="privacy-icon">' + icon("shield") + "</span>" +
    '<span class="privacy-text"><strong>Private by design</strong><span>Saved in this browser only</span></span>' +
    "</div>" +
    '<div class="storage-actions">' +
    '<button data-action="export-json" title="Download a JSON backup">' + icon("download") + "Export</button>" +
    '<button data-action="import-data" title="Restore from a backup">' + icon("upload") + "Import</button>" +
    "</div>";
}

function baseBookmarks() {
  const active = activeBookmarks();
  if (state.view.type === "recent") {
    const cutoff = Date.now() - RECENT_DAYS * DAY;
    return active.filter((bookmark) => bookmark.createdAt >= cutoff);
  }
  if (state.view.type === "favorites") {
    return active.filter((bookmark) => bookmark.starred);
  }
  if (state.view.type === "folder") {
    return active.filter((bookmark) => bookmark.folderId === state.view.folderId);
  }
  if (state.view.type === "tag") {
    return active.filter((bookmark) => bookmark.tags.indexOf(state.view.tag) !== -1);
  }
  if (state.view.type === "trash") {
    return state.data.bookmarks.filter((bookmark) => Boolean(bookmark.deletedAt));
  }
  return active;
}

function searchBookmarks(list) {
  const query = state.search.trim().toLowerCase();
  if (!query) {
    return list;
  }
  const terms = query.split(/\s+/).filter(Boolean);
  return list.filter((bookmark) => {
    const haystack = [
      bookmark.title,
      bookmark.url,
      bookmark.description,
      bookmark.tags.join(" "),
      bookmark.folderId ? folderPath(bookmark.folderId, " ") : ""
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.indexOf(term) !== -1);
  });
}

function sortBookmarks(list) {
  const sorted = list.slice();
  const sort = state.data.preferences.sort;
  if (sort === "oldest") {
    sorted.sort((a, b) => a.createdAt - b.createdAt);
  } else if (sort === "title") {
    sorted.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, undefined, { sensitivity: "base" }));
  } else if (sort === "domain") {
    sorted.sort((a, b) => domainInfo(a.url).root.localeCompare(domainInfo(b.url).root, undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

function render() {
  const meta = pageMeta();
  if (els.viewTitle.textContent !== meta.title) {
    els.viewTitle.textContent = meta.title;
  }
  els.viewSubtitle.textContent = meta.subtitle;
  document.title = meta.title + " · Stash";
  els.searchClear.hidden = !state.search;
  if (els.searchInput.value !== state.search) {
    els.searchInput.value = state.search;
  }
  els.sortSelect.value = state.data.preferences.sort;
  els.gridBtn.setAttribute("aria-pressed", String(state.data.preferences.layout === "grid"));
  els.listBtn.setAttribute("aria-pressed", String(state.data.preferences.layout === "list"));
  const trashCount = state.data.bookmarks.filter((bookmark) => Boolean(bookmark.deletedAt)).length;
  els.emptyTrashBtn.hidden = state.view.type !== "trash" || trashCount === 0;
  renderSidebar();
  renderContent();
}

function renderContent() {
  const isTagsView = state.view.type === "tags";
  const isTrash = state.view.type === "trash";
  const isList = state.data.preferences.layout === "list" && !isTagsView;
  const layoutClass = isTagsView ? "tags-grid" : isList ? "list" : "grid";

  els.toolbar.hidden = isTagsView;
  els.subfolders.innerHTML = "";
  els.subfolders.hidden = true;
  els.tagBar.innerHTML = "";
  els.tagBar.hidden = isTrash || isTagsView;

  if (state.view.type === "folder" && !state.search) {
    const children = folderChildren(state.view.folderId);
    if (children.length) {
      els.subfolders.hidden = false;
      els.subfolders.innerHTML = children.map((folder) =>
        '<button class="subfolder-chip" data-action="nav-folder" data-folder-id="' + esc(folder.id) + '">' +
        '<span class="folder-dot" style="background:' + esc(folder.color) + '"></span>' +
        "<span>" + esc(folder.name) + "</span>" +
        '<span class="subfolder-count">' + directCount(folder.id) + "</span>" +
        "</button>"
      ).join("");
    }
  }

  if (!isTrash && !isTagsView && !state.search) {
    const tags = tagsWithCounts(activeBookmarks(), "count");
    if (tags.length) {
      els.tagBar.hidden = false;
      els.tagBar.innerHTML = tags.map((entry) =>
        '<button class="tag-chip' + (state.view.type === "tag" && state.view.tag === entry.tag ? " active" : "") + '" data-action="nav-tag" data-tag="' + esc(entry.tag) + '">' +
        '<span class="tag-hash">#</span>' + esc(entry.tag) +
        '<span class="tag-count">' + entry.count + "</span>" +
        "</button>"
      ).join("");
    }
  }

  els.bookmarks.className = "bookmarks " + layoutClass;

  if (isTagsView) {
    renderTagsView();
    return;
  }

  const results = sortBookmarks(searchBookmarks(baseBookmarks()));

  if (!results.length) {
    els.bookmarks.innerHTML = "";
    els.bookmarks.hidden = true;
    els.emptyState.hidden = false;
    const config = emptyConfigForView();
    els.emptyState.innerHTML =
      '<div class="empty-icon">' + icon(config.icon) + "</div>" +
      "<h2>" + esc(config.title) + "</h2>" +
      "<p>" + esc(config.description) + "</p>" +
      (config.actions ? '<div class="empty-actions">' + config.actions + "</div>" : "");
    return;
  }

  els.emptyState.hidden = true;
  els.bookmarks.hidden = false;
  els.bookmarks.innerHTML = (isList ? renderListHead() : "") + results.map((bookmark, index) => bookmarkHTML(bookmark, index, isList)).join("");
  if (state.lastAddedId) {
    const card = els.bookmarks.querySelector('[data-bookmark-id="' + state.lastAddedId + '"]');
    if (card) {
      card.classList.add("is-new");
    }
    state.lastAddedId = null;
  }
}

function renderListHead() {
  return '<div class="list-head" aria-hidden="true">' +
    '<span class="lh-main">Bookmark</span>' +
    '<span class="lh-desc">Description</span>' +
    '<span class="lh-tags">Tags</span>' +
    '<span class="lh-meta">Folder & date</span>' +
    '<span class="lh-actions"></span>' +
    "</div>";
}

function bookmarkHTML(bookmark, index, isList) {
  const info = domainInfo(bookmark.url);
  const isTrash = Boolean(bookmark.deletedAt);
  const title = bookmark.title || titleFromDomain(info.host);
  const letter = avatarLetter(bookmark.url, title);
  const hue = hashHue(info.root || title);
  const folder = bookmark.folderId ? getFolder(bookmark.folderId) : null;
  const isStarred = bookmark.starred && !isTrash;
  const tags = bookmark.tags.slice(0, isList ? 3 : 5).map((tag) =>
    '<button class="bm-tag" data-action="nav-tag" data-tag="' + esc(tag) + '" title="Filter by #' + esc(tag) + '">#' + esc(tag) + "</button>"
  ).join("");
  const description = bookmark.description || "No description yet.";
  const folderPill = folder
    ? '<button class="folder-pill" data-action="nav-folder" data-folder-id="' + esc(folder.id) + '" title="' + esc(folderPath(folder.id, " / ")) + '"><span class="folder-dot" style="background:' + esc(folder.color) + '"></span><span>' + esc(folder.name) + "</span></button>"
    : '<span class="folder-pill"><span class="folder-dot" style="background:var(--text-tertiary)"></span><span>Unfiled</span></span>';
  const dateLabel = isTrash ? "Deleted " + formatRelative(bookmark.deletedAt) : formatRelative(bookmark.createdAt);
  const titleElement = isTrash
    ? '<span class="bm-title">' + esc(title) + "</span>"
    : '<a class="bm-title" href="' + esc(bookmark.url) + '" target="_blank" rel="noopener noreferrer" draggable="false" data-action="open-bookmark" data-bookmark-id="' + esc(bookmark.id) + '">' + esc(title) + "</a>";
  const actions = isTrash
    ? '<button class="icon-btn" data-action="restore-bookmark" data-bookmark-id="' + esc(bookmark.id) + '" aria-label="Restore bookmark" title="Restore">' + icon("restore") + "</button>" +
      '<button class="icon-btn" data-action="bookmark-menu" data-bookmark-id="' + esc(bookmark.id) + '" aria-label="Bookmark options" title="More actions">' + icon("more") + "</button>"
    : '<button class="icon-btn star-btn' + (isStarred ? " active" : "") + '" data-action="toggle-star" data-bookmark-id="' + esc(bookmark.id) + '" aria-label="' + (isStarred ? "Remove from favorites" : "Add to favorites") + '" title="' + (isStarred ? "Remove from favorites" : "Add to favorites") + '" aria-pressed="' + String(isStarred) + '">' + icon("star") + "</button>" +
      '<button class="icon-btn" data-action="bookmark-menu" data-bookmark-id="' + esc(bookmark.id) + '" aria-label="Bookmark options" title="More actions">' + icon("more") + "</button>";

  return '<article class="bookmark-card' + (isTrash ? " is-trash" : "") + (isStarred ? " is-starred" : "") + '" style="--i:' + Math.min(index, 14) + '" data-bookmark-card data-bookmark-id="' + esc(bookmark.id) + '" draggable="' + String(!isTrash) + '">' +
    '<div class="bm-main">' +
    '<span class="favicon-tile" style="--hue:' + hue + '" aria-hidden="true">' + esc(letter) + "</span>" +
    '<div class="bm-info">' +
    titleElement +
    '<span class="bm-domain">' + icon("link") + "<span>" + esc(info.host || bookmark.url) + "</span>" +
    (isStarred ? '<span class="star-indicator">' + icon("star") + "</span>" : "") +
    "</span>" +
    "</div>" +
    "</div>" +
    '<p class="bm-desc">' + esc(description) + "</p>" +
    '<div class="bm-tags">' + tags + "</div>" +
    '<div class="bm-meta">' + folderPill + '<span class="bm-date" title="' + esc(formatFull(isTrash ? bookmark.deletedAt : bookmark.createdAt)) + '">' + esc(dateLabel) + "</span></div>" +
    '<div class="bm-actions">' + actions + "</div>" +
    "</article>";
}

function renderTagsView() {
  const query = state.search.trim().toLowerCase();
  const tags = tagsWithCounts(activeBookmarks(), "count").filter((entry) => !query || entry.tag.indexOf(query) !== -1);
  if (!tags.length) {
    els.bookmarks.innerHTML = "";
    els.bookmarks.hidden = true;
    els.emptyState.hidden = false;
    const title = query ? "No matching tags" : "No tags yet";
    const description = query
      ? 'No tags match "' + state.search + '". Try a different search or clear it.'
      : "Add tags to your bookmarks and they will show up here for quick filtering.";
    els.emptyState.innerHTML =
      '<div class="empty-icon">' + icon("tag") + "</div>" +
      "<h2>" + esc(title) + "</h2>" +
      "<p>" + esc(description) + "</p>" +
      (query ? '<div class="empty-actions"><button class="btn btn-secondary" data-action="clear-search">Clear search</button></div>' : "") +
      (!query ? '<div class="empty-actions"><button class="btn btn-primary" data-action="add-bookmark">' + icon("plus") + "Add bookmark</button></div>" : "");
    return;
  }
  els.emptyState.hidden = true;
  els.bookmarks.hidden = false;
  els.bookmarks.innerHTML = tags.map((entry) => {
    const hue = hashHue(entry.tag);
    return '<article class="tag-card" style="--i:' + Math.min(entry.count, 12) + '">' +
      '<button class="tag-card-main" data-action="nav-tag" data-tag="' + esc(entry.tag) + '">' +
      '<span class="tag-tile" style="--hue:' + hue + '">#</span>' +
      '<span class="tag-card-info"><strong>#' + esc(entry.tag) + "</strong><span>" + plural(entry.count, "bookmark") + "</span></span>" +
      "</button>" +
      '<button class="icon-btn" data-action="tag-menu" data-tag="' + esc(entry.tag) + '" aria-label="Tag options" title="Tag options">' + icon("more") + "</button>" +
      "</article>";
  }).join("");
}

function emptyConfigForView() {
  const addButton = '<button class="btn btn-primary" data-action="add-bookmark">' + icon("plus") + "Add bookmark</button>";
  if (state.search) {
    return {
      icon: "search",
      title: "No matches",
      description: 'Nothing matched "' + state.search + '". Try a broader search or clear the filters.',
      actions: '<button class="btn btn-secondary" data-action="clear-search">Clear search</button>'
    };
  }
  if (state.view.type === "recent") {
    return {
      icon: "clock",
      title: "Nothing new yet",
      description: "Bookmarks added in the last " + RECENT_DAYS + " days will show up here.",
      actions: addButton
    };
  }
  if (state.view.type === "favorites") {
    return {
      icon: "star",
      title: "No favorites yet",
      description: "Star the bookmarks you want to keep close. They will appear here.",
      actions: '<button class="btn btn-secondary" data-action="nav" data-view="all">Browse all bookmarks</button>'
    };
  }
  if (state.view.type === "folder") {
    const folder = getFolder(state.view.folderId);
    return {
      icon: "folder",
      title: folder ? folder.name + " is empty" : "Folder is empty",
      description: "Save a bookmark here, or drag one onto this folder in the sidebar.",
      actions: addButton
    };
  }
  if (state.view.type === "tag") {
    return {
      icon: "tag",
      title: "No bookmarks with #" + state.view.tag,
      description: "Try another tag, or add this tag to a bookmark.",
      actions: '<button class="btn btn-secondary" data-action="nav" data-view="all">Browse all bookmarks</button>'
    };
  }
  if (state.view.type === "trash") {
    return {
      icon: "trash",
      title: "Trash is empty",
      description: "Deleted bookmarks will stay here until you restore them or empty the trash.",
      actions: ""
    };
  }
  return {
    icon: "bookmark",
    title: "Your library is empty",
    description: "Save your first link and start building a library that is entirely yours.",
    actions: addButton
  };
}
