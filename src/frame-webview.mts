import {
  GorakFrameDesigner,
  parseWml,
  parseMetadata,
  frameFromWml,
  decodeFrameImages,
  imageKey,
} from "gorak-frame-designer";
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const host = acquireVsCodeApi();
const designer = new GorakFrameDesigner();
const status = document.getElementById("status")!;
const error = document.getElementById("error")!;

function fail(value: unknown) {
  error.textContent = String(value);
}
function send(command: string) {
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
        action();
      } catch (error) {
        fail(error);
      }
    };
    popup.append(button);
  };
}
const viewMenu = addMenu("View");
viewMenu("Raw WML", () => send("source"));
viewMenu("W4GL Source", () => send("code"));
designer.addEventListener("field-action", (event) =>
  host.postMessage({ type: "field-action", ...(event as CustomEvent).detail }),
);
window.addEventListener("pointerdown", (event) => {
  if (!event.composedPath().includes(menu)) closeMenus();
});
window.addEventListener("focusin", (event) => {
  if (!event.composedPath().includes(menu)) closeMenus();
});
window.addEventListener("blur", closeMenus);
// This release always uses the component's viewer mode.
designer.readOnly = true;
designer.addEventListener("designer-error", (event) =>
  fail((event as CustomEvent).detail),
);
designer.addEventListener("source-navigation", (event) =>
  host.postMessage({ type: "source", location: (event as CustomEvent).detail }),
);
let renderGeneration = 0;
let currentState: any;
window.addEventListener("message", async (event) => {
  let message = event.data;
  if (message.type === "images") {
    if (
      !currentState ||
      message.uri !== currentState.uri ||
      message.version !== currentState.version
    )
      return;
    message = {
      ...currentState,
      images: message.images,
      imageError: message.imageError,
    };
  } else if (message.type === "state") currentState = message;
  if (message.type === "error") {
    fail(message.message);
    return;
  }
  if (message.type !== "state") return;
  const generation = ++renderGeneration;
  try {
    const doc = parseWml(message.uri, message.version, message.text);
    if (message.images === undefined) {
      const references = [
        ...new Set(
          doc.nodes.filter((node) => node.attributes.src).map(imageKey),
        ),
      ].map((key) => JSON.parse(key));
      if (references.length)
        host.postMessage({
          type: "images",
          uri: message.uri,
          version: message.version,
          references,
        });
    }
    const metadata = message.metadata
      ? parseMetadata(
          message.metadata.uri,
          message.metadata.version,
          message.metadata.text,
        )
      : undefined;
    const images = await decodeFrameImages(message.images ?? {});
    if (generation !== renderGeneration) return;
    designer.document = frameFromWml(doc, message.layers, metadata, images);
    status.textContent = `Read only · ${message.dirty ? "WML: unsaved" : "WML: saved"}${message.metadata ? (message.metadata.dirty ? " · Companion: unsaved" : " · Companion: saved") : ""}`;
    error.textContent = message.imageError
      ? `Some images could not be loaded: ${message.imageError}`
      : "";
    designer.hidden = false;
  } catch (e) {
    designer.hidden = true;
    fail(e);
  }
});
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (!["s", "z", "y"].includes(key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);
document.body.append(designer);
host.postMessage({ type: "ready" });
