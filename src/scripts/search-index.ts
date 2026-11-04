// One request for /search-index.json per page load. The site search, the homepage
// area finders and the postcode page all read the same file; each used to fetch it,
// so the homepage asked for it three times. The promise is held on globalThis, not in
// module scope, because Astro may bundle this module into more than one script chunk,
// and a module level variable would then exist once per chunk.

const KEY = "__ukdSearchIndex";

type Holder = { [KEY]?: Promise<unknown> };

export function loadSearchIndex<T = unknown>(): Promise<T> {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    holder[KEY] = fetch("/search-index.json").then((response) => {
      if (!response.ok) {
        throw new Error(`Search index request failed with ${response.status}`);
      }
      return response.json();
    });
    // A failed request may be retried by the next caller rather than cached for the page.
    holder[KEY].catch(() => {
      delete holder[KEY];
    });
  }
  return holder[KEY] as Promise<T>;
}
