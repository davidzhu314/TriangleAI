/**
 * The Drive screen's Rail / Physics (beta) switch. It flips David's `?wire=chain` dev switch (wire/select.ts) for the
 * trainee, so nobody has to type it: the page reloads with or without it, and the planned route survives because the
 * plan is saved per tab (store.ts, sessionStorage). Rail stays the default. Pure, so it is unit-tested.
 */

export type WireChoice = 'rail' | 'chain';

/** Which wire the page asked for: 'chain' only when the address carries `?wire=chain`. */
export function wireChoice(search: string): WireChoice {
  return new URLSearchParams(search).get('wire') === 'chain' ? 'chain' : 'rail';
}

/** The same address with the wire set to `choice`: `?wire=chain` added, or removed. Every other part is kept. */
export function wireUrl(href: string, choice: WireChoice): string {
  const u = new URL(href);
  if (choice === 'chain') u.searchParams.set('wire', 'chain');
  else u.searchParams.delete('wire');
  return u.toString();
}
