# Contributing

Small plugin, small surface. The rules below are the ones that keep it from
breaking other people's composers.

## Before you change anything

```sh
node test/run.mjs
```

It needs nothing but a `node` (18+) — no install step, no dependencies. It
should print `RESULT: PASS (129 checks)`.

## The constraints that are not negotiable

These come from how DSH loads bundles and from what the composer row can
survive. Breaking one of them produces a plugin that looks fine in isolation and
misbehaves in the real interface.

- **One 20px line.** The reading lives in the composer dock, which reserves a
  22px row. Anything taller pushes the composer down. Panels belong in a portal.
- **Render nothing for an empty draft.** Returning `null` is what keeps the
  dock from reserving space for a plugin with nothing to say.
- **Theme tokens only.** No literal colours in CSS; the palette changes with the
  theme, and `--dsw-alias-*` is how you follow it. Literal colours are fine
  inside `icon.svg`/`preview.svg` artwork.
- **No Harness package imports.** Only `react` and `react-dom` are baseline
  modules. Importing `@deepseek-ai/dsh-client-ui-primitives` works in the repo
  and fails for anyone who installs the bundle.
- **Both `en` and `zh`.** They are baseline locales; a missing one renders raw
  keys.
- **Effects are disposable.** Anything registered in `apply()` goes through
  `ctx.effect` and returns a cleanup, so disabling the plugin leaves no styles
  or listeners behind.
- **Don't touch the draft.** The plugin reads `InputState.draft`. It must never
  call `setDraft`, `persistDraft` or `submit` — those belong to the user.
- **Accessibility is part of the feature.** Anything reachable by mouse must be
  reachable by keyboard, and dismissal must not steal keys from the editor.

## Adding a check

Every behaviour you fix should come with an assertion in
`test/client.test.mjs` (rendering/activation) or `test/package.test.mjs`
(package shape). The stubs in `test/client.test.mjs` expand function components
and run effects inline on purpose — that is what lets the suite assert that
listeners exist at all, so keep new stubs consistent with that choice.

If a check cannot be written without a browser, say so in the pull request
instead of writing a check that only appears to test it.

## Numbers

The token estimate is a heuristic: `0.7` per CJK character plus one per `3.5`
remaining characters. It is deliberately not a tokenizer. If you change it,
change the panel's wording too — the `≈` and the note are load-bearing.

## Style

Plain ES modules, no build step, no dependencies. Prefer a named constant over a
repeated literal, and keep `client.js` readable as the file people will read
first.
