"use strict";

let tagSuggestionIndex = -1;

function showToast(message, type, options) {
  const settings = options || {};
  const kind = type === "error" || type === "success" ? type : "info";
  const duration = typeof settings.duration === "number" ? settings.duration : 4200;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--toast-duration", duration + "ms");
  toast.setAttribute("role", kind === "error" ? "alert" : "status");
  const iconName = kind === "success" ? "check-circle" : kind === "error" ? "alert" : "info";
  toast.innerHTML =
    '<span class="toast-icon ' + kind + '">' + icon(iconName) + "</span>" +
    '<span class="toast-message">' + esc(message) + "</span>" +
    (settings.action ? '<button class="toast-action">' + esc(settings.action.label) + "</button>" : "") +
    '<button class="toast-close" aria-label="Dismiss notification">' + icon("x") + "</button>";

  let timer = null;
  let remaining = duration;
  let started = Date.now();

  const dismiss = () => {
    clearTimeout(timer);
    if (!toast.isConnected) {
      return;
    }
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 210);
  };

  const startTimer = () => {
    started = Date.now();
    timer = setTimeout(dismiss, remaining);
  };

  toast.addEventListener("mouseenter", () => {
    clearTimeout(timer);
    remaining -= Date.now() - started;
  });
  toast.addEventListener("mouseleave", () => {
    if (remaining > 0) {
      startTimer();
    }
  });
  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  const action = toast.querySelector(".toast-action");
  if (action && settings.action && typeof settings.action.onClick === "function") {
    action.addEventListener("click", () => {
      dismiss();
      settings.action.onClick();
    });
  }

  els.toastRoot.appendChild(toast);
  while (els.toastRoot.children.length > 4) {
    els.toastRoot.firstElementChild.remove();
  }
  startTimer();
  return dismiss;
}

function menuButton(label, iconName, action, attributes, danger) {
  return '<button class="menu-item' + (danger ? " danger" : "") + '" role="menuitem" data-action="' + action + '"' + (attributes || "") + ">" +
    icon(iconName) + "<span>" + esc(label) + "</span></button>";
}

function menuLabel(text) {
  return '<div class="menu-label">' + esc(text) + "</div>";
}

function menuSeparator() {
  return '<div class="menu-sep" role="separator"></div>';
}

function closeMenu() {
  if (state.menu && state.menu.isConnected) {
    state.menu.remove();
  }
  state.menu = null;
  state.menuAnchor = null;
}

function showMenu(anchor, html) {
  closeMenu();
  if (!anchor) {
    return;
  }
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = html;
  els.menuRoot.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = rect.right - width;
  let top = rect.bottom + 6;
  if (left < 8) {
    left = Math.max(8, rect.left);
  }
  if (left + width > window.innerWidth - 8) {
    left = window.innerWidth - width - 8;
  }
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 6);
  }
  menu.style.left = Math.max(8, left) + "px";
  menu.style.top = Math.max(8, top) + "px";
  state.menu = menu;
  state.menuAnchor = anchor;
  menu.addEventListener("click", (event) => {
    if (event.target.closest("[data-action]")) {
      setTimeout(closeMenu, 0);
    }
  });
}

function modalShell(options) {
  return '<div class="modal-panel" role="document">' +
    '<div class="modal-head">' +
    '<div class="modal-heading">' +
    '<h2 class="modal-title" id="modalTitle">' + esc(options.title) + "</h2>" +
    (options.subtitle ? '<p class="modal-sub">' + esc(options.subtitle) + "</p>" : "") +
    "</div>" +
    '<button class="icon-btn modal-close" data-action="modal-close" aria-label="Close dialog" title="Close">' + icon("x") + "</button>" +
    "</div>" +
    '<div class="modal-body">' + options.body + "</div>" +
    (options.footer ? '<div class="modal-foot">' + options.footer + "</div>" : "") +
    "</div>";
}

