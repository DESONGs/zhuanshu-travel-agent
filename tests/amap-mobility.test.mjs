import assert from "node:assert/strict";
import test from "node:test";
import { AmapTravelResearchProvider } from "../src/providers/amap-travel-research.mjs";
import { normalizeTripMobility } from "zhuanshu-travel-agent/contracts";

test("AMap mobility turns selected places into bounded walking, transit and taxi alternatives without claiming real-time arrival", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.pathname === "/v3/geocode/geo") {
      return new Response(JSON.stringify({ status: "1", infocode: "10000", geocodes: [{ citycode: "021", adcode: "310000", location: "121.473701,31.230416" }] }), { headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/v5/direction/transit/integrated") {
      return new Response(JSON.stringify({ status: "1", infocode: "10000", route: { transits: [{ distance: "6200", walking_distance: "620", cost: { duration: "2100", transit_fee: "4" }, segments: [{ walking: { steps: [{ instruction: "乘直梯后步行至人民广场站", distance: "420", duration: "360", navi: { walk_type: "9" }, polyline: "121.473701,31.230416;121.474000,31.231000" }] }, bus: { buslines: [{ name: "地铁2号线(浦东国际机场方向)", departure_stop: { name: "人民广场" }, arrival_stop: { name: "陆家嘴" }, duration: "720", distance: "4800", polyline: "121.474000,31.231000;121.499809,31.239666" }] } }] }] } }), { headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/v5/direction/driving") {
      return new Response(JSON.stringify({ status: "1", infocode: "10000", route: { paths: [{ distance: "7000", cost: { duration: "1500", taxi: "35" }, steps: [{ instruction: "沿延安东路行驶", step_distance: "7000", cost: { duration: "1500" }, polyline: "121.473701,31.230416;121.499809,31.239666" }] }] } }), { headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/v5/direction/walking") {
      return new Response(JSON.stringify({ status: "1", infocode: "10000", route: { paths: [{ distance: "7400", cost: { duration: "5400" }, steps: [{ instruction: "步行前往", step_distance: "7400", cost: { duration: "5400" }, polyline: "121.473701,31.230416;121.499809,31.239666" }] }] } }), { headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/v3/staticmap") {
      assert.match(parsed.searchParams.get("paths"), /^8,0x216DD7/);
      return new Response(Uint8Array.from([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    }
    throw new Error(`unexpected path ${parsed.pathname}`);
  };
  const provider = new AmapTravelResearchProvider({ apiKey: "test-key", fetchImpl, requestIntervalMs: 0, rateLimitRetryMs: 0, clock: () => new Date("2026-08-16T08:00:00.000Z") });
  const mobility = normalizeTripMobility(await provider.planMobility({
    brief: { destination: "上海", dates: "2026-10-03 至 2026-10-07" },
    travelers: [{ travelerId: "traveler_father", displayName: "父亲", careNeeds: { mobility: { maxContinuousWalkMeters: 800, maxTransfers: 1, avoidStairs: true } } }],
    selectedNodes: [
      { nodeId: "stay_people_square", domain: "stay", title: "人民广场酒店", selected: true, location: { citycode: "021", coordinates: { longitude: 121.473701, latitude: 31.230416 } }, operability: { providerPoiId: "stay-1" } },
      { nodeId: "play_pearl", domain: "play", title: "东方明珠", selected: true, location: { citycode: "021", coordinates: { longitude: 121.499809, latitude: 31.239666 } }, operability: { providerPoiId: "play-1" } },
    ],
  }));

  assert.equal(mobility.status, "completed");
  assert.equal(mobility.legs.length, 1);
  assert.equal(mobility.legs[0].recommendedMode, "transit");
  assert.deepEqual(mobility.travelerFit.constrainedTravelerIds, ["traveler_father"]);
  assert.equal(mobility.travelerFit.maxContinuousWalkMeters, 800);
  assert.equal(mobility.travelerFit.accessibilityEvidence, "partial");
  assert.equal(mobility.legs[0].alternatives.find((item) => item.mode === "transit").realTimeArrival, false);
  const transit = mobility.legs[0].alternatives.find((item) => item.mode === "transit");
  assert.deepEqual(transit.steps[0].walkType, { code: "9", kind: "elevator", label: "直梯" });
  assert.deepEqual(transit.accessibilityFeatures.map(({ kind, status, realTime }) => ({ kind, status, realTime })), [{ kind: "elevator", status: "mapped_non_realtime", realTime: false }]);
  assert.equal(calls.find((item) => item.pathname.includes("transit"))?.searchParams.get("strategy"), "3");
  assert.equal(calls.find((item) => item.pathname.includes("transit"))?.searchParams.get("date"), "2026-10-03");
  const recommended = mobility.legs[0].alternatives.find((item) => item.mode === mobility.legs[0].recommendedMode);
  const map = await provider.renderStaticMap({ points: mobility.legs.flatMap((leg) => [leg.origin, leg.destination]), paths: [recommended.polyline] });
  assert.equal(map.contentType, "image/png");
});

test("AMap mobility rejects an otherwise short route with mapped stairs for a traveler who must avoid them", async () => {
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/v3/geocode/geo") return new Response(JSON.stringify({ status: "1", infocode: "10000", geocodes: [{ citycode: "021", adcode: "310000", location: "121.473701,31.230416" }] }));
    if (pathname === "/v5/direction/transit/integrated") return new Response(JSON.stringify({ status: "1", infocode: "10000", route: { transits: [{ distance: "2200", walking_distance: "300", cost: { duration: "900", transit_fee: "3" }, segments: [{ walking: { steps: [{ instruction: "经阶梯进站", distance: "300", duration: "240", walk_type: "20" }] }, bus: { buslines: [{ name: "地铁测试线", departure_stop: { name: "甲站" }, arrival_stop: { name: "乙站" }, duration: "480", distance: "1500" }] } }] }] } }));
    if (pathname === "/v5/direction/driving") return new Response(JSON.stringify({ status: "1", infocode: "10000", route: { paths: [{ distance: "2600", cost: { duration: "600", taxi: "18" }, steps: [{ instruction: "驾车前往", step_distance: "2600", cost: { duration: "600" } }] }] } }));
    if (pathname === "/v5/direction/walking") return new Response(JSON.stringify({ status: "1", infocode: "10000", route: { paths: [{ distance: "1800", cost: { duration: "1500" }, steps: [{ instruction: "经阶梯步行", step_distance: "1800", cost: { duration: "1500" }, navi: { walk_type: "20" } }] }] } }));
    throw new Error(`unexpected path ${pathname}`);
  };
  const provider = new AmapTravelResearchProvider({ apiKey: "test-key", fetchImpl, requestIntervalMs: 0, rateLimitRetryMs: 0 });
  const mobility = normalizeTripMobility(await provider.planMobility({
    brief: { destination: "上海" },
    travelers: [{ travelerId: "traveler_father", careNeeds: { mobility: { reduceWalking: true, avoidStairs: true } } }],
    selectedNodes: [
      { nodeId: "a", domain: "stay", title: "A", selected: true, location: { citycode: "021", coordinates: { longitude: 121.473701, latitude: 31.230416 } } },
      { nodeId: "b", domain: "play", title: "B", selected: true, location: { citycode: "021", coordinates: { longitude: 121.49, latitude: 31.24 } } },
    ],
  }));

  assert.equal(mobility.legs[0].recommendedMode, "taxi");
  assert.equal(mobility.travelerFit.maxContinuousWalkMeters, null, "an internal cautious target must not be presented as a user-stated limit");
  const transit = mobility.legs[0].alternatives.find((alternative) => alternative.mode === "transit");
  assert.equal(transit.accessibilityAssessment.hasStairs, true);
  assert.equal(transit.steps[0].accessibilityFeatures[0].guidance.includes("避开台阶"), true);
});

test("AMap mobility keeps account gates distinct from QPS and returns an honest unavailable state", async () => {
  const provider = new AmapTravelResearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({ status: "0", info: "USER_DAILY_QUERY_OVER_LIMIT", infocode: "10044" }), { headers: { "content-type": "application/json" } }),
    requestIntervalMs: 0,
    rateLimitRetryMs: 0,
  });
  const result = await provider.planMobility({
    brief: { destination: "上海" },
    selectedNodes: [
      { nodeId: "stay", domain: "stay", title: "酒店", selected: true, location: { coordinates: { longitude: 121.47, latitude: 31.23 } } },
      { nodeId: "play", domain: "play", title: "景点", selected: true, location: { coordinates: { longitude: 121.49, latitude: 31.24 } } },
    ],
  });
  assert.equal(result.status, "provider_unavailable");
  assert.equal(result.reason, "ACCOUNT_LIMITED");
});

test("mobility contract rejects arbitrary navigation URLs", () => {
  assert.throws(() => normalizeTripMobility({
    status: "completed",
    source: "amap_routes_v5",
    checkedAt: "2026-08-16T08:00:00.000Z",
    legs: [{
      legId: "unsafe_leg",
      origin: { nodeId: "a", label: "A", coordinates: { longitude: 121.47, latitude: 31.23 } },
      destination: { nodeId: "b", label: "B", coordinates: { longitude: 121.49, latitude: 31.24 } },
      recommendedMode: "walk",
      rationale: "测试",
      alternatives: [{ mode: "walk", totalMinutes: 10, navigationUrl: "https://evil.example/collect", steps: [{ kind: "walk", instruction: "步行" }] }],
    }],
  }), (error) => error.code === "invalid_trip_mobility" && error.details.field.includes("navigationUrl"));
});
