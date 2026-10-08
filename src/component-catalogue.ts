export interface Component {
  id: string;
  projectUri: string;
  applicationUri: string;
  application: string;
  name: string;
  componentType: string;
  sourceUri: string;
  frameUri?: string;
}
export interface Application {
  uri: string;
  projectUri: string;
  name: string;
}
export interface Catalogue {
  applications?: Application[];
  components: Component[];
  indexing: boolean;
  failures: number;
}
export const componentTypes: Record<string, { label: string; icon: string }> = {
  framesource: { label: "User frame", icon: "user-frame" },
  ghostsource: { label: "Ghost frame", icon: "ghost-frame" },
  frametemplate: { label: "Frame template", icon: "frame-template" },
  fieldtemplate: { label: "Field template", icon: "field-template" },
  classsource: { label: "Userclass", icon: "userclass" },
  proc4glsource: { label: "4GL procedure", icon: "4gl-procedure" },
  proc3glsource: { label: "3GL procedure", icon: "3gl-procedure" },
  globsource: { label: "Global variable", icon: "global-variable" },
  constsource: { label: "Constant", icon: "constant" },
  scriptsource: { label: "Include script", icon: "include-script" },
  dbprocsource: { label: "DB procedure", icon: "db-procedure" },
  extlibsource: {
    label: "External class library",
    icon: "external-class-library",
  },
};
export function fuzzyScore(value: string, query: string): number {
  value = value.toLowerCase();
  query = query.toLowerCase().trim();
  if (!query) return 0;
  if (value === query) return 10000;
  if (value.startsWith(query)) return 5000 - value.length;
  const contiguous = value.indexOf(query);
  if (contiguous >= 0) return 3000 - contiguous - value.length;
  let cursor = 0,
    gap = 0,
    previous = -1;
  for (const character of query) {
    const next = value.indexOf(character, cursor);
    if (next < 0) return -Infinity;
    if (previous >= 0) gap += next - previous - 1;
    previous = next;
    cursor = next + 1;
  }
  return 1000 - gap - value.length;
}
export function findComponents(
  components: readonly Component[],
  query: string,
  application = "",
  hiddenTypes: readonly string[] = [],
): Component[] {
  const bang = query.indexOf("!");
  const appQuery = bang < 0 ? "" : query.slice(0, bang).trim();
  const nameQuery = bang < 0 ? query : query.slice(bang + 1);
  return components
    .filter(
      (item) =>
        (!application || item.applicationUri === application) &&
        !hiddenTypes.includes(item.componentType),
    )
    .map((item) => ({
      item,
      score:
        fuzzyScore(item.name, nameQuery) +
        fuzzyScore(item.application, appQuery),
    }))
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.name.localeCompare(b.item.name) ||
        a.item.application.localeCompare(b.item.application) ||
        a.item.id.localeCompare(b.item.id),
    )
    .map(({ item }) => item);
}

export function applicationLabels(
  components: readonly Component[],
  inventory?: readonly Application[],
): Map<string, string> {
  const applications = new Map(
    (inventory
      ? inventory.map((item) => ({
          applicationUri: item.uri,
          application: item.name,
          projectUri: item.projectUri,
        }))
      : components
    ).map((item) => [item.applicationUri, item]),
  );
  const counts = new Map<string, number>();
  for (const item of applications.values())
    counts.set(item.application, (counts.get(item.application) ?? 0) + 1);
  return new Map(
    [...applications.values()].map((item) => [
      item.applicationUri,
      (counts.get(item.application) ?? 0) > 1
        ? `${item.application} · ${item.projectUri}`
        : item.application,
    ]),
  );
}

export function componentTarget(component: Component): {
  uri: string;
  designer: boolean;
} {
  const designer = Boolean(
    component.frameUri &&
    ["framesource", "frametemplate"].includes(component.componentType),
  );
  return {
    uri: designer ? component.frameUri! : component.sourceUri,
    designer,
  };
}
