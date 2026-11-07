/** Small DOM helpers. No framework: screens build elements with h() and replace the sheet's content. */

export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Replace an element's children. */
export function replace(el: Element, ...children: (Child | Child[])[]): void {
  el.replaceChildren();
  append(el, children);
}

/** A number in tabular figures with its unit as a smaller grey suffix (DESIGN.md: Typography). */
export function figure(value: number, unit: string, options: Intl.NumberFormatOptions = {}): HTMLSpanElement {
  return h('span', { class: 'figure num' }, value.toLocaleString('en-US', options), h('span', { class: 'unit' }, ` ${unit}`));
}

/** A missing value: a grey dash, never a made-up one (DESIGN.md: Do's). */
export function dash(label = 'Not set in this case'): HTMLSpanElement {
  return h('span', { class: 'dash', title: label }, '—', h('span', { class: 'visually-hidden' }, label));
}
