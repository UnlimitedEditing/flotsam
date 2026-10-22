# Result viewers: how a file becomes a screen

A result file (decoded from a barcoded image, or kept in the library) opens in the viewer for what it **is**, not for what the workflow was declared to return. This page is how that works and how to add a new kind (an interactive graph, a project's file contents, a form of instructions...).

## The three pieces

| Piece          | File                                       | Job                                                                                                                                           |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| The table      | `src/results/viewerTable.ts`               | One entry per kind: `kind`, `title`, button wording `open`, and how to recognise it (`formats`, `extensions`, `magic`). Plain data, no React. |
| Identification | `src/m3ds/registry.ts` (`identifyPayload`) | Reads the first bytes: a known JSON `format`, then a binary signature, then the file name, then the declared type. Derived from the table.    |
| The viewers    | `src/results/registry.ts`                  | `kind` -> a lazy import of the component. A kind with no entry opens in `FileInfo`. `ResultPanel` calls `renderViewer(kind, props)`.          |

## Adding a viewer

1. **Name the format.** New JSON kinds start with `{"format": "<namespace>.<name>", ...}`. Pick the namespace of whatever produces it.
2. **Add the kind to `viewerTable.ts`**: `{ kind: 'graph', title: 'Graph', open: 'Open graph', formats: ['myns.graph'] }`. Binary kinds use `extensions` or `magic`.
3. **Write the component** `src/results/viewers/GraphViewer.tsx`: a default export taking `ViewerProps` (`filename`, `data: Uint8Array`, optional `host`). Validate the bytes yourself and show a clear error for a bad file (the viewer table only looks at the first 4 KB).
4. **Register it** with one line in `src/results/registry.ts` (`graph: () => import('./viewers/GraphViewer')`). It then loads only when a result of that kind is opened.
5. **Library:** a kind with no entry in `src/library/save.ts` (`KIND_OF`) is kept as a plain file. Add an entry (and a label and icon in the same file) if it should show as its own kind.
6. **Tests:** `src/results/registry.test.ts` already checks that every format in the table identifies as its kind; add a viewer test for the validation in step 3.

`ViewerHost` (`viewers/types.ts`) is what a viewer may ask of the app without importing it: `title`, `close()`, and `saveToLibrary()` when the panel was given one. Nothing sends instructions back to the app yet; add that when the first real viewer needs it, and specify it with that viewer.

## Embedding a self-contained web tool (the `frame` mode)

For a tool that already exists as a web page (the Groove Box score player), do not port it: vendor our own copy under `public/viewers/<name>/` and embed it in a **sandboxed same-origin iframe** (`sandbox="allow-scripts allow-same-origin"`, `src` always our own path, never a remote URL). A small bridge script in the page speaks the messages in `src/results/frame/bridge.ts`:

```
frame -> app   { type: 'hello' }                       bridge installed
app   -> frame { type: 'load', filename, bytes }       the decoded file (an ArrayBuffer copy)
frame -> app   { type: 'loaded' } | { type: 'error', message }
frame -> app   { type: 'save', filename, bytes }       the user wants to keep an edited copy
```

The app only accepts a message from that frame's own window at its own origin, with the expected shape and size (`parseFrameMessage`). Vendored scripts must be local (no CDN tags: the app loads no third-party scripts) and big assets must stay out of the install precache (`globIgnores` in `vite.config.ts`), so they are fetched only when the tool is opened.

## Unknown and future kinds

A file whose kind is unknown (or has no viewer) shows its size and first bytes with a Save button, so nothing is ever hidden or misread. A workflow's declared type that disagrees with the file produces a one-line note, not a wrong viewer.
