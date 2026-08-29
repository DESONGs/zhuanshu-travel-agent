import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlyaiTravelResearchProvider } from "../src/providers/flyai-travel-research.mjs";
import { normalizeProviderResult } from "../travel-agent-pi-package/src/providers/index.ts";

function fixture(command) {
  if (command === "search-hotel") return [{
    shId: "hotel-1", name: "洱海旅居酒店", address: "大理市洱海边", price: "688", star: "高档型",
    longitude: "100.17", latitude: "25.69", mainPic: "https://img.alicdn.com/hotel.jpg",
    detailUrl: "https://router.feizhu.com/hotel?id=hotel-1",
  }];
  if (command === "search-poi") return [{
    id: "poi-1", name: "崇圣寺三塔", address: "大理市", category: "人文景观",
    longitude: "100.14", latitude: "25.70", mainPic: "https://gw.alicdn.com/poi.jpg",
    jumpUrl: "https://router.feizhu.com/poi?id=poi-1", ticketInfo: { price: "75", ticketName: "成人票" },
  }];
  return [{
    ticketPrice: "420", totalDuration: "480", jumpUrl: "https://router.feizhu.com/train?id=g1",
    journeys: [{ journeyType: "DIRECT", segments: [{ marketingTransportNo: "D3802", marketingTransportName: "动车", depStationName: "广州南", arrStationName: "大理", depDateTime: "2026-09-15 07:00", arrDateTime: "2026-09-15 15:00", seatClassName: "二等座", transportType: "TRAIN" }] }],
  }];
}

test("FlyAI provider exposes only an allowlisted child-process environment and normalizes handoff links", async () => {
  const workerHome = await mkdtemp(join(tmpdir(), "flyai-provider-test-"));
  const calls = [];
  const provider = new FlyaiTravelResearchProvider({
    enabled: true,
    apiKey: "flyai-test-key",
    workerHome,
    clock: () => new Date("2026-08-15T08:00:00.000Z"),
    runner: async (_file, args, options) => {
      calls.push({ command: args[1], options });
      return { stdout: JSON.stringify({ status: 0, data: { itemList: fixture(args[1]) } }) };
    },
  });
  const result = await provider.research({ brief: { origin: "广州", destination: "大理", dates: "2026-09-15 至 2026-09-19", arrivalMode: "火车" }, domains: ["stay", "play", "transport", "food"] });
  assert.equal(result.status, "completed");
  assert.deepEqual(calls.map((call) => call.command).sort(), ["search-hotel", "search-poi", "search-train"]);
  assert.equal(calls.every((call) => call.options.env.DEEPSEEK_API_KEY === undefined && call.options.env.MOONSHOT_API_KEY === undefined), true);
  assert.equal(calls.every((call) => call.options.env.FLYAI_API_KEY === "flyai-test-key" && call.options.env.HOME === workerHome), true);
  assert.equal(result.byDomain.food.length, 0);
  assert.equal(result.byDomain.stay[0].operability.bookingUrl, "https://router.feizhu.com/hotel?id=hotel-1");
  assert.equal(result.byDomain.transport[0].cost, 420);
  assert.equal(result.byDomain.transport[0].price.quality, "reference");
  assert.equal(JSON.stringify(result).includes("flyai-test-key"), false);
});

test("FlyAI strips non-allowlisted media and handoff URLs", async () => {
  const workerHome = await mkdtemp(join(tmpdir(), "flyai-provider-test-"));
  const provider = new FlyaiTravelResearchProvider({
    enabled: true,
    workerHome,
    runner: async () => ({ stdout: JSON.stringify({ status: 0, data: { itemList: [{ shId: "h2", name: "危险链接酒店", mainPic: "https://evil.example/image.jpg", detailUrl: "https://evil.example/book" }] } }) }),
  });
  const result = await provider.research({ brief: { destination: "大理" }, domains: ["stay"] });
  assert.equal(result.byDomain.stay[0].media.length, 0);
  assert.equal(result.byDomain.stay[0].operability.bookingUrl, null);
  assert.doesNotThrow(() => normalizeProviderResult(result), "a provider place without coordinates must omit the nested field instead of returning null");
});

test("FlyAI uses the current flight question instead of silently defaulting to train", async () => {
  const workerHome = await mkdtemp(join(tmpdir(), "flyai-provider-test-"));
  const calls = [];
  const provider = new FlyaiTravelResearchProvider({
    enabled: true,
    workerHome,
    runner: async (_file, args) => {
      calls.push(args[1]);
      return { stdout: JSON.stringify({ status: 0, data: { itemList: fixture(args[1]) } }) };
    },
  });

  await provider.research({
    brief: { origin: "广州", destination: "大理", dates: "2026-09-15" },
    domains: ["transport"],
    question: "请找广州到大理的机票",
  });

  assert.deepEqual(calls, ["search-flight"]);
});

test("FlyAI compares flight and train when no intercity mode was specified", async () => {
  const workerHome = await mkdtemp(join(tmpdir(), "flyai-provider-test-"));
  const calls = [];
  const provider = new FlyaiTravelResearchProvider({
    enabled: true,
    workerHome,
    runner: async (_file, args) => {
      calls.push(args[1]);
      return { stdout: JSON.stringify({ status: 0, data: { itemList: fixture(args[1]) } }) };
    },
  });

  await provider.research({ brief: { origin: "广州", destination: "大理", dates: "2026-09-15" }, domains: ["transport"], question: "安排交通工具" });

  assert.deepEqual(calls.sort(), ["search-flight", "search-train"]);
});
