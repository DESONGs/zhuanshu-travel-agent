import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const point = (longitude, latitude) => ({ longitude, latitude, coordinateSystem: "GCJ-02" });

function mobility(recommendedMode = "taxi") {
  return {
    status: "completed",
    checkedAt: "2026-08-31T08:00:00.000Z",
    itinerary: { days: [{ dayIndex: 1, date: "2026-10-15", stopIds: ["arrival", "stay"] }], stops: [{ stopId: "arrival", nodeId: "airport", dayIndex: 1 }, { stopId: "stay", nodeId: "hotel", dayIndex: 1 }] },
    travelerFit: { accessibilityEvidence: "partial" },
    legs: [{
      legId: "airport-hotel",
      origin: { stopId: "arrival", nodeId: "airport", label: "浦东 T2", dayIndex: 1, coordinates: point(121.8, 31.15) },
      destination: { stopId: "stay", nodeId: "hotel", label: "人民广场酒店", dayIndex: 1, coordinates: point(121.47, 31.23) },
      recommendedMode,
      rationale: "父亲单段步行不超过 600 米",
      alternatives: [
        { mode: "taxi", totalMinutes: 52, walkingMeters: 0, transfers: 0, estimatedFareCny: 151, polyline: [point(121.8, 31.15), point(121.47, 31.23)], steps: [{ kind: "taxi", instruction: "打车前往酒店" }], accessibilityFeatures: [] },
        { mode: "transit", totalMinutes: 110, walkingMeters: 420, transfers: 1, estimatedFareCny: 8, polyline: [point(121.8, 31.15), point(121.65, 31.2), point(121.47, 31.23)], steps: [{ kind: "ride", line: "地铁 2 号线", instruction: "浦东机场上车，人民广场下车" }], accessibilityFeatures: [] },
      ],
    }],
  };
}

const control = { brief: { destination: "上海", dates: "2026-10-15 至 2026-10-17", totalBudget: 8_000 }, travelers: [{ travelerId: "father", displayName: "父亲", careNeeds: { mobility: { maxContinuousWalkMeters: 600, avoidStairs: true } } }] };
const plan = { revision: 3, pendingProposals: [], byDomain: { transport: [{ nodeId: "airport", domain: "transport", title: "浦东 T2", selected: true }], stay: [{ nodeId: "hotel", domain: "stay", title: "人民广场酒店", selected: true }], food: [], play: [] }, mobility: mobility(), budget: null };

async function loadMiniPage(platform, request) {
  const filename = new URL(`../apps/miniapp/${platform}/pages/index/index.js`, import.meta.url);
  const source = await readFile(filename, "utf8");
  let page = null;
  vm.runInNewContext(source, { getApp: () => ({ request }), Page: (definition) => { page = definition; }, encodeURIComponent, Object, Array, Set, Map, Number, String, Promise, console }, { filename: filename.pathname });
  const instance = { ...page, data: structuredClone(page.data), setData(values) { Object.assign(this.data, values); } };
  return instance;
}

for (const platform of ["wechat", "alipay"]) {
  test(`${platform} projects a real current-day polyline and updates it only after a checked mode preview`, async () => {
    const calls = [];
    const page = await loadMiniPage(platform, async (path, options = {}) => {
      calls.push({ path, options });
      if (path.endsWith("/control")) return control;
      if (path.endsWith("/plan")) return plan;
      if (path.endsWith("/mobility/preview") && !options.data.previewId) return { status: "completed", previewId: "preview-base", mobility: mobility(), feasibility: { canConfirm: true } };
      if (path.endsWith("/mobility/preview")) return { status: "completed", previewId: "preview-transit", mobility: mobility(), feasibility: { canConfirm: true } };
      throw new Error(`unexpected ${path}`);
    });
    await page.loadTrip("trip-shanghai");
    assert.equal(page.data.activeDay, 1);
    assert.equal(page.data.polylines.length, 1);
    assert.equal(page.data.nextLeg.mode, "taxi");
    await page.selectRouteMode({ currentTarget: { dataset: { legId: "airport-hotel", mode: "transit" } } });
    assert.equal(page.data.nextLeg.mode, "transit");
    assert.equal(page.data.nextLeg.steps[0].line, "地铁 2 号线");
    assert.equal(page.data.routePreviewId, "preview-transit");
    assert.equal(page.data.routeSwitchBlocked, false);
    const previewCalls = calls.filter((call) => call.path.endsWith("/mobility/preview"));
    assert.equal(previewCalls.length, 2);
    assert.equal(previewCalls[1].options.data.previewId, "preview-base");
    assert.equal(JSON.stringify(previewCalls[1].options.data.routeModes), JSON.stringify({ "airport-hotel": "transit" }));
  });
}

test("a blocked miniapp mode switch preserves the previous drawn route", async () => {
  let previewCalls = 0;
  const page = await loadMiniPage("wechat", async (path, options = {}) => {
    if (path.endsWith("/control")) return control;
    if (path.endsWith("/plan")) return plan;
    if (path.endsWith("/mobility/preview")) {
      previewCalls += 1;
      if (previewCalls === 1) return { status: "completed", previewId: "preview-base", mobility: mobility(), feasibility: { canConfirm: true } };
      return { status: "blocked", previewId: "preview-blocked", mobility: mobility(), feasibility: { canConfirm: false, primaryBlocker: "公交步行 1145 米，超过 600 米上限" } };
    }
    throw new Error(`unexpected ${path} ${JSON.stringify(options)}`);
  });
  await page.loadTrip("trip-shanghai");
  const previousPolyline = structuredClone(page.data.polylines);
  await page.selectRouteMode({ currentTarget: { dataset: { legId: "airport-hotel", mode: "transit" } } });
  assert.equal(JSON.stringify(page.data.polylines), JSON.stringify(previousPolyline));
  assert.equal(page.data.nextLeg.mode, "taxi");
  assert.equal(page.data.routeSwitchBlocked, true);
  assert.match(page.data.notice, /1145 米.*600 米/);
});

for (const platform of ["wechat", "alipay"]) {
  test(`${platform} does not confirm a route preview while the displayed day has missing geometry`, async () => {
    const calls = [];
    const page = await loadMiniPage(platform, async (path, options = {}) => {
      calls.push({ path, options });
      throw new Error(`confirmation should not call ${path}`);
    });
    page.setData({
      trip: { tripId: "trip-shanghai" },
      proposal: { proposalId: "proposal-1" },
      proposalDomains: [{ key: "stay", candidates: [{ nodeId: "hotel", selected: true }] }],
      routePreviewId: "preview-incomplete",
      routeDrawable: false,
      routeSwitchBlocked: false,
    });
    await page.acceptProposal();
    assert.equal(calls.length, 0);
    assert.match(page.data.notice, /缺少真实折线/);
  });
}
