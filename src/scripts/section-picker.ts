// The place pages carry a contents rail of 23 sections. On a desktop it is a sticky
// column beside the sections; on a phone (720px and under) it becomes a sticky bar under
// the site header that names the section in view and opens into the full list.
//
// The collapsed bar is drawn by global.css from first paint, keyed on the html.js class
// that the base layout sets inline in the head, so nothing moves when this script runs:
// it swaps the rail's heading for a button of the same size and gathers the groups into
// a panel that opens over the page rather than pushing it down. Without JavaScript the
// rail stays the plain list of links it is on a tablet.

const PHONE = window.matchMedia("(max-width: 720px)");

export function initSectionPicker(): void {
  const rail = document.querySelector<HTMLElement>(".place-body > .place-rail");
  const head = rail?.querySelector<HTMLElement>(":scope > .place-rail-head");
  if (!rail || !head || rail.dataset.sectionPicker) return;
  rail.dataset.sectionPicker = "ready";

  const panel = document.createElement("div");
  panel.className = "section-picker-panel";
  panel.id = "section-picker-panel";
  for (const group of Array.from(rail.querySelectorAll<HTMLElement>(":scope > .place-rail-group"))) {
    panel.append(group);
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "place-rail-head section-picker-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", panel.id);
  const label = document.createElement("span");
  label.className = "section-picker-label";
  label.textContent = head.textContent ?? "";
  const current = document.createElement("span");
  current.className = "section-picker-current";
  const caret = document.createElement("span");
  caret.className = "section-picker-caret";
  caret.setAttribute("aria-hidden", "true");
  toggle.append(label, current, caret);

  head.replaceWith(toggle);
  rail.append(panel);

  const setOpen = (open: boolean) => {
    rail.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => setOpen(!rail.classList.contains("is-open")));
  panel.addEventListener("click", (event) => {
    if ((event.target as HTMLElement | null)?.closest("a")) setOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (rail.classList.contains("is-open") && !rail.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && rail.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  PHONE.addEventListener("change", () => setOpen(false));

  // The page marks the section in view with aria-current on its rail link; the bar
  // repeats that label so the reader can see where they are without opening the list.
  const sync = () => {
    const active = panel.querySelector<HTMLElement>('.place-rail-link[aria-current="true"]');
    current.textContent = active?.textContent?.trim() ?? "";
  };
  new MutationObserver(sync).observe(panel, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  sync();
}
