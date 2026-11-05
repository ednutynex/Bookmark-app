# Stash

Stash is a private, single-user bookmark manager that runs entirely in the browser. It has no backend, no accounts, and no external services. Bookmarks, folders, tags, and preferences are stored locally in the browser using `localStorage`.

## Features

- Add, edit, favorite, search, and delete bookmarks
- Nested folders with drag-and-drop organization
- Tags with filtering, renaming, and merging
- Grid and list layouts
- Recently added, favorites, tags, and trash views
- Undo for destructive actions
- JSON backup import/export and standalone HTML export
- Light and dark themes
- Responsive desktop and mobile layout

## Requirements

- A modern browser with JavaScript enabled
- No build step, package installation, or backend is required
- Python or Node.js is optional, only needed if you want to run a local static server

## Setup

1. Download or clone this repository.
2. Open a terminal in the project directory.
3. Start a local static server:

   ```powershell
   python -m http.server 8080
   ```

   If Python is not installed, use Node.js:

   ```powershell
   npx serve .
   ```

4. Open `http://localhost:8080` in your browser.

You can also open `index.html` directly. A local server is recommended because some browsers restrict `localStorage` on `file://` URLs.

## Environment Variables

None. Stash is fully client-side and does not read environment variables. The included `.env.example` intentionally contains no values.

## Data and Privacy

- All data stays in your browser.
- The primary storage key is `stash.bookmarks.v1`.
- Clearing browser site data will erase your library, so export a JSON backup before clearing site data or switching browsers.
- Use the sidebar **Export** and **Import** buttons to move your library between browsers.

## Project Structure

```text
Bookmark-app/
├── index.html
├── styles.css
├── js/
│   ├── core.js       Data model, storage, utilities, seed data
│   ├── render.js     Rendering and view state
│   ├── ui.js         Modals, menus, toasts, form widgets
│   └── app.js        Events, actions, import/export, initialization
├── .env.example
├── .gitignore
└── README.md
```

## Browser Support

Stash targets current versions of Chrome, Edge, Firefox, and Safari. Features such as `<dialog>`, `structuredClone`, and CSS `:has()` are used; very old browsers are not supported.

## Testing

There is no packaged test suite or build pipeline. The app can be checked manually by opening it in a browser and exercising the main flows: add/edit/delete, search, folders, tags, drag-and-drop, theme switching, import/export, and reload persistence.