function openModal(html) {
  els.modal.innerHTML = html;
  if (!els.modal.open) {
    els.modal.showModal();
  }
}

function closeModal() {
  if (els.modal.open) {
    els.modal.close();
  }
  els.modal.innerHTML = "";
  state.modalType = null;
  state.modalEntityId = null;
  state.modalParentId = null;
  state.modalTag = null;
  state.confirmCallback = null;
  state.pendingImport = null;
  state.tagDraft = [];
  tagSuggestionIndex = -1;
}

function openConfirm(options) {
  state.modalType = "confirm";
  state.confirmCallback = options.onConfirm;
  openModal(modalShell({
    title: options.title,
    subtitle: options.subtitle || "",
    body: '<div class="confirm-layout">' +
      '<span class="confirm-icon' + (options.danger ? " danger" : "") + '">' + icon(options.icon || "alert") + "</span>" +
      '<div class="confirm-copy">' + options.message + "</div>" +
      "</div>",
    footer: '<button class="btn btn-secondary" data-action="modal-close">Cancel</button>' +
      '<button class="btn ' + (options.danger ? "btn-danger" : "btn-primary") + '" data-action="confirm-action">' + esc(options.confirmLabel || "Confirm") + "</button>"
  }));
}

function folderOptionsMarkup(selectedId, excludeId) {
  const excluded = new Set();
  if (excludeId) {
    excluded.add(excludeId);
    descendantIds(excludeId).forEach((id) => excluded.add(id));
  }
  const rows = folderRows().filter((row) => !excluded.has(row.folder.id));
  return '<option value="">No folder</option>' + rows.map((row) => {
    const prefix = row.depth ? "— ".repeat(row.depth) : "";
    return '<option value="' + esc(row.folder.id) + '"' + (selectedId === row.folder.id ? " selected" : "") + ">" + esc(prefix + row.folder.name) + "</option>";
  }).join("");
}

function folderColorSwatches(selected) {
  return '<div class="color-swatches">' + FOLDER_COLORS.map((color) =>
    '<label class="color-swatch" title="' + color + '" style="--swatch:' + color + '">' +
    '<input type="radio" name="folderColor" value="' + color + '"' + (selected === color ? " checked" : "") + ">" +
    '<span></span>' + icon("check") +
    "</label>"
  ).join("") + "</div>";
}

function updateUrlPreview() {
  const input = document.getElementById("bookmarkUrl");
  const preview = document.getElementById("urlPreview");
  if (!input || !preview) {
    return;
  }
  const parsed = parseUrl(input.value);
  if (parsed.error) {
    preview.innerHTML = icon("link") + "<div><strong>Link preview</strong><span>Paste a URL to see the domain.</span></div>";
    return;
  }
  const info = domainInfo(parsed.url);
  const title = document.getElementById("bookmarkTitle");
  const letter = avatarLetter(parsed.url, title ? title.value : info.root);
  preview.innerHTML = '<span class="favicon-tile" style="--hue:' + hashHue(info.root) + '" aria-hidden="true">' + esc(letter) + "</span>" +
    "<div><strong>" + esc(info.host) + "</strong><span>" + esc(titleFromDomain(info.host)) + "</span></div>";
}

