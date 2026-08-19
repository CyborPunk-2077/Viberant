/**
 * Binding an action to a thing on screen, once.
 *
 * Its own file because it is the whole of a fault that reached somebody, and a
 * fault that reached somebody deserves to be provable without a browser.
 *
 * **What went wrong.** Writing the page is skipped when the page would come out
 * exactly as it already is — a real saving, because most redraws have nothing
 * new to say. But every screen writes its page and then binds what is on it,
 * and that second half only ever worked because the first half threw the old
 * elements away. Once identical pages stopped being written, the elements
 * survived and the binding pass ran over them again. `onclick` overwrites and
 * was unharmed. `addEventListener` adds, so one press of *Open on GitHub*
 * opened one browser tab per redraw: four, then twelve.
 *
 * **The rule.** For one element and one kind of event there is exactly one
 * handler — the one bound last. A screen may be drawn a hundred times and one
 * press is still one errand.
 */

/**
 * @param {EventTarget|null} el
 * @param {string} type
 * @param {Function} fn
 * @param {object|boolean} [options]
 */
export function bindTo(el, type, fn, options) {
  if (!el) return null;
  const bound = el.__bound ?? (el.__bound = new Map());
  const before = bound.get(type);
  // Taken off with the very options it went on with, or it does not come off.
  if (before) el.removeEventListener(type, before.fn, before.options);
  bound.set(type, { fn, options });
  el.addEventListener(type, fn, options);
  return el;
}

/** How many handlers this has for one kind of event, for anything checking. */
export const boundCount = (el, type) => (el?.__bound?.has(type) ? 1 : 0);
