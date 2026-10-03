import {
  GorakFrameDesigner,
  parseWml,
  parseMetadata,
  frameFromWml,
} from "gorak-frame-designer";
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const host = acquireVsCodeApi();
const designer = new GorakFrameDesigner();
const status = document.getElementById("status")!;
const error = document.getElementById("error")!;
let pending = false;
function fail(value: unknown) {
  error.textContent = String(value);
}
function commitInput() {
  const input = designer.shadowRoot?.activeElement as HTMLElement | null;
  input?.blur();
  if (
    (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) &&
    !input.checkValidity()
  ) {
    fail(input.validationMessage);
    return false;
  }
  return true;
}
function send(command: string) {
  if (!commitInput()) return;
  host.postMessage({ type: command });
}
const menu = document.querySelector<HTMLElement>(".menubar")!;
const menus: HTMLDetailsElement[] = [];
function closeMenus() {
  for (const item of menus) {
    item.open = false;
    item.querySelector("summary")!.setAttribute("aria-expanded", "false");
  }
}
function addMenu(label: string) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = label;
  summary.setAttribute("role", "button");
  summary.setAttribute("aria-haspopup", "menu");
  summary.setAttribute("aria-expanded", "false");
  const popup = document.createElement("div");
  popup.setAttribute("role", "menu");
  popup.setAttribute("aria-label", label);
  details.append(summary, popup);
  details.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(details.open));
    if (details.open)
      for (const other of menus) if (other !== details) other.open = false;
  });
  summary.addEventListener("pointerenter", () => {
    if (menus.some((item) => item.open) && !details.open) {
      closeMenus();
      details.open = true;
    }
  });
  details.addEventListener("keydown", (event) => {
    const items = [
      ...popup.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenus();
      summary.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      details.open = true;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowDown"
              ? (index + 1) % items.length
              : (index <= 0 ? items.length : index) - 1;
      items[next]?.focus();
    } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const next =
        menus[
          (menus.indexOf(details) +
            (event.key === "ArrowRight" ? 1 : menus.length - 1)) %
            menus.length
        ];
      closeMenus();
      next.open = true;
      next.querySelector("summary")!.focus();
    }
  });
  menus.push(details);
  menu.insertBefore(details, status);
  return (
    label: string,
    action: () => void,
    shortcut?: string,
    disabled = false,
  ) => {
    const button = document.createElement("button");
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", label);
    button.textContent = label;
    button.disabled = disabled;
    if (shortcut) {
      const hint = document.createElement("kbd");
      hint.textContent = shortcut;
      button.append(hint);
    }
    if (disabled) button.title = "Requires additional Workbench validation";
    button.onclick = () => {
      closeMenus();
      summary.focus();
      try {
        if (commitInput()) action();
      } catch (error) {
        fail(error);
      }
    };
    popup.append(button);
  };
}
const fileMenu = addMenu("File");
fileMenu("Save", () => send("save"), "Ctrl+S");
const editMenu = addMenu("Edit");
editMenu("Undo", () => send("undo"), "Ctrl+Z");
editMenu("Redo", () => send("redo"), "Ctrl+Y");
const viewMenu = addMenu("View");
viewMenu("Raw WML", () => send("source"));
const groupMenu = addMenu("Group");
groupMenu("Flexible Form", () => designer.groupSelection("flexibleform"));
groupMenu("Subform", () => designer.groupSelection("subform"));
groupMenu("Ungroup", () => designer.ungroupSelection());
groupMenu("Stack Field (vertical)", () =>
  designer.groupSelection("stackfield"),
);
groupMenu("Stack Field (horizontal)", () =>
  designer.groupSelection("stackfield", 2),
);
for (const label of ["Tablefield", "Matrixfield", "Viewport"])
  groupMenu(label, () => {}, undefined, true);
window.addEventListener("pointerdown", (event) => {
  if (!event.composedPath().includes(menu)) closeMenus();
});
window.addEventListener("focusin", (event) => {
  if (!event.composedPath().includes(menu)) closeMenus();
});
window.addEventListener("blur", closeMenus);
designer.addEventListener("edit-intent", (event) => {
  if (pending) {
    fail("An edit is still being applied. Please retry.");
    return;
  }
  pending = true;
  host.postMessage({ type: "edit", intent: (event as CustomEvent).detail });
});
designer.addEventListener("designer-error", (event) =>
  fail((event as CustomEvent).detail),
);
designer.addEventListener("source-navigation", (event) =>
  host.postMessage({ type: "source", location: (event as CustomEvent).detail }),
);
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "error") {
    pending = false;
    fail(message.message);
    return;
  }
  if (message.type !== "state") return;
  pending = false;
  try {
    const doc = parseWml(message.uri, message.version, message.text);
    const metadata = message.metadata
      ? parseMetadata(
          message.metadata.uri,
          message.metadata.version,
          message.metadata.text,
        )
      : undefined;
    designer.document = frameFromWml(doc, message.layers, metadata);
    status.textContent = `${message.dirty ? "WML: unsaved" : "WML: saved"}${message.metadata ? (message.metadata.dirty ? " · Companion: unsaved" : " · Companion: saved") : ""}`;
    error.textContent = "";
    designer.hidden = false;
  } catch (e) {
    designer.hidden = true;
    fail(e);
  }
});
window.addEventListener(
  "keydown",
  (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (!["s", "z", "y"].includes(key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    send(
      key === "s" ? "save" : key === "y" || event.shiftKey ? "redo" : "undo",
    );
  },
  true,
);
window.addEventListener("blur", commitInput);
document.body.append(designer);
host.postMessage({ type: "ready" });
