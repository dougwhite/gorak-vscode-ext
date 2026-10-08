import {
  type Component,
  componentTypes,
  findComponents,
  applicationLabels,
} from "./component-catalogue.js";
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): any;
  setState(state: unknown): void;
};
const host = acquireVsCodeApi();
const select = document.querySelector<HTMLSelectElement>("#application")!;
const search = document.querySelector<HTMLInputElement>("#search")!;
const gear = document.querySelector<HTMLButtonElement>("#gear")!;
const filters = document.querySelector<HTMLDivElement>("#types")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const results = document.querySelector<HTMLUListElement>("#results")!;
const more = document.querySelector<HTMLButtonElement>("#more")!;
const saved = host.getState() ?? {};
let application =
  typeof saved.application === "string" ? saved.application : "";
search.value = typeof saved.query === "string" ? saved.query : "";
const hidden = new Set<string>(Array.isArray(saved.hidden) ? saved.hidden : []);
let labels = new Map<string, string>();
let components: Component[] = [],
  limit = 200,
  failures = 0;
function save() {
  host.setState({ application, query: search.value, hidden: [...hidden] });
}
function render() {
  const matches = findComponents(components, search.value, application, [
    ...hidden,
  ]);
  results.replaceChildren();
  const fragment = document.createDocumentFragment();
  const light =
    document.body.classList.contains("vscode-light") ||
    document.body.classList.contains("vscode-high-contrast-light");
  for (const item of matches.slice(0, limit)) {
    const li = document.createElement("li"),
      button = document.createElement("button");
    button.className = "row";
    button.title = `${item.application}!${item.name} · ${componentTypes[item.componentType]?.label ?? item.componentType}\n${item.sourceUri}`;
    const icon = document.createElement("img");
    icon.alt = "";
    icon.src = `${document.body.dataset.icons}/${light ? "light" : "dark"}/${componentTypes[item.componentType]?.icon ?? "include-script"}.svg`;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name;
    button.append(icon, name);
    if (!application) {
      const app = document.createElement("span");
      app.className = "app";
      app.textContent = labels.get(item.applicationUri) ?? item.application;
      button.append(app);
    }
    button.onclick = () => host.postMessage({ type: "open", id: item.id });
    li.append(button);
    fragment.append(li);
  }
  results.append(fragment);
  more.hidden = matches.length <= limit;
  status.textContent = `${matches.length} component${matches.length === 1 ? "" : "s"}${matches.length > limit ? ` · showing ${limit}` : ""}${failures ? ` · ${failures} files could not be indexed` : ""}`;
  save();
}
function updateFilters() {
  filters.replaceChildren();
  const types = [
    ...new Set(components.map((item) => item.componentType)),
  ].sort();
  for (const type of types) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !hidden.has(type);
    input.onchange = () => {
      if (input.checked) hidden.delete(type);
      else hidden.add(type);
      limit = 200;
      render();
    };
    label.append(
      input,
      document.createTextNode(componentTypes[type]?.label ?? type),
    );
    filters.append(label);
  }
}
select.onchange = () => {
  application = select.value;
  limit = 200;
  render();
};
let timer: ReturnType<typeof setTimeout> | undefined;
search.oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    limit = 200;
    render();
  }, 60);
};
gear.onclick = () => {
  filters.hidden = !filters.hidden;
  gear.setAttribute("aria-expanded", String(!filters.hidden));
};
more.onclick = () => {
  limit += 200;
  render();
};
search.onkeydown = (event) => {
  if (["ArrowDown", "Enter"].includes(event.key)) {
    clearTimeout(timer);
    limit = 200;
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
  const rows = [...results.querySelectorAll<HTMLButtonElement>("button")];
  const index = rows.indexOf(document.activeElement as HTMLButtonElement);
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
  if (message.type === "focus") {
    application = "";
    select.value = "";
    search.focus();
    search.select();
    render();
    return;
  }
  if (message.type !== "catalogue") return;
  components = message.components;
  failures = message.failures;
  const apps = applicationLabels(components, message.applications);
  labels = apps;
  select.replaceChildren(new Option("(ALL) applications", ""));
  for (const [uri, name] of [...apps].sort((a, b) => a[1].localeCompare(b[1])))
    select.add(new Option(name, uri));
  if (!apps.has(application)) application = "";
  select.value = application;
  updateFilters();
  render();
});
host.postMessage({ type: "ready" });
