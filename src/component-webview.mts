import {
  type Component,
  type ComponentSort,
  componentTypes,
  componentTarget,
  findComponents,
  applicationLabels,
  fuzzyScore,
  sortComponents,
  restoredBrowserQuery,
} from "./component-catalogue.js";
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): any;
  setState(state: unknown): void;
};
const host = acquireVsCodeApi();
const search = document.querySelector<HTMLInputElement>("#search")!;
const gear = document.querySelector<HTMLButtonElement>("#gear")!;
const filters = document.querySelector<HTMLDivElement>("#types")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const results = document.querySelector<HTMLUListElement>("#results")!;
const listing = document.querySelector<HTMLDivElement>("#listing")!;
const back = document.querySelector<HTMLButtonElement>("#back")!;
const heading = document.querySelector<HTMLElement>("#heading")!;
const global = document.querySelector<HTMLButtonElement>("#global")!;
const sorting = document.querySelector<HTMLDivElement>("#sorting")!;
const sortButtons = [
  ...sorting.querySelectorAll<HTMLButtonElement>("[data-sort]"),
];
let lastSortClick: ComponentSort | undefined;
const menu = document.querySelector<HTMLDivElement>("#menu")!;
const saved = host.getState() ?? {};
type Mode = "applications" | "app" | "global";
let mode: Mode = ["app", "global"].includes(saved.mode)
  ? saved.mode
  : "applications";
let application =
  typeof saved.application === "string" ? saved.application : "";
let origin: { mode: Mode; application: string; query: string } | undefined =
  saved.origin;
search.value = restoredBrowserQuery(saved);
let sortKey: ComponentSort = ["name", "type", "application"].includes(
  saved.sortKey,
)
  ? saved.sortKey
  : "name";
let descending = saved.descending === true;
const hidden = new Set<string>(Array.isArray(saved.hidden) ? saved.hidden : []);
let labels = new Map<string, string>();
let components: Component[] = [],
  failures = 0;
