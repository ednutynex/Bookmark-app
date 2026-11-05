"use strict";

function syncSidebarState() {
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  const isOpen = els.app.classList.contains("sidebar-open");
  const trigger = document.querySelector('[data-action="open-sidebar"]');
  if (trigger) {
    trigger.setAttribute("aria-expanded", String(isOpen));
  }
  if (isMobile && !isOpen) {
    els.sidebar.setAttribute("inert", "");
    els.sidebar.setAttribute("aria-hidden", "true");
  } else {
    els.sidebar.removeAttribute("inert");
    els.sidebar.removeAttribute("aria-hidden");
  }
}

function closeSidebar() {
  const hadFocus = els.sidebar.contains(document.activeElement);
  els.app.classList.remove("sidebar-open");
  syncSidebarState();
  if (hadFocus && window.matchMedia("(max-width: 900px)").matches) {
    const trigger = document.querySelector('[data-action="open-sidebar"]');
    if (trigger) {
      trigger.focus({ preventScroll: true });
    }
  }
}

function openSidebar() {
  els.app.classList.add("sidebar-open");
  syncSidebarState();
  if (window.matchMedia("(max-width: 900px)").matches) {
    const closeButton = els.sidebar.querySelector(".sidebar-close");
    if (closeButton) {
      closeButton.focus({ preventScroll: true });
    }
  }
}

function navigate(type, id) {
  if (type === "folder") {
    if (!getFolder(id)) {
      return;
    }
    state.view = { type: "folder", folderId: id };
    expandAncestors(id);
    state.expanded.add(id);
  } else if (type === "tag") {
    state.view = { type: "tag", tag: id };
  } else if (["all", "recent", "favorites", "tags", "trash"].indexOf(type) !== -1) {
    state.view = { type: type };
  }
  state.search = "";
  els.searchInput.value = "";
  persist();
  render();
  closeSidebar();
}

function sanitizeView() {
  if (state.view.type === "folder" && !getFolder(state.view.folderId)) {
    state.view = { type: "all" };
  }
  if (state.view.type === "tag" && !activeBookmarks().some((bookmark) => bookmark.tags.indexOf(state.view.tag) !== -1)) {
    state.view = { type: "tags" };
  }
  const validFolders = new Set(state.data.folders.map((folder) => folder.id));
  state.expanded = new Set(Array.from(state.expanded).filter((id) => validFolders.has(id)));
}

function bookmarkVisible(bookmark) {
  if (!bookmark) {
    return false;
  }
  if (state.search) {
    const query = state.search.trim().toLowerCase();
    if (query) {
      const terms = query.split(/\s+/).filter(Boolean);
      const haystack = [bookmark.title, bookmark.url, bookmark.description, bookmark.tags.join(" ")].join(" ").toLowerCase();
      if (!terms.every((term) => haystack.indexOf(term) !== -1)) {
        return false;
      }
    }
  }
  if (state.view.type === "all") {
    return true;
  }
  if (state.view.type === "recent") {
    return bookmark.createdAt >= Date.now() - RECENT_DAYS * DAY;
  }
  if (state.view.type === "favorites") {
    return bookmark.starred;
  }
  if (state.view.type === "folder") {
    return bookmark.folderId === state.view.folderId;
  }
  if (state.view.type === "tag") {
    return bookmark.tags.indexOf(state.view.tag) !== -1;
  }
  return false;
}

function toggleFolder(id) {
  if (state.expanded.has(id)) {
    state.expanded.delete(id);
  } else {
    state.expanded.add(id);
  }
  persist();
  renderSidebar();
}

function toggleStar(id) {
  const bookmark = getBookmark(id);
  if (!bookmark || bookmark.deletedAt) {
    return;
  }
  const snapshot = captureSnapshot();
  bookmark.starred = !bookmark.starred;
  bookmark.updatedAt = Date.now();
  persist();
  render();
  if (!bookmark.starred && state.view.type === "favorites") {
    showToast("Removed from favorites.", "info", {
      action: {
        label: "Undo",
        onClick: () => restoreSnapshot(snapshot)
      }
    });
  }
}