function openBookmarkModal(bookmarkId, presetFolderId) {
  const bookmark = bookmarkId ? getBookmark(bookmarkId) : null;
  const editing = Boolean(bookmark);
  if (bookmarkId && !bookmark) {
    showToast("That bookmark could not be found.", "error");
    return;
  }
  state.modalType = "bookmark";
  state.modalEntityId = editing ? bookmark.id : null;
  state.modalParentId = editing ? bookmark.folderId : presetFolderId || (state.view.type === "folder" ? state.view.folderId : null);
  state.tagDraft = editing ? bookmark.tags.slice() : [];
  const selectedFolder = state.modalParentId || "";
  const folderSelect = folderOptionsMarkup(selectedFolder, null);
  openModal(modalShell({
    title: editing ? "Edit bookmark" : "Add bookmark",
    subtitle: editing ? "Update the details for this link." : "Save something worth coming back to.",
    body:
      '<form id="bookmarkForm" novalidate>' +
      '<div class="field">' +
      '<label class="field-label" for="bookmarkUrl">URL</label>' +
      '<div class="input-wrap">' + icon("link") +
      '<input class="input" id="bookmarkUrl" name="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com" value="' + esc(editing ? bookmark.url : "") + '" aria-describedby="urlError">' +
      "</div>" +
      '<div class="url-preview" id="urlPreview"></div>' +
      '<p class="field-error" id="urlError" data-error-for="url" hidden></p>' +
      "</div>" +
      '<div class="field">' +
      '<label class="field-label" for="bookmarkTitle">Title <span class="field-hint">optional</span></label>' +
      '<input class="input" id="bookmarkTitle" name="title" type="text" maxlength="200" autocomplete="off" placeholder="A memorable title" value="' + esc(editing ? bookmark.title : "") + '">' +
      "</div>" +
      '<div class="field">' +
      '<label class="field-label" for="bookmarkDescription">Description <span class="field-hint">optional</span></label>' +
      '<textarea class="textarea" id="bookmarkDescription" name="description" maxlength="600" placeholder="Why is this worth saving?">' + esc(editing ? bookmark.description : "") + "</textarea>" +
      "</div>" +
      '<div class="field">' +
      '<label class="field-label" for="bookmarkFolder">Folder</label>' +
      '<select class="select" id="bookmarkFolder" name="folder">' + folderSelect + "</select>" +
      "</div>" +
      '<div class="field">' +
      '<label class="field-label" for="bookmarkTagInput">Tags <span class="field-hint">up to 20</span></label>' +
      '<div class="tag-input" data-tag-input>' +
      '<div class="tag-chips" data-tag-chips></div>' +
      '<input class="tag-input-field" id="bookmarkTagInput" type="text" autocomplete="off" spellcheck="false" placeholder="Add a tag, press Enter">' +
      '<div class="tag-suggestions" data-tag-suggestions hidden></div>' +
      "</div>" +
      '<p class="field-help">Use tags to connect bookmarks across folders.</p>' +
      "</div>" +
      "</form>",
    footer:
      (editing ? '<button class="btn btn-secondary btn-danger-text" data-action="delete-bookmark" data-bookmark-id="' + esc(bookmark.id) + '">' + icon("trash") + "Move to trash</button>" : "") +
      '<span class="spacer"></span>' +
      '<button class="btn btn-secondary" data-action="modal-close">Cancel</button>' +
      '<button class="btn btn-primary" type="submit" form="bookmarkForm">' + (editing ? "Save changes" : "Add bookmark") + "</button>"
  }));
  setupTagInput();
  updateUrlPreview();
  const urlInput = document.getElementById("bookmarkUrl");
  const titleInput = document.getElementById("bookmarkTitle");
  if (urlInput) {
    urlInput.addEventListener("input", () => {
      clearFieldError("url");
      updateUrlPreview();
    });
    urlInput.addEventListener("blur", () => {
      const parsed = parseUrl(urlInput.value);
      if (!parsed.error) {
        const current = urlInput.value.trim();
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(current)) {
          urlInput.value = parsed.url;
        }
        updateUrlPreview();
      }
    });
  }
  if (titleInput) {
    titleInput.addEventListener("input", updateUrlPreview);
  }
  setTimeout(() => {
    if (urlInput) {
      urlInput.focus();
      if (editing) {
        urlInput.select();
      }
    }
  }, 40);
}

function clearFieldError(name) {
  const error = document.querySelector('[data-error-for="' + name + '"]');
  const input = document.getElementById(name === "url" ? "bookmarkUrl" : name === "folderName" ? "folderName" : name === "tagName" ? "tagName" : name);
  if (error) {
    error.hidden = true;
    error.innerHTML = "";
  }
  if (input) {
    input.removeAttribute("aria-invalid");
  }
}

