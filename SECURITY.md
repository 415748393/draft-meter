# Security

## Scope

Draft meter runs inside the DSH Web GUI as a Client-side bundle. It has no Host
half, opens no network connection, and stores nothing.

- **What it reads:** the live text of the composer draft, through the slot's
  standard `useInput` seat. That is the same string the composer itself displays.
- **What it writes:** one `<style>` element (removed when the plugin is
  disabled), and a panel element portalled to `document.body` while it is open.
  It never writes into the draft.
- **What it sends:** nothing. There is no `fetch`, no `XMLHttpRequest`, no
  WebSocket, no `sendBeacon` in the bundle.
- **Storage:** none. No `localStorage`, no cookies, no IndexedDB.

Because the draft is user-typed content, the plugin treats it strictly as an
opaque string: it counts characters and renders numbers. Draft text is never
inserted into the DOM as markup, so a draft containing HTML stays text.

## Verifying that

The claims above are checked mechanically, not just asserted:

```sh
node test/run.mjs
```

`test/client.test.mjs` fails if the bundle requests any module other than
`react`/`react-dom`, and the package suite fails on a `@deepseek-ai/` dependency.
To check the network and storage claims yourself:

```sh
grep -nE "fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie" client.js
```

It should print nothing. `grep -n "innerHTML\|insertAdjacentHTML" client.js`
should print nothing either — the reading is built from elements, never markup.

## Reporting

If you find a way to make this plugin leak draft text, escape its panel, or
interfere with the composer, please open a regular issue describing the impact.
This is a small, single-file, no-network plugin; there is no embargo process to
run, and a public issue is the fastest route to a fix.
