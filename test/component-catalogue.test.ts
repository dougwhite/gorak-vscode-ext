import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findComponents,
  sortComponents,
  restoredBrowserQuery,
  fuzzyScore,
  applicationLabels,
  componentTarget,
  type Component,
} from "../src/component-catalogue";
const component = (
  name: string,
  app = "sales",
  type = "framesource",
): Component => ({
  id: `${app}/${name}`,
  projectUri: "file:///project/",
  applicationUri: `file:///project/${app}/`,
  application: app,
  name,
  componentType: type,
  sourceUri: `file:///project/${app}/${name}.w4gl`,
});
test("component search ranks exact, prefix, substring and subsequence matches", () => {
  const rows = [
    component("customer_update"),
    component("old_customer"),
    component("customer"),
    component("cust_order"),
  ];
  assert.deepEqual(
    findComponents(rows, "customer").map((x) => x.name),
    ["customer", "customer_update", "old_customer"],
  );
  assert.ok(fuzzyScore("fm_customer_update", "fmcupd") > -Infinity);
  assert.equal(fuzzyScore("customer", "vendor"), -Infinity);
});
test("qualified search and type/application filters preserve duplicate identity", () => {
  const rows = [
    component("customer", "sales"),
    component("customer", "service"),
    component("customer_type", "sales", "classsource"),
  ];
  assert.equal(
    findComponents(rows, " SALES!CUSTOMER ")[0].id,
    "sales/customer",
  );
  assert.equal(findComponents(rows, "", "file:///project/service/").length, 1);
  assert.equal(findComponents(rows, "", "", ["framesource"]).length, 1);
  assert.equal(findComponents(rows, "customer").length, 3);
});
test("large catalogue search is bounded by callers without dropping matching applications", () => {
  const rows = Array.from({ length: 10000 }, (_, i) =>
    component(`frame_${i}`, `app_${i % 30}`),
  );
  assert.equal(findComponents(rows, "").length, 10000);
  assert.equal(findComponents(rows, "app_4!frame_4")[0].name, "frame_4");
  assert.equal(findComponents(rows, "missing!").length, 0);
});

test("empty applications and duplicate app names retain distinct labels", () => {
  const applications = [
    {
      uri: "file:///first/sales/",
      projectUri: "file:///first/",
      name: "sales",
    },
    {
      uri: "file:///second/sales/",
      projectUri: "file:///second/",
      name: "sales",
    },
    {
      uri: "file:///first/empty/",
      projectUri: "file:///first/",
      name: "empty",
    },
  ];
  const labels = applicationLabels([], applications);
  assert.equal(labels.size, 3);
  assert.equal(labels.get(applications[2].uri), "empty");
  assert.notEqual(
    labels.get(applications[0].uri),
    labels.get(applications[1].uri),
  );
});

test("only supported frame kinds open in the designer", () => {
  const frame = {
    ...component("panel"),
    frameUri: "file:///project/sales/panel.wml",
  };
  assert.deepEqual(componentTarget(frame), {
    uri: frame.frameUri,
    designer: true,
  });
  const field = { ...frame, componentType: "fieldtemplate" };
  assert.deepEqual(componentTarget(field), {
    uri: field.sourceUri,
    designer: false,
  });
});

test("browser sorts name, type and application in both directions without dropping rows", async () => {
  const rows = [
    component("zebra", "sales", "classsource"),
    component("alpha", "service", "framesource"),
    component("bravo", "accounts", "constsource"),
  ];
  for (const key of ["name", "type", "application"] as const) {
    const asc = sortComponents(rows, key);
    assert.deepEqual(sortComponents(rows, key, true), [...asc].reverse());
    assert.equal(asc.length, rows.length);
  }
  assert.deepEqual(
    sortComponents(rows, "name").map((x) => x.name),
    ["alpha", "bravo", "zebra"],
  );
  assert.deepEqual(
    sortComponents(rows, "type").map((x) => x.componentType),
    ["constsource", "framesource", "classsource"],
  );
  assert.deepEqual(
    sortComponents(rows, "application").map((x) => x.application),
    ["accounts", "sales", "service"],
  );
  const many = Array.from({ length: 350 }, (_, i) => component(`field_${i}`));
  assert.equal(
    sortComponents(findComponents(many, "", "file:///project/sales/"), "name")
      .length,
    350,
  );
});

test("application-first browser clears legacy component queries and retains current modes", () => {
  assert.equal(restoredBrowserQuery({ query: "old_frame" }), "");
  for (const mode of ["applications", "app", "global"])
    assert.equal(restoredBrowserQuery({ mode, query: "customer" }), "customer");
  assert.equal(
    restoredBrowserQuery({ mode: "invalid", query: "old_frame" }),
    "",
  );
});