function setFieldError(name, message) {
  const error = document.querySelector('[data-error-for="' + name + '"]');
  const input = document.getElementById(name === "url" ? "bookmarkUrl" : name === "folderName" ? "folderName" : name === "tagName" ? "tagName" : name);
  if (error) {
    error.hidden = false;
    error.innerHTML = icon("alert") + "<span>" + esc(message) + "</span>";
  }
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
}

function setupTagInput() {
  const container = document.querySelector("[data-tag-input]");
  const input = document.getElementById("bookmarkTagInput");
  if (!container || !input) {
    return;
  }
  const suggestions = container.querySelector("[data-tag-suggestions]");

  const addTag = (raw) => {
    const tag = normalizeTag(raw);
    if (!tag) {
      return false;
    }
    if (state.tagDraft.indexOf(tag) !== -1) {
      return false;
    }
    if (state.tagDraft.length >= 20) {
      showToast("You can add up to 20 tags per bookmark.", "error");
      return false;
    }
    state.tagDraft.push(tag);
    renderTagDraft();
    return true;
  };

  const renderSuggestions = () => {
    const query = normalizeTag(input.value);
    const options = tagsWithCounts(activeBookmarks(), "count")
      .filter((entry) => state.tagDraft.indexOf(entry.tag) === -1)
      .filter((entry) => !query || entry.tag.indexOf(query) !== -1)
      .slice(0, 6);
    tagSuggestionIndex = options.length ? 0 : -1;
    if (!options.length) {
      suggestions.hidden = true;
      suggestions.innerHTML = "";
      return;
    }
    suggestions.hidden = false;
    suggestions.innerHTML = options.map((entry, index) =>
      '<button type="button" class="tag-suggestion' + (index === tagSuggestionIndex ? " active" : "") + '" data-tag-suggest="' + esc(entry.tag) + '">' +
      icon("hash") + "<span>#" + esc(entry.tag) + "</span>" +
      '<span class="menu-hint">' + entry.count + "</span></button>"
    ).join("");
  };

  const renderTagDraft = () => {
    const chips = container.querySelector("[data-tag-chips]");
    chips.innerHTML = state.tagDraft.map((tag) =>
      '<span class="tag-input-chip"><span>#' + esc(tag) + '</span><button type="button" data-tag-remove="' + esc(tag) + '" aria-label="Remove tag #' + esc(tag) + '">' + icon("x") + "</button></span>"
    ).join("");
    renderSuggestions();
  };

  input.addEventListener("input", renderSuggestions);
  input.addEventListener("focus", renderSuggestions);
  input.addEventListener("keydown", (event) => {
    const suggestionButtons = $$("[data-tag-suggest]", suggestions);
    if (event.key === "ArrowDown" && !suggestions.hidden) {
      event.preventDefault();
      tagSuggestionIndex = Math.min(tagSuggestionIndex + 1, suggestionButtons.length - 1);
      suggestionButtons.forEach((button, index) => button.classList.toggle("active", index === tagSuggestionIndex));
      return;
    }
    if (event.key === "ArrowUp" && !suggestions.hidden) {
      event.preventDefault();
      tagSuggestionIndex = Math.max(tagSuggestionIndex - 1, 0);
      suggestionButtons.forEach((button, index) => button.classList.toggle("active", index === tagSuggestionIndex));
      return;
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (!suggestions.hidden && tagSuggestionIndex >= 0 && suggestionButtons[tagSuggestionIndex]) {
        addTag(suggestionButtons[tagSuggestionIndex].dataset.tagSuggest);
      } else {
        addTag(input.value);
      }
      input.value = "";
      renderSuggestions();
      return;
    }
    if (event.key === "Backspace" && !input.value && state.tagDraft.length) {
      state.tagDraft.pop();
      renderTagDraft();
      return;
    }
    if (event.key === "Escape" && !suggestions.hidden) {
      event.stopPropagation();
      suggestions.hidden = true;
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!container.contains(document.activeElement)) {
        suggestions.hidden = true;
      }
    }, 120);
  });
  container.addEventListener("mousedown", (event) => {
    if (event.target.closest("[data-tag-suggest]")) {
      event.preventDefault();
    }
    if (!event.target.closest("button") && event.target !== input) {
      input.focus();
    }
  });
  container.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-tag-suggest]");
    if (suggestion) {
      addTag(suggestion.dataset.tagSuggest);
      input.value = "";
      input.focus();
      renderSuggestions();
      return;
    }
    const remove = event.target.closest("[data-tag-remove]");
    if (remove) {
      state.tagDraft = state.tagDraft.filter((tag) => tag !== remove.dataset.tagRemove);
      renderTagDraft();
      input.focus();
    }
  });
  renderTagDraft();
}

