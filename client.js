// Draft meter — a composer-dock reading of what the user is currently writing.
//
// The Conversation client already publishes the live draft (`InputState.draft`)
// to every session-scoped slot, so this package needs no Host service and no
// projection: it formats that string and renders one ambient line under the
// composer, expanding on click into a small measurement panel.

window.__ModuleLoader__.load({
  id: '@local/draft-meter',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');

    const h = React.createElement;
    const NS = 'draft-meter';
    const ENTRY_ID = 'draft-meter';
    const SLOT = 'conversation.composer.dock';
    const PANEL_WIDTH = 272;
    const VIEWPORT_MARGIN = 12;
    const ANCHOR_GAP = 8;

    // Token weight is a heuristic, not a tokenizer: BPE vocabularies spend well
    // under one token per Han/kana/Hangul character, and roughly one token per
    // 3.5 Latin characters. The panel labels the result as an estimate.
    const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;
    const LATIN_WORD = /[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g;
    const CJK_TOKENS = 0.7;
    const LATIN_CHARS_PER_TOKEN = 3.5;
    const NUMBER = new Intl.NumberFormat();

    const CSS = `
.dsh-draft-meter { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: min(100%, 28rem); }
.dsh-draft-meter__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  font-variant-numeric: tabular-nums;
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  white-space: nowrap;
  cursor: pointer;
  overflow: hidden;
}
.dsh-draft-meter__trigger[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
@media (hover: hover) {
  .dsh-draft-meter__trigger:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
.dsh-draft-meter__glyph { flex: none; display: block; }
.dsh-draft-meter__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-draft-meter__sep { margin: 0 6px; color: var(--dsw-alias-label-caption); }
.dsh-draft-meter__panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  width: min(${PANEL_WIDTH}px, calc(100vw - 24px));
  padding: 12px;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  cursor: default;
  overflow-x: hidden;
  overflow-y: auto;
  outline: none;
}
.dsh-draft-meter__panel:focus-visible { box-shadow: var(--dsw-elevation-prominent), 0 0 0 2px var(--dsw-alias-border-l2); }
.dsh-draft-meter__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dsh-draft-meter__titleValue {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
}
.dsh-draft-meter__rule {
  margin-bottom: 6px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-draft-meter__rows { margin: 0; }
.dsh-draft-meter__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 1px 0;
}
.dsh-draft-meter__row dt { min-width: 0; color: var(--dsw-alias-label-secondary); }
.dsh-draft-meter__row dd {
  margin: 0;
  flex: none;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dsh-draft-meter__note {
  margin-top: 8px;
  color: var(--dsw-alias-label-tertiary);
}
`;

    const zh = {
      'a11y': '草稿统计',
      'carrier': '草稿',
      'chars.one': '{count} 字',
      'chars.other': '{count} 字',
      'tokens.one': '{count} token',
      'tokens.other': '{count} token',
      'approx': '≈{value}',
      'title': '草稿统计',
      'row.charsNoSpace': '字符（不含空格）',
      'row.words': '单词',
      'row.cjk': 'CJK 字符',
      'row.lines': '行数',
      'note': 'token 数按字符类型粗估，仅供参考。',
    };

    const en = {
      'a11y': 'Draft statistics',
      'carrier': 'draft',
      'chars.one': '{count} char',
      'chars.other': '{count} chars',
      'tokens.one': '{count} token',
      'tokens.other': '{count} tokens',
      'approx': '≈{value}',
      'title': 'Draft statistics',
      'row.charsNoSpace': 'Characters (no spaces)',
      'row.words': 'Words',
      'row.cjk': 'CJK characters',
      'row.lines': 'Lines',
      'note': 'A rough per-character estimate, for orientation only.',
    };

    /** English and Chinese both split on one/other; other languages fall back to en. */
    function pluralKey(count) {
      return count === 1 ? 'one' : 'other';
    }

    /**
     * Measure one draft string. Any non-empty draft is measured — including a
     * lone space — so the reading never flickers in and out while typing.
     *
     * Counting walks code points (not UTF-16 units) so emoji and astral CJK
     * count once. The result is memoized on the text itself: the component also
     * re-renders for reasons unrelated to the text (open state, placement), and
     * re-scanning a long paste for those is wasted work.
     */
    let cachedText = null;
    let cachedReading = null;

    function measure(draft) {
      const text = typeof draft === 'string' ? draft : '';
      if (text.length === 0) return null;
      if (text === cachedText) return cachedReading;
      let chars = 0;
      let cjk = 0;
      let charsNoSpace = 0;
      for (const point of text) {
        chars += 1;
        if (CJK.test(point)) cjk += 1;
        if (!/\s/.test(point)) charsNoSpace += 1;
      }
      const words = (text.match(LATIN_WORD) || []).length;
      const lines = text.split(/\r\n|\r|\n/).length;
      const other = Math.max(0, chars - cjk);
      const tokens = Math.max(1, Math.round(cjk * CJK_TOKENS + other / LATIN_CHARS_PER_TOKEN));
      const reading = { chars, charsNoSpace, words, cjk, lines, tokens };
      cachedText = text;
      cachedReading = reading;
      return reading;
    }

    /**
     * Open state plus the trigger-anchored placement for the measurement panel.
     * The panel is portaled to the body, so it positions itself from the trigger
     * rectangle instead of relying on the composer as containing block.
     *
     * The dock row is centred, so the trigger slides sideways whenever the
     * reading changes width; `place` therefore runs again on every render and
     * on trigger resize, and bails out when nothing moved.
     */
    function useDraftPanel() {
      const [open, setOpen] = React.useState(false);
      const [placement, setPlacement] = React.useState(null);
      const [enterPanel, setEnterPanel] = React.useState(false);
      const rootRef = React.useRef(null);
      const triggerRef = React.useRef(null);
      const panelRef = React.useRef(null);

      const place = React.useCallback(() => {
        const root = rootRef.current;
        if (root === null || typeof window === 'undefined') return;
        const rect = root.getBoundingClientRect();
        const width = panelRef.current === null ? PANEL_WIDTH : panelRef.current.offsetWidth;
        const room = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
        const next = {
          left: Math.min(Math.max(rect.left, VIEWPORT_MARGIN), room),
          bottom: Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.top + ANCHOR_GAP),
          maxHeight: Math.max(120, rect.top - ANCHOR_GAP - VIEWPORT_MARGIN),
        };
        setPlacement((current) => (
          current !== null
            && current.left === next.left
            && current.bottom === next.bottom
            && current.maxHeight === next.maxHeight
            ? current
            : next
        ));
      }, []);

      React.useLayoutEffect(() => {
        if (!open) return;
        place();
        // Only a keyboard activation moves focus into the panel; a mouse
        // activation deliberately leaves the caret in the editor, so there is
        // nothing to blur here.
        if (enterPanel && panelRef.current !== null) panelRef.current.focus();
      }, [open, enterPanel, place]);

      // Re-place on any render: the reading text (and therefore the trigger's
      // width) changes with every keystroke while the panel is open.
      React.useLayoutEffect(() => {
        if (open) place();
      });

      React.useEffect(() => {
        if (!open) return undefined;
        const follow = () => place();
        window.addEventListener('resize', follow);
        window.addEventListener('scroll', follow, true);
        const root = rootRef.current;
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow);
        if (observer !== null && root !== null) observer.observe(root);
        return () => {
          window.removeEventListener('resize', follow);
          window.removeEventListener('scroll', follow, true);
          if (observer !== null) observer.disconnect();
        };
      }, [open, place]);

      React.useEffect(() => {
        if (!open) return undefined;
        const inside = (target) => {
          if (!(target instanceof Node)) return false;
          return (rootRef.current !== null && rootRef.current.contains(target))
            || (panelRef.current !== null && panelRef.current.contains(target));
        };
        const close = () => setOpen(false);
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          // Consume Escape only when the panel itself owns focus, so the
          // composer keeps its own Escape handling when the editor has the
          // caret. A mouse-opened panel still closes, just without swallowing
          // the key from the editor underneath.
          const active = event.target;
          const inPanel = panelRef.current !== null && active instanceof Node && panelRef.current.contains(active);
          const onTrigger = triggerRef.current !== null && active === triggerRef.current;
          if (inPanel || onTrigger) {
            event.preventDefault();
            event.stopPropagation();
            close();
            if (triggerRef.current !== null) triggerRef.current.focus();
            return;
          }
          close();
        };
        const onPointerDown = (event) => {
          if (!inside(event.target)) close();
        };
        const onClick = (event) => {
          if (!inside(event.target)) close();
        };
        // A panel opened with the mouse leaves focus in the editor, so the only
        // way to reach it is to tab out of the way — treat losing focus to
        // anywhere outside the pair as a dismissal.
        const onFocusOut = (event) => {
          const next = event.relatedTarget;
          if (next === null || !inside(next)) close();
        };
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('focusout', onFocusOut, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown, true);
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('click', onClick, true);
          document.removeEventListener('focusout', onFocusOut, true);
        };
      }, [open]);

      return { open, setOpen, setEnterPanel, rootRef, triggerRef, panelRef, placement };
    }

    function Panel({ t, reading, placement, panelRef, panelId }) {
      const rows = [{ key: 'row.lines', value: reading.lines }];
      rows.push({ key: 'row.charsNoSpace', value: reading.charsNoSpace });
      if (reading.words > 0) rows.push({ key: 'row.words', value: reading.words });
      if (reading.cjk > 0) rows.push({ key: 'row.cjk', value: reading.cjk });

      return h('div', {
        ref: panelRef,
        id: panelId,
        className: 'dsh-draft-meter__panel',
        role: 'dialog',
        tabIndex: -1,
        'aria-label': t('title'),
        style: {
          left: placement === null ? 0 : placement.left,
          bottom: placement === null ? 0 : placement.bottom,
          maxHeight: placement === null ? undefined : placement.maxHeight,
          visibility: placement === null ? 'hidden' : undefined,
        },
      },
      h('div', { className: 'dsh-draft-meter__title' },
        h('span', null, t('title')),
        h('span', { className: 'dsh-draft-meter__titleValue' },
          t('approx', {
            value: t(`tokens.${pluralKey(reading.tokens)}`, { count: NUMBER.format(reading.tokens) }),
          }))),
      h('div', { className: 'dsh-draft-meter__rule' }),
      h('dl', { className: 'dsh-draft-meter__rows' },
        rows.map(row => h('div', { className: 'dsh-draft-meter__row', key: row.key },
          h('dt', null, t(row.key)),
          h('dd', null, NUMBER.format(row.value))))),
      h('div', { className: 'dsh-draft-meter__note' }, t('note')));
    }

    /**
     * The three ascending bars are drawn with `currentColor` so the glyph
     * inherits the trigger's theme colour instead of hard-coding a hex value.
     */
    function Glyph() {
      return h('svg', {
        className: 'dsh-draft-meter__glyph',
        viewBox: '0 0 14 14',
        width: 14,
        height: 14,
        fill: 'currentColor',
        'aria-hidden': true,
        focusable: 'false',
      },
      h('rect', { x: 1.5, y: 7.5, width: 3, height: 5, rx: 1, opacity: 0.55 }),
      h('rect', { x: 5.5, y: 4.5, width: 3, height: 8, rx: 1, opacity: 0.8 }),
      h('rect', { x: 9.5, y: 1.5, width: 3, height: 11, rx: 1 }));
    }

    /** Renders one ambient reading of the draft the user is writing. */
    function DraftMeterView(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const draft = props.useInput((state) => state.draft);
      const reading = React.useMemo(() => measure(draft), [draft]);
      const { open, setOpen, setEnterPanel, rootRef, triggerRef, panelRef, placement } = useDraftPanel();
      const panelId = `dsh-draft-meter-panel-${React.useId().replaceAll(':', '')}`;

      if (reading === null) return null;

      const charsText = t(`chars.${pluralKey(reading.chars)}`, { count: NUMBER.format(reading.chars) });
      const tokensText = t(`tokens.${pluralKey(reading.tokens)}`, { count: NUMBER.format(reading.tokens) });
      const approxText = t('approx', { value: tokensText });
      // The separator is punctuation, not copy: composing it here keeps the
      // dictionaries free of a whole-sentence template that has to be
      // re-translated every time a reading changes.
      const readingText = `${t('carrier')} ${charsText} · ${approxText}`;

      return h(React.Fragment, null,
        h('span', { className: 'dsh-draft-meter', ref: rootRef },
          h('button', {
            type: 'button',
            ref: triggerRef,
            className: 'dsh-draft-meter__trigger',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-controls': open ? panelId : undefined,
            'aria-label': `${t('a11y')}: ${readingText}`,
            title: t('a11y'),
            onMouseDown: (event) => {
              // Keep the editor's caret (and any IME composition) alive: only a
              // keyboard activation moves focus into the panel.
              event.preventDefault();
            },
            onClick: (event) => {
              const next = !open;
              setEnterPanel(next && event.detail === 0);
              setOpen(next);
            },
          },
          h(Glyph),
          h('span', { className: 'dsh-draft-meter__label' },
            h('span', { className: 'dsh-draft-meter__carrier' }, t('carrier')),
            ' ',
            charsText,
            h('span', { className: 'dsh-draft-meter__sep', 'aria-hidden': true }, '·'),
            approxText))),
        open
          ? createPortal(
            h(Panel, { t, reading, placement, panelRef, panelId }),
            document.body,
          )
          : null);
    }

    /** Guards the draft hook: the wrapper must not call it conditionally. */
    function DraftMeter(props) {
      if (typeof props.useInput !== 'function') return null;
      return h(DraftMeterView, props);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'draft-meter: dictionaries');
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.dshPlugin = ENTRY_ID;
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => {
            style.remove();
          };
        }, 'draft-meter: styles');
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ENTRY_ID,
          order: 2,
          locale: NS,
        }, DraftMeter));
      },
    };
  },
});