function trashBookmark(id) {
  const bookmark = getBookmark(id);
  if (!bookmark || bookmark.deletedAt) {
    return;
  }
  const snapshot = captureSnapshot();
  bookmark.deletedAt = Date.now();
  bookmark.updatedAt = bookmark.deletedAt;
  persist();
  render();
  showToast('Moved "' + (bookmark.title || titleFromDomain(domainInfo(bookmark.url).host)) + '" to trash.', "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function restoreBookmark(id) {
  const bookmark = getBookmark(id);
  if (!bookmark || !bookmark.deletedAt) {
    return;
  }
  const snapshot = captureSnapshot();
  bookmark.deletedAt = null;
  bookmark.updatedAt = Date.now();
  if (bookmark.folderId && !getFolder(bookmark.folderId)) {
    bookmark.folderId = null;
  }
  persist();
  render();
  showToast("Bookmark restored.", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function purgeBookmark(id) {
  const bookmark = getBookmark(id);
  if (!bookmark) {
    return;
  }
  const title = bookmark.title || titleFromDomain(domainInfo(bookmark.url).host);
  openConfirm({
    title: "Delete forever?",
    subtitle: title,
    message: "This bookmark will be permanently removed. <strong>This cannot be undone.</strong>",
    confirmLabel: "Delete forever",
    danger: true,
    icon: "trash",
    onConfirm: () => {
      const snapshot = captureSnapshot();
      state.data.bookmarks = state.data.bookmarks.filter((item) => item.id !== id);
      persist();
      render();
      showToast("Bookmark deleted forever.", "info", {
        action: {
          label: "Undo",
          onClick: () => restoreSnapshot(snapshot)
        }
      });
    }
  });
}

function emptyTrash() {
  const count = state.data.bookmarks.filter((bookmark) => Boolean(bookmark.deletedAt)).length;
  if (!count) {
    showToast("Trash is already empty.", "info");
    return;
  }
  openConfirm({
    title: "Empty trash?",
    subtitle: plural(count, "bookmark") + " will be removed",
    message: "All deleted bookmarks will be permanently removed. <strong>This cannot be undone.</strong>",
    confirmLabel: "Empty trash",
    danger: true,
    icon: "trash",
    onConfirm: () => {
      const snapshot = captureSnapshot();
      state.data.bookmarks = state.data.bookmarks.filter((bookmark) => !bookmark.deletedAt);
      persist();
      render();
      showToast(plural(count, "bookmark") + " permanently deleted.", "info", {
        action: {
          label: "Undo",
          onClick: () => restoreSnapshot(snapshot)
        }
      });
    }
  });
}

function moveBookmarkTo(bookmarkId, folderId) {
  const bookmark = getBookmark(bookmarkId);
  if (!bookmark) {
    showToast("That bookmark could not be found.", "error");
    return;
  }
  const folder = folderId ? getFolder(folderId) : null;
  if (folderId && !folder) {
    showToast("That folder could not be found.", "error");
    return;
  }
  if (bookmark.folderId === (folder ? folder.id : null)) {
    closeModal();
    return;
  }
  const snapshot = captureSnapshot();
  bookmark.folderId = folder ? folder.id : null;
  bookmark.updatedAt = Date.now();
  persist();
  render();
  closeModal();
  showToast("Moved to " + (folder ? folder.name : "Unfiled") + ".", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function deleteFolder(id) {
  const folder = getFolder(id);
  if (!folder) {
    return;
  }
  const childFolders = folderChildren(id).length;
  const bookmarks = directCount(id);
  const target = folder.parentId ? getFolder(folder.parentId) : null;
  const destination = target ? target.name : "Unfiled";
  openConfirm({
    title: "Delete folder?",
    subtitle: folder.name,
    message: "This will delete <strong>" + esc(folder.name) + "</strong>. " +
      (bookmarks ? plural(bookmarks, "bookmark") + " will move to <strong>" + esc(destination) + "</strong>. " : "") +
      (childFolders ? plural(childFolders, "subfolder") + " will move up one level. " : "") +
      "The bookmarks themselves will not be deleted.",
    confirmLabel: "Delete folder",
    danger: true,
    icon: "folder",
    onConfirm: () => {
      const snapshot = captureSnapshot();
      state.data.bookmarks.forEach((bookmark) => {
        if (bookmark.folderId === id) {
          bookmark.folderId = folder.parentId || null;
          bookmark.updatedAt = Date.now();
        }
      });
      state.data.folders.forEach((item) => {
        if (item.parentId === id) {
          item.parentId = folder.parentId || null;
        }
      });
      state.data.folders = state.data.folders.filter((item) => item.id !== id);
      state.expanded.delete(id);
      if (state.view.type === "folder" && state.view.folderId === id) {
        state.view = folder.parentId ? { type: "folder", folderId: folder.parentId } : { type: "all" };
      }
      persist();
      render();
      showToast("Folder deleted.", "info", {
        action: {
          label: "Undo",
          onClick: () => restoreSnapshot(snapshot)
        }
      });
    }
  });
}

function submitBookmarkForm() {
  const urlInput = document.getElementById("bookmarkUrl");
  const titleInput = document.getElementById("bookmarkTitle");
  const descriptionInput = document.getElementById("bookmarkDescription");
  const folderInput = document.getElementById("bookmarkFolder");
  if (!urlInput || !titleInput || !descriptionInput || !folderInput) {
    return;
  }
  const parsed = parseUrl(urlInput.value);
  if (parsed.error) {
    setFieldError("url", parsed.error);
    return;
  }
  const duplicate = findDuplicateBookmark(parsed.url, state.modalEntityId);
  if (duplicate) {
    setFieldError("url", 'This link is already saved as "' + (duplicate.title || titleFromDomain(domainInfo(duplicate.url).host)) + '".');
    return;
  }
  const editing = getBookmark(state.modalEntityId);
  const folderId = folderInput.value && getFolder(folderInput.value) ? folderInput.value : null;
  const tags = getTagDraft();
  const id = editing ? editing.id : uid("b");
  const snapshot = captureSnapshot();
  let bookmark;

  if (editing) {
    bookmark = editing;
    bookmark.url = parsed.url;
    bookmark.title = titleInput.value.trim().slice(0, 200);
    bookmark.description = descriptionInput.value.trim().slice(0, 600);
    bookmark.folderId = folderId;
    bookmark.tags = tags;
    bookmark.updatedAt = Date.now();
  } else {
    bookmark = {
      id: id,
      url: parsed.url,
      title: titleInput.value.trim().slice(0, 200),
      description: descriptionInput.value.trim().slice(0, 600),
      folderId: folderId,
      tags: tags,
      starred: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null
    };
    state.data.bookmarks.unshift(bookmark);
    state.lastAddedId = id;
    state.search = "";
    els.searchInput.value = "";
    if (!bookmarkVisible(bookmark)) {
      state.view = { type: "all" };
    }
  }

  persist();
  render();
  closeModal();
  showToast(editing ? "Bookmark updated." : "Bookmark added.", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function submitFolderForm() {
  const nameInput = document.getElementById("folderName");
  const parentInput = document.getElementById("folderParent");
  const colorInput = document.querySelector('input[name="folderColor"]:checked');
  if (!nameInput || !parentInput) {
    return;
  }
  const name = nameInput.value.trim();
  if (!name) {
    setFieldError("folderName", "Please enter a folder name.");
    return;
  }
  const parentId = parentInput.value && getFolder(parentInput.value) ? parentInput.value : null;
  const editing = getFolder(state.modalEntityId);
  const duplicate = state.data.folders.find((folder) =>
    folder.id !== (editing ? editing.id : "") &&
    folder.parentId === parentId &&
    folder.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    setFieldError("folderName", "A folder with this name already exists here.");
    return;
  }
  const color = colorInput ? colorInput.value : FOLDER_COLORS[0];
  const snapshot = captureSnapshot();
  let folder;

  if (editing) {
    folder = editing;
    folder.name = name.slice(0, 60);
    folder.parentId = parentId;
    folder.color = color;
  } else {
    folder = {
      id: uid("f"),
      name: name.slice(0, 60),
      parentId: parentId,
      color: color,
      createdAt: Date.now()
    };
    state.data.folders.push(folder);
    if (parentId) {
      state.expanded.add(parentId);
    }
  }

  persist();
  render();
  closeModal();
  showToast(editing ? "Folder updated." : "Folder created.", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function submitTagRenameForm() {
  const input = document.getElementById("tagName");
  if (!input || !state.modalTag) {
    return;
  }
  const oldTag = state.modalTag;
  const newTag = normalizeTag(input.value);
  if (!newTag) {
    setFieldError("tagName", "Please enter a valid tag name.");
    return;
  }
  if (newTag === oldTag) {
    closeModal();
    return;
  }
  const existed = activeBookmarks().some((bookmark) => bookmark.tags.indexOf(newTag) !== -1);
  const snapshot = captureSnapshot();
  state.data.bookmarks.forEach((bookmark) => {
    if (bookmark.tags.indexOf(oldTag) !== -1) {
      const tags = [];
      bookmark.tags.forEach((tag) => {
        const value = tag === oldTag ? newTag : tag;
        if (tags.indexOf(value) === -1) {
          tags.push(value);
        }
      });
      bookmark.tags = tags;
      bookmark.updatedAt = Date.now();
    }
  });
  if (state.view.type === "tag" && state.view.tag === oldTag) {
    state.view = { type: "tag", tag: newTag };
  }
  persist();
  render();
  closeModal();
  showToast(existed ? "Tags merged into #" + newTag + "." : "Tag renamed to #" + newTag + ".", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function deleteTag(tag) {
  const count = state.data.bookmarks.filter((bookmark) => bookmark.tags.indexOf(tag) !== -1).length;
  openConfirm({
    title: "Delete tag?",
    subtitle: "#" + tag,
    message: "This removes <strong>#" + esc(tag) + "</strong> from " + plural(count, "bookmark") + ". The bookmarks themselves stay in your library.",
    confirmLabel: "Delete tag",
    danger: true,
    icon: "tag",
    onConfirm: () => {
      const snapshot = captureSnapshot();
      state.data.bookmarks.forEach((bookmark) => {
        if (bookmark.tags.indexOf(tag) !== -1) {
          bookmark.tags = bookmark.tags.filter((item) => item !== tag);
          bookmark.updatedAt = Date.now();
        }
      });
      if (state.view.type === "tag" && state.view.tag === tag) {
        state.view = { type: "tags" };
      }
      persist();
      render();
      showToast("#" + tag + " removed.", "info", {
        action: {
          label: "Undo",
          onClick: () => restoreSnapshot(snapshot)
        }
      });
    }
  });
}

function copyLink(bookmarkId) {
  const bookmark = getBookmark(bookmarkId);
  if (!bookmark) {
    return;
  }
  const text = bookmark.url;
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      showToast("Link copied.", "success");
    } catch (error) {
      showToast("Could not copy the link.", "error");
    }
    area.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Link copied.", "success")).catch(fallback);
  } else {
    fallback();
  }
}

function openBookmarkMenu(anchor, id) {
  const bookmark = getBookmark(id);
  if (!bookmark) {
    return;
  }
  const attributes = ' data-bookmark-id="' + esc(id) + '"';
  const html = bookmark.deletedAt
    ? menuButton("Restore bookmark", "restore", "restore-bookmark", attributes) +
      menuButton("Copy link", "copy", "copy-link", attributes) +
      menuSeparator() +
      menuButton("Delete forever", "trash", "purge-bookmark", attributes, true)
    : menuButton("Edit bookmark", "pencil", "edit-bookmark", attributes) +
      menuButton("Move to folder", "move", "move-bookmark", attributes) +
      menuButton("Copy link", "copy", "copy-link", attributes) +
      menuSeparator() +
      menuButton("Move to trash", "trash", "delete-bookmark", attributes, true);
  showMenu(anchor, html);
}

function openFolderMenu(anchor, id) {
  const folder = getFolder(id);
  if (!folder) {
    return;
  }
  const attributes = ' data-folder-id="' + esc(id) + '"';
  showMenu(anchor,
    menuLabel(folder.name) +
    menuButton("Rename folder", "pencil", "edit-folder", attributes) +
    menuButton("New subfolder", "plus", "new-subfolder", attributes) +
    menuSeparator() +
    menuButton("Delete folder", "trash", "delete-folder", attributes, true)
  );
}

function openTagMenu(anchor, tag) {
  const attributes = ' data-tag="' + esc(tag) + '"';
  showMenu(anchor,
    menuLabel("#" + tag) +
    menuButton("Rename tag", "pencil", "rename-tag", attributes) +
    menuButton("Delete tag", "trash", "delete-tag", attributes, true)
  );
}

function openDataMenu(anchor) {
  showMenu(anchor,
    menuLabel("Backup") +
    menuButton("Export as JSON", "download", "export-json") +
    menuButton("Export as HTML", "code", "export-html") +
    menuSeparator() +
    menuButton("Import backup", "upload", "import-data")
  );
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = {
    app: "Stash",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    folders: state.data.folders,
    bookmarks: state.data.bookmarks,
    preferences: state.data.preferences
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadFile("stash-bookmarks-" + date + ".json", JSON.stringify(payload, null, 2), "application/json");
  showToast("JSON backup downloaded.", "success");
}

function exportHtml() {
  const active = activeBookmarks();
  const rows = folderRows();
  const groups = [];
  const unfiled = active.filter((bookmark) => !bookmark.folderId || !getFolder(bookmark.folderId));
  if (unfiled.length) {
    groups.push({ name: "Unfiled", color: "#9aa1b2", bookmarks: unfiled });
  }
  rows.forEach((row) => {
    const list = active.filter((bookmark) => bookmark.folderId === row.folder.id);
    if (list.length) {
      groups.push({ name: folderPath(row.folder.id, " / "), color: row.folder.color, bookmarks: list });
    }
  });
  groups.forEach((group) => {
    group.bookmarks.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, undefined, { sensitivity: "base" }));
  });
  const body = groups.map((group) =>
    '<section class="group">' +
    '<h2><span class="dot" style="background:' + esc(group.color) + '"></span>' + esc(group.name) + '<span class="count">' + group.bookmarks.length + "</span></h2>" +
    group.bookmarks.map((bookmark) => {
      const info = domainInfo(bookmark.url);
      const title = bookmark.title || titleFromDomain(info.host);
      const search = [title, bookmark.url, bookmark.description, bookmark.tags.join(" "), group.name].join(" ").toLowerCase();
      return '<article class="bookmark" data-search="' + esc(search) + '">' +
        '<a href="' + esc(bookmark.url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + "</a>" +
        '<div class="domain">' + esc(info.host) + "</div>" +
        (bookmark.description ? '<p>' + esc(bookmark.description) + "</p>" : "") +
        (bookmark.tags.length ? '<div class="tags">' + bookmark.tags.map((tag) => "<span>#" + esc(tag) + "</span>").join("") + "</div>" : "") +
        "</article>";
    }).join("") +
    "</section>"
  ).join("");
  const html = "<!doctype html>" +
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>Stash bookmarks export</title>" +
    "<style>" +
    ":root{color-scheme:light dark;--bg:#f6f7fb;--surface:#fff;--text:#171a23;--muted:#697086;--border:#e4e7f0;--accent:#6d5efc}" +
    "@media(prefers-color-scheme:dark){:root{--bg:#0a0c11;--surface:#121620;--text:#eef0f6;--muted:#9aa1b2;--border:#252a38;--accent:#8b80ff}}" +
    "*{box-sizing:border-box}body{margin:0;padding:40px 20px;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}" +
    "main{max-width:820px;margin:0 auto}h1{margin:0;font-size:28px;letter-spacing:-.03em}header p{margin:6px 0 24px;color:var(--muted)}" +
    ".search{width:100%;height:44px;margin-bottom:28px;padding:0 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit}" +
    ".group{margin:0 0 30px}.group h2{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}" +
    ".dot{width:8px;height:8px;border-radius:50%}.count{margin-left:auto;font-weight:500}.bookmark{padding:13px 15px;margin-bottom:8px;border:1px solid var(--border);border-radius:11px;background:var(--surface)}" +
    ".bookmark a{color:var(--text);font-weight:650;text-decoration:none}.bookmark a:hover{color:var(--accent)}.domain{color:var(--muted);font-size:11px;margin-top:2px}" +
    ".bookmark p{margin:7px 0 0;color:var(--muted);font-size:12px}.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.tags span{padding:2px 7px;border-radius:6px;background:var(--bg);color:var(--muted);font-size:10px}" +
    ".empty{padding:20px 0;color:var(--muted)}" +
    "</style></head><body><main>" +
    "<header><h1>Stash bookmarks</h1><p>Exported " + esc(new Date().toLocaleString("en-US")) + " · " + plural(active.length, "bookmark") + "</p></header>" +
    '<input class="search" id="search" type="search" placeholder="Filter bookmarks..." aria-label="Filter bookmarks">' +
    '<div id="groups">' + body + "</div>" +
    '<p class="empty" id="empty" hidden>No bookmarks match that filter.</p>' +
    "</main><script>" +
    "var q=document.getElementById('search'),groups=document.querySelectorAll('.group'),items=document.querySelectorAll('.bookmark'),empty=document.getElementById('empty');" +
    "q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),shown=0;groups.forEach(function(g){var visible=0;g.querySelectorAll('.bookmark').forEach(function(item){var show=!v||item.getAttribute('data-search').indexOf(v)!==-1;item.hidden=!show;if(show){visible++;shown++;}});g.hidden=visible===0;});empty.hidden=shown!==0;});" +
    "</script></body></html>";
  const date = new Date().toISOString().slice(0, 10);
  downloadFile("stash-bookmarks-" + date + ".html", html, "text/html");
  showToast("HTML export downloaded.", "success");
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsText(file);
  });
}

async function handleImportFile(file) {
  if (!file) {
    return;
  }
  try {
    const text = await readFileText(file);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      showToast("That file is not valid JSON.", "error");
      return;
    }
    const normalized = normalizeData(parsed);
    if (!normalized) {
      showToast("That JSON file does not look like a Stash backup.", "error");
      return;
    }
    openImportModal(normalized, file.name);
  } catch (error) {
    showToast("Could not read that file.", "error");
  } finally {
    els.importInput.value = "";
  }
}

function mergeFolderIntoLibrary(folder, incomingById, map, foldersAddedRef) {
  if (map.has(folder.id)) {
    return map.get(folder.id);
  }
  const parent = folder.parentId ? incomingById.get(folder.parentId) : null;
  const parentId = parent ? mergeFolderIntoLibrary(parent, incomingById, map, foldersAddedRef) : null;
  const existing = state.data.folders.find((item) =>
    item.parentId === parentId && item.name.toLowerCase() === folder.name.toLowerCase()
  );
  if (existing) {
    map.set(folder.id, existing.id);
    return existing.id;
  }
  const created = {
    id: uid("f"),
    name: folder.name,
    parentId: parentId,
    color: folder.color,
    createdAt: folder.createdAt
  };
  state.data.folders.push(created);
  map.set(folder.id, created.id);
  foldersAddedRef.value += 1;
  return created.id;
}

function mergeImport(imported) {
  const snapshot = captureSnapshot();
  const incomingById = new Map(imported.folders.map((folder) => [folder.id, folder]));
  const map = new Map();
  const foldersAddedRef = { value: 0 };
  imported.folders.forEach((folder) => mergeFolderIntoLibrary(folder, incomingById, map, foldersAddedRef));
  const keys = new Set(state.data.bookmarks.map((bookmark) => urlKey(bookmark.url)));
  let bookmarksAdded = 0;
  imported.bookmarks.forEach((bookmark) => {
    const key = urlKey(bookmark.url);
    if (keys.has(key)) {
      return;
    }
    keys.add(key);
    const created = clone(bookmark);
    created.id = uid("b");
    created.folderId = bookmark.folderId ? map.get(bookmark.folderId) || null : null;
    state.data.bookmarks.push(created);
    bookmarksAdded += 1;
  });
  persist();
  sanitizeView();
  render();
  closeModal();
  if (!bookmarksAdded && !foldersAddedRef.value) {
    showToast("Nothing new to import. Everything was already in your library.", "info");
    return;
  }
  showToast("Imported " + plural(bookmarksAdded, "bookmark") + " and " + plural(foldersAddedRef.value, "folder") + ".", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function replaceWithImport(imported, snapshot) {
  state.data = clone(imported);
  state.expanded = new Set(state.data.preferences.expandedFolders);
  sanitizeView();
  applyTheme(state.data.preferences.theme, true);
  persist();
  render();
  closeModal();
  showToast("Library replaced with the backup.", "success", {
    action: {
      label: "Undo",
      onClick: () => restoreSnapshot(snapshot)
    }
  });
}

function handleAction(action, target, event) {
  const data = target.dataset;
  if (action !== "open-bookmark") {
    event.preventDefault();
  }
  if (action === "nav") {
    navigate(data.view);
  } else if (action === "nav-folder") {
    navigate("folder", data.folderId);
  } else if (action === "nav-tag") {
    navigate("tag", data.tag);
  } else if (action === "toggle-folder") {
    toggleFolder(data.folderId);
  } else if (action === "toggle-theme") {
    state.data.preferences.theme = state.data.preferences.theme === "dark" ? "light" : "dark";
    applyTheme(state.data.preferences.theme, true);
    persist();
  } else if (action === "set-layout") {
    state.data.preferences.layout = data.layout === "list" ? "list" : "grid";
    persist();
    render();
  } else if (action === "clear-search") {
    state.search = "";
    els.searchInput.value = "";
    render();
    els.searchInput.focus();
  } else if (action === "add-bookmark") {
    openBookmarkModal(null);
  } else if (action === "edit-bookmark") {
    openBookmarkModal(data.bookmarkId);
  } else if (action === "delete-bookmark") {
    if (els.modal.open) {
      const id = data.bookmarkId || state.modalEntityId;
      const bookmark = getBookmark(id);
      openConfirm({
        title: "Move to trash?",
        subtitle: bookmark ? bookmark.title || titleFromDomain(domainInfo(bookmark.url).host) : "",
        message: "You can restore this bookmark from Trash anytime.",
        confirmLabel: "Move to trash",
        danger: false,
        icon: "trash",
        onConfirm: () => trashBookmark(id)
      });
    } else {
      trashBookmark(data.bookmarkId);
    }
  } else if (action === "restore-bookmark") {
    restoreBookmark(data.bookmarkId);
  } else if (action === "purge-bookmark") {
    purgeBookmark(data.bookmarkId);
  } else if (action === "toggle-star") {
    toggleStar(data.bookmarkId);
  } else if (action === "bookmark-menu") {
    openBookmarkMenu(target, data.bookmarkId);
  } else if (action === "move-bookmark") {
    openMoveModal(data.bookmarkId);
  } else if (action === "move-to-folder") {
    moveBookmarkTo(data.bookmarkId, data.folderId);
  } else if (action === "copy-link") {
    copyLink(data.bookmarkId);
  } else if (action === "new-folder") {
    openFolderModal(null);
  } else if (action === "new-subfolder") {
    openFolderModal(null, data.folderId);
  } else if (action === "edit-folder") {
    openFolderModal(data.folderId);
  } else if (action === "folder-menu") {
    openFolderMenu(target, data.folderId);
  } else if (action === "delete-folder") {
    deleteFolder(data.folderId);
  } else if (action === "tag-menu") {
    openTagMenu(target, data.tag);
  } else if (action === "rename-tag") {
    openTagRenameModal(data.tag);
  } else if (action === "delete-tag") {
    deleteTag(data.tag);
  } else if (action === "empty-trash") {
    emptyTrash();
  } else if (action === "open-data-menu") {
    openDataMenu(target);
  } else if (action === "export-json") {
    exportJson();
  } else if (action === "export-html") {
    exportHtml();
  } else if (action === "import-data") {
    els.importInput.click();
  } else if (action === "import-merge") {
    if (state.pendingImport) {
      mergeImport(state.pendingImport.data);
    }
  } else if (action === "import-replace") {
    if (state.pendingImport) {
      const pending = state.pendingImport;
      const snapshot = captureSnapshot();
      openConfirm({
        title: "Replace your library?",
        subtitle: pending.fileName,
        message: "Your current bookmarks and folders will be replaced by the backup. <strong>This cannot be undone</strong> except with the Undo button shown afterwards.",
        confirmLabel: "Replace everything",
        danger: true,
        icon: "database",
        onConfirm: () => replaceWithImport(pending.data, snapshot)
      });
    }
  } else if (action === "confirm-action") {
    const callback = state.confirmCallback;
    closeModal();
    if (typeof callback === "function") {
      callback();
    }
  } else if (action === "modal-close") {
    closeModal();
  } else if (action === "open-sidebar") {
    openSidebar();
  } else if (action === "close-sidebar") {
    closeSidebar();
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (state.menu && !state.menu.contains(event.target)) {
      closeMenu();
    }
    if (!target) {
      if (!event.target.closest(".sidebar") && !event.target.closest('[data-action="open-sidebar"]')) {
        closeSidebar();
      }
      return;
    }
    handleAction(target.dataset.action, target, event);
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "bookmarkForm") {
      event.preventDefault();
      submitBookmarkForm();
    } else if (event.target.id === "folderForm") {
      event.preventDefault();
      submitFolderForm();
    } else if (event.target.id === "tagRenameForm") {
      event.preventDefault();
      submitTagRenameForm();
    }
  });

  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value;
    render();
  });

  els.sortSelect.addEventListener("change", () => {
    state.data.preferences.sort = SORTS.indexOf(els.sortSelect.value) !== -1 ? els.sortSelect.value : "newest";
    persist();
    render();
  });

  els.importInput.addEventListener("change", () => {
    const file = els.importInput.files && els.importInput.files[0];
    handleImportFile(file);
  });

  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) {
      closeModal();
    }
  });

  els.modal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModal();
  });

  els.modal.addEventListener("close", () => {
    els.app.classList.remove("modal-open");
    els.modal.innerHTML = "";
    state.modalType = null;
    state.modalEntityId = null;
    state.modalParentId = null;
    state.modalTag = null;
    state.confirmCallback = null;
    state.pendingImport = null;
    state.tagDraft = [];
  });

  document.addEventListener("keydown", (event) => {
    const tag = (event.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || event.target.isContentEditable;
    if (event.key === "Escape") {
      if (state.menu) {
        closeMenu();
        return;
      }
      if (els.app.classList.contains("sidebar-open")) {
        closeSidebar();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (!els.modal.open) {
        els.searchInput.focus();
        els.searchInput.select();
      }
      return;
    }
    if (typing || els.modal.open || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    } else if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      openBookmarkModal(null);
    }
  });

  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-bookmark-card]");
    if (!card || card.getAttribute("draggable") !== "true") {
      return;
    }
    state.dragId = card.dataset.bookmarkId;
    card.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.dragId);
    }
  });

  document.addEventListener("dragend", () => {
    state.dragId = null;
    $$(".dragging").forEach((element) => element.classList.remove("dragging"));
    $$(".drop-target").forEach((element) => element.classList.remove("drop-target"));
  });

  document.addEventListener("dragover", (event) => {
    if (!state.dragId) {
      return;
    }
    const target = event.target.closest("[data-drop-folder], [data-drop-trash]");
    $$(".drop-target").forEach((element) => {
      if (element !== target) {
        element.classList.remove("drop-target");
      }
    });
    if (!target) {
      return;
    }
    event.preventDefault();
    target.classList.add("drop-target");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  document.addEventListener("dragleave", (event) => {
    const target = event.target.closest("[data-drop-folder], [data-drop-trash]");
    if (target && !target.contains(event.relatedTarget)) {
      target.classList.remove("drop-target");
    }
  });

  document.addEventListener("drop", (event) => {
    if (!state.dragId) {
      return;
    }
    const folderTarget = event.target.closest("[data-drop-folder]");
    const trashTarget = event.target.closest("[data-drop-trash]");
    if (!folderTarget && !trashTarget) {
      return;
    }
    event.preventDefault();
    const id = state.dragId;
    const folderId = folderTarget ? folderTarget.dataset.dropFolder : null;
    state.dragId = null;
    $$(".drop-target").forEach((element) => element.classList.remove("drop-target"));
    $$(".dragging").forEach((element) => element.classList.remove("dragging"));
    if (trashTarget) {
      trashBookmark(id);
    } else {
      moveBookmarkTo(id, folderId);
    }
    closeSidebar();
  });

  window.addEventListener("resize", () => {
    closeMenu();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 900) {
        closeSidebar();
      } else {
        syncSidebarState();
      }
    }, 120);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }
    try {
      const normalized = normalizeData(JSON.parse(event.newValue));
      if (!normalized) {
        return;
      }
      state.data = normalized;
      state.expanded = new Set(normalized.preferences.expandedFolders);
      sanitizeView();
      applyTheme(normalized.preferences.theme, false);
      render();
      showToast("Library updated from another tab.", "info");
    } catch (error) {
      void error;
    }
  });
}

function init() {
  applyTheme(state.data.preferences.theme, false);
  persist();
  bindEvents();
  render();
  syncSidebarState();
  if (didRecover) {
    setTimeout(() => showToast("Your saved data was damaged, so Stash restored the sample library. The damaged copy was backed up.", "error", { duration: 7000 }), 300);
  } else if (didSeed) {
    setTimeout(() => showToast("Welcome to Stash. Sample bookmarks are ready to explore.", "info", { duration: 5000 }), 300);
  }
  if (storageUnavailable) {
    setTimeout(() => showToast("This browser is blocking local storage. Changes may not survive a refresh.", "error", { duration: 7000 }), 700);
  }
}

init();