function getTagDraft() {
  const input = document.getElementById("bookmarkTagInput");
  if (input && input.value.trim()) {
    const tag = normalizeTag(input.value);
    if (tag && state.tagDraft.indexOf(tag) === -1 && state.tagDraft.length < 20) {
      state.tagDraft.push(tag);
    }
    input.value = "";
  }
  return state.tagDraft.slice();
}

function openFolderModal(folderId, presetParentId) {
  const folder = folderId ? getFolder(folderId) : null;
  const editing = Boolean(folder);
  if (folderId && !folder) {
    showToast("That folder could not be found.", "error");
    return;
  }
  state.modalType = "folder";
  state.modalEntityId = editing ? folder.id : null;
  state.modalParentId = editing ? folder.parentId : presetParentId || (state.view.type === "folder" ? state.view.folderId : null);
  const parentId = state.modalParentId || "";
  const color = editing ? folder.color : FOLDER_COLORS[state.data.folders.length % FOLDER_COLORS.length];
  openModal(modalShell({
    title: editing ? "Edit folder" : "New folder",
    subtitle: editing ? "Rename or move this folder." : "Give related bookmarks a place to live.",
    body:
      '<form id="folderForm" novalidate>' +
      '<div class="field">' +
      '<label class="field-label" for="folderName">Folder name</label>' +
      '<input class="input" id="folderName" name="name" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Design inspiration" value="' + esc(editing ? folder.name : "") + '">' +
      '<p class="field-error" data-error-for="folderName" hidden></p>' +
      "</div>" +
      '<div class="field">' +
      '<label class="field-label" for="folderParent">Parent folder</label>' +
      '<select class="select" id="folderParent" name="parent">' + folderOptionsMarkup(parentId, editing ? folder.id : null) + "</select>" +
      "</div>" +
      '<div class="field">' +
      '<span class="field-label">Color</span>' +
      folderColorSwatches(color) +
      "</div>" +
      "</form>",
    footer:
      '<button class="btn btn-secondary" data-action="modal-close">Cancel</button>' +
      '<button class="btn btn-primary" type="submit" form="folderForm">' + (editing ? "Save changes" : "Create folder") + "</button>"
  }));
  const nameInput = document.getElementById("folderName");
  if (nameInput) {
    nameInput.addEventListener("input", () => clearFieldError("folderName"));
    setTimeout(() => nameInput.focus(), 40);
  }
}