let menuRequest = 0;
let menuRow: HTMLButtonElement | undefined;
let menuItem: Component | undefined;
function save() {
  host.setState({
    mode,
    application,
    origin,
    query: search.value,
    hidden: [...hidden],
    sortKey,
    descending,
  });
}
function closeMenu(restore = false) {
  menu.hidden = true;
  menuRequest++;
  if (restore) menuRow?.focus();
}
function openMenu(
  item: Component,
  row: HTMLButtonElement,
  x: number,
  y: number,
) {
  closeMenu();
  menuItem = item;
  menuRow = row;
  menu.replaceChildren();
  const action = (label: string, value: string) => {
    const button = document.createElement("button");
    button.role = "menuitem";
    button.textContent = label;
    button.onclick = () => {
      closeMenu(true);
      host.postMessage({ type: "open", id: item.id, action: value });
    };
    menu.append(button);
  };
  action("View in frame designer", "default");
  action("View source code", "source");
  menu.hidden = false;
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth - 4))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight - 4))}px`;
  menu.querySelector<HTMLButtonElement>("button")?.focus();
  host.postMessage({ type: "context", id: item.id, request: menuRequest });
}
function render() {
  closeMenu();
  back.hidden = mode === "applications";
  back.setAttribute(
    "aria-label",
    mode === "global" && origin?.mode === "app"
      ? "Back to application"
      : "Back to applications",
  );
  back.title = back.getAttribute("aria-label")!;
  heading.textContent =
    mode === "applications"
      ? "Applications"
      : mode === "global"
        ? "All applications"
        : (labels.get(application) ?? "Application");
  search.placeholder =
    mode === "applications" ? "Find application" : "Find component";
  results.setAttribute(
    "aria-label",
    mode === "applications" ? "Applications" : "Components",
  );
  global.hidden = mode === "global" || !search.value.trim();
  sorting.hidden = mode === "applications";
  gear.hidden = mode === "applications";
  if (mode === "applications") filters.hidden = true;
  document.body.dataset.mode = mode;
  if (mode !== "global" && sortKey === "application") sortKey = "name";
  for (const button of sortButtons) {
    const key = button.dataset.sort;
    button.parentElement!.hidden = key === "application" && mode !== "global";
    const active = key === sortKey;
    button.parentElement!.setAttribute(
      "aria-sort",
      active ? (descending ? "descending" : "ascending") : "none",
    );
    button.querySelector("span")!.textContent = active
      ? descending
        ? "▼"
        : "▲"
      : "";
    button.title = `Sort by ${button.textContent!.replace(/[▲▼]/g, "").trim()}`;
  }
  const fragment = document.createDocumentFragment();
  let count = 0;
  const light =
    document.body.classList.contains("vscode-light") ||
    document.body.classList.contains("vscode-high-contrast-light");
  const makeRow = (name: string, iconName: string) => {
    const li = document.createElement("li"),
      button = document.createElement("button"),
      icon = document.createElement("img"),
      text = document.createElement("span");
    button.className = "row";
    icon.alt = "";
    icon.src = `${document.body.dataset.icons}/${light ? "light" : "dark"}/${iconName}.svg`;
    text.className = "name";
    const label = document.createElement("span");
    label.className = "name-text";
    label.textContent = name;
    text.append(icon, label);
    button.append(text);
    li.append(button);
    fragment.append(li);
    count++;
    return button;
  };
  if (mode === "applications") {
    for (const [uri, label] of [...labels]
      .filter(([, name]) => Number.isFinite(fuzzyScore(name, search.value)))
      .sort((a, b) => a[1].localeCompare(b[1]))) {
      const row = makeRow(label, "application");
      row.title = uri;
      row.onclick = () => {
        application = uri;
        mode = "app";
        search.value = "";
        sortKey = "name";
        descending = false;
        lastSortClick = undefined;
        render();
        listing.scrollTop = 0;
        search.focus();
      };
    }
  } else {
    const matches = sortComponents(
      findComponents(
        components,
        search.value,
        mode === "app" ? application : "",
        [...hidden],
      ),
      sortKey,
      descending,
    );
    for (const item of matches) {
      const type = componentTypes[item.componentType];
      const button = makeRow(item.name, type?.icon ?? "include-script");
      button.title = `${item.application}!${item.name} · ${type?.label ?? item.componentType}\n${item.sourceUri}`;
      const label = document.createElement("span");
      label.className = "type";
      label.textContent = type?.label ?? item.componentType;
      button.append(label);
      if (mode === "global") {
        const app = document.createElement("span");
        app.className = "app";
        app.textContent = labels.get(item.applicationUri) ?? item.application;
        button.append(app);
      }
      button.onclick = () => host.postMessage({ type: "open", id: item.id });
      if (componentTarget(item).designer) {
        button.oncontextmenu = (event) => {
          event.preventDefault();
          openMenu(item, button, event.clientX, event.clientY);
        };
        button.onkeydown = (event) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            const r = button.getBoundingClientRect();
            openMenu(item, button, r.left, r.bottom);
          }
        };
      }
    }
  }
  results.replaceChildren(fragment);
  status.textContent = `${count} ${mode === "applications" ? "application" : "component"}${count === 1 ? "" : "s"}${failures ? ` · ${failures} files could not be indexed` : ""}`;
  save();
}
function updateFilters() {
  filters.replaceChildren();
  for (const type of [
    ...new Set(components.map((item) => item.componentType)),
  ].sort()) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !hidden.has(type);
    input.onchange = () => {
      if (input.checked) hidden.delete(type);
      else hidden.add(type);
      render();
    };
    label.append(
      input,
      document.createTextNode(componentTypes[type]?.label ?? type),
    );
    filters.append(label);
  }
}
back.onclick = () => {
  if (
    mode === "global" &&
    origin &&
    (origin.mode !== "app" || labels.has(origin.application))
  ) {
    ({ mode, application } = origin);
    search.value = origin.query;
    origin = undefined;
  } else {
    mode = "applications";
    application = "";
    search.value = "";
  }
  render();
  listing.scrollTop = 0;
  search.focus();
};
global.onclick = () => {
  origin = { mode, application, query: search.value };
  mode = "global";
  render();
  listing.scrollTop = 0;
  search.focus();
};
for (const button of sortButtons)
  button.onclick = () => {
    const key = button.dataset.sort as ComponentSort;
    descending = lastSortClick === key ? !descending : false;
    sortKey = key;
    lastSortClick = key;
    render();
  };
let timer: ReturnType<typeof setTimeout> | undefined;
search.oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(render, 60);
};
gear.onclick = () => {
  filters.hidden = !filters.hidden;
  gear.setAttribute("aria-expanded", String(!filters.hidden));
};
search.onkeydown = (event) => {
  if (["ArrowDown", "Enter"].includes(event.key)) {
    clearTimeout(timer);
    render();
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    results.querySelector<HTMLButtonElement>("button")?.focus();
  }
  if (event.key === "Enter")
    results.querySelector<HTMLButtonElement>("button")?.click();
};
results.onkeydown = (event) => {
  const rows = [...results.querySelectorAll<HTMLButtonElement>("button")],
    index = rows.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) search.focus();
    else rows[Math.min(next, rows.length - 1)]?.focus();
  } else if (event.key === "Home") {
    event.preventDefault();
    rows[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    rows.at(-1)?.focus();
  } else if (event.key === "Escape") search.focus();
};
menu.onkeydown = (event) => {
  const rows = [...menu.querySelectorAll<HTMLButtonElement>("button")];
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu(true);
  } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    rows[
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : (i + (event.key === "ArrowDown" ? 1 : -1) + rows.length) %
            rows.length
    ]?.focus();
  } else if (event.key === "Tab") closeMenu();
};
document.addEventListener("pointerdown", (event) => {
  if (!menu.contains(event.target as Node)) closeMenu();
});
document
  .querySelector("#listing")!
  .addEventListener("scroll", () => closeMenu());
window.addEventListener("blur", () => closeMenu());
new MutationObserver(render).observe(document.body, {
  attributes: true,
  attributeFilter: ["class"],
});
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "loading") {
    status.textContent = "Loading components…";
    return;
  }
  if (message.type === "error") {
    status.textContent = message.message;
    return;
  }
  if (message.type === "context") {
    if (
      menu.hidden ||
      message.request !== menuRequest ||
      message.id !== menuItem?.id ||
      !message.stylesheet
    )
      return;
    const button = document.createElement("button");
    button.role = "menuitem";
    button.textContent = "View stylesheet";
    button.onclick = () => {
      const id = menuItem!.id;
      closeMenu(true);
      host.postMessage({ type: "open", id, action: "stylesheet" });
    };
    menu.append(button);
    menu.style.top = `${Math.max(0, Math.min(parseFloat(menu.style.top), window.innerHeight - menu.offsetHeight - 4))}px`;
    return;
  }
  if (message.type === "focus") {
    mode = "global";
    origin = undefined;
    application = "";
    search.focus();
    search.select();
    render();
    listing.scrollTop = 0;
    return;
  }
  if (message.type !== "catalogue") return;
  components = message.components;
  failures = message.failures;
  labels = applicationLabels(components, message.applications);
  if (mode === "app" && !labels.has(application)) {
    mode = "applications";
    application = "";
  }
  updateFilters();
  render();
});
host.postMessage({ type: "ready" });