function openMoveModal(bookmarkId) {
  const bookmark = getBookmark(bookmarkId);
  if (!bookmark) {
    showToast("That bookmark could not be found.", "error");
    return;
  }
  state.modalType = "move";
  state.modalEntityId = bookmark.id;
  const rows = folderRows();
  const choices = '<button class="folder-choice' + (!bookmark.folderId ? " current" : "") + '" data-action="move-to-folder" data-bookmark-id="' + esc(bookmark.id) + '" data-folder-id="">' +
    '<span class="folder-dot" style="background:var(--text-tertiary)"></span><span>No folder</span>' +
    (!bookmark.folderId ? icon("check", "check") : "") +
    '<span class="choice-count">' + activeBookmarks().filter((item) => !item.folderId).length + "</span></button>" +
    rows.map((row) => {
      const folder = row.folder;
      const current = bookmark.folderId === folder.id;
      return '<button class="folder-choice' + (current ? " current" : "") + '" data-action="move-to-folder" data-bookmark-id="' + esc(bookmark.id) + '" data-folder-id="' + esc(folder.id) + '">' +
        (row.depth ? '<span style="width:' + (row.depth * 13) + 'px;flex:none"></span>' : "") +
        '<span class="folder-dot" style="background:' + esc(folder.color) + '"></span><span>' + esc(folder.name) + "</span>" +
        (current ? icon("check", "check") : "") +
        '<span class="choice-count">' + directCount(folder.id) + "</span></button>";
    }).join("");
  openModal(modalShell({
    title: "Move bookmark",
    subtitle: bookmark.title || titleFromDomain(domainInfo(bookmark.url).host),
    body: '<div class="move-list">' + choices + "</div>",
    footer: '<span class="spacer"></span><button class="btn btn-secondary" data-action="modal-close">Cancel</button>'
  }));
}

function openTagRenameModal(tag) {
  const exists = tagsWithCounts(activeBookmarks(), "alpha").some((entry) => entry.tag === tag);
  if (!exists) {
    showToast("That tag no longer exists.", "error");
    return;
  }
  state.modalType = "rename-tag";
  state.modalTag = tag;
  openModal(modalShell({
    title: "Rename tag",
    subtitle: "Every bookmark with this tag will be updated.",
    body:
      '<form id="tagRenameForm" novalidate>' +
      '<div class="field">' +
      '<label class="field-label" for="tagName">Tag name</label>' +
      '<div class="input-wrap">' + icon("hash") +
      '<input class="input" id="tagName" name="name" type="text" maxlength="30" autocomplete="off" value="' + esc(tag) + '">' +
      "</div>" +
      '<p class="field-error" data-error-for="tagName" hidden></p>' +
      "</div>" +
      "</form>",
    footer:
      '<span class="spacer"></span>' +
      '<button class="btn btn-secondary" data-action="modal-close">Cancel</button>' +
      '<button class="btn btn-primary" type="submit" form="tagRenameForm">Rename tag</button>'
  }));
  const input = document.getElementById("tagName");
  if (input) {
    input.addEventListener("input", () => clearFieldError("tagName"));
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  }
}

function openImportModal(parsed, fileName) {
  const bookmarks = parsed.bookmarks.length;
  const folders = parsed.folders.length;
  const oldBookmarks = state.data.bookmarks.length;
  const oldFolders = state.data.folders.length;
  state.modalType = "import";
  state.pendingImport = { data: parsed, fileName: fileName };
  openModal(modalShell({
    title: "Import bookmarks",
    subtitle: "Review this backup before adding it to your library.",
    body:
      '<div class="summary-box">' +
      '<div class="summary-item"><strong>' + bookmarks + "</strong><span>" + plural(bookmarks, "bookmark") + " in backup</span></div>" +
      '<div class="summary-item"><strong>' + folders + "</strong><span>" + plural(folders, "folder") + " in backup</span></div>" +
      '<div class="summary-item"><strong>' + oldBookmarks + "</strong><span>current bookmarks</span></div>" +
      '<div class="summary-item"><strong>' + oldFolders + "</strong><span>current folders</span></div>" +
      "</div>" +
      '<p class="import-note"><strong>Merge</strong> keeps your current library and adds the backup. Duplicate links are skipped. <strong>Replace</strong> overwrites everything currently stored.</p>',
    footer:
      '<button class="btn btn-secondary" data-action="modal-close">Cancel</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-secondary" data-action="import-replace">Replace library</button>' +
      '<button class="btn btn-primary" data-action="import-merge">Merge backup</button>'
  }));
}
