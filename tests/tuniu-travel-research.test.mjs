import assert from "node:assert/strict";
import test from "node:test";
import { TuniuTravelResearchProvider } from "../src/providers/tuniu-travel-research.mjs";
import { normalizeProviderResult } from "../travel-agent-pi-package/src/providers/index.ts";

function client(fixtures) {
  return {
    status: "configured",
    calls: [],
    async callReadTool(service, tool, args) {
      this.calls.push({ service, tool, args });
      return fixtures[tool];
    },
  };
}

test("Tuniu research normalizes official hotel and train inventory into shared candidates", async () => {
  const fake = client({
    tuniuHotelSearch: { hotels: [{ hotelId: 123, hotelName: "大理云海酒店", starName: "高档型", address: "大理古城", business: "古城商圈", commentScore: 4.7, lowestPrice: 680, firstPic: "https://m.tuniucdn.com/hotel.jpg", roomName: "观景房", refund: "限时取消" }] },
    searchLowestPriceTrain: { successCode: true, data: [{ trainNum: "D3802", departStationName: "广州南", destStationName: "大理", departureTime: "2026-09-15 07:00", arrivalTime: "2026-09-15 15:00", duration: "8时", price: { edzPrice: "420", ydzPrice: "680" }, seatAvailable: { edzNum: 12, ydzNum: 3 } }] },
  });
  const provider = new TuniuTravelResearchProvider({ client: fake, clock: () => new Date("2026-08-15T08:00:00.000Z") });
  const result = await provider.research({ brief: { origin: "广州", destination: "大理", dates: "2026-09-15 至 2026-09-19", arrivalMode: "火车" }, domains: ["stay", "transport"] });
  assert.equal(result.status, "completed");
  assert.equal(result.byDomain.stay[0].cost, 680);
  assert.deepEqual(result.byDomain.stay[0].price, { amount: 680, currency: "CNY", quality: "firm", basis: "per_night_room", checkedAt: result.checkedAt });
  assert.equal(result.byDomain.stay[0].media[0].url, "https://m.tuniucdn.com/hotel.jpg");
  assert.equal(result.byDomain.transport[0].cost, 420);
  assert.equal(result.byDomain.transport[0].price.quality, "firm");
  assert.equal(result.byDomain.transport[0].price.basis, "per_person_one_way");
  assert.equal(result.byDomain.transport[0].operability.availableSeats, 15);
  assert.deepEqual(fake.calls.map((call) => call.tool).sort(), ["searchLowestPriceTrain", "tuniuHotelSearch"]);
  assert.equal(result.byDomain.stay[0].operability.bookingUrl, undefined);
  assert.doesNotThrow(() => normalizeProviderResult(result), "hotel candidates without coordinates must still satisfy the shared Provider contract");
});

test("Tuniu research chooses the flight read tool only when the traveler requested air travel", async () => {
  const fake = client({ searchLowestPriceFlight: { successCode: true, data: [{ flightNumber: "CZ3481", airlineCompany: "南航", departureAirport: "白云", arrivalAirport: "大理", departureTerminal: "T2", arrivalTerminal: "", departureTime: "2026-09-15 08:00", arrivalTime: "2026-09-15 10:40", basePrice: "700", totalTax: "50", remainingSeats: "9", totalDuration: "2h40m", craftType: "32C", cabinClass: "经济舱" }] } });
  const provider = new TuniuTravelResearchProvider({ client: fake });
  const result = await provider.research({ brief: { origin: "广州", destination: "大理", dates: "2026-09-15", arrivalMode: "飞机" }, domains: ["transport"] });
  assert.equal(fake.calls[0].tool, "searchLowestPriceFlight");
  assert.equal(result.byDomain.transport[0].cost, 750);
  assert.equal(result.byDomain.transport[0].operability.transportType, "FLIGHT");
  assert.deepEqual(result.byDomain.transport[0].operability.departurePlace, { kind: "airport", city: "广州", label: "白云机场", terminal: "T2" });
  assert.deepEqual(result.byDomain.transport[0].operability.arrivalPlace, { kind: "airport", city: "大理", label: "大理机场", terminal: null });
  assert.deepEqual(result.byDomain.transport[0].operability.fareOffers, [{ provider: "tuniu_official_mcp", providerLabel: "途牛", currency: "CNY", totalFare: 750, baseFare: 700, taxes: 50, checkedAt: result.checkedAt, bookingUrl: null }]);
  assert.equal(result.byDomain.transport[0].operability.durationMinutes, 160);
  assert.equal(result.byDomain.transport[0].operability.vehicleModel, "32C");
});

test("Tuniu research follows an explicit flight question even when the saved arrival mode is still unknown", async () => {
  const fake = client({ searchLowestPriceFlight: { successCode: true, data: [{ flightNumber: "CZ3481", departureAirport: "白云", arrivalAirport: "大理凤仪", departureTime: "2026-09-15 08:00", arrivalTime: "2026-09-15 10:40", basePrice: "700", totalTax: "50" }] } });
  const provider = new TuniuTravelResearchProvider({ client: fake });

  const result = await provider.research({
    brief: { origin: "广州", destination: "大理", dates: "2026-09-15" },
    domains: ["transport"],
    question: "找出广州到大理的机票",
  });

  assert.deepEqual(fake.calls.map((call) => call.tool), ["searchLowestPriceFlight"]);
  assert.equal(result.byDomain.transport[0].operability.transportType, "FLIGHT");
});

test("Tuniu compares both flight and train when the traveler asks only for transportation", async () => {
  const fake = client({
    searchLowestPriceFlight: { successCode: true, data: [{ flightNumber: "CZ3481", departureAirport: "白云", arrivalAirport: "大理", departureTime: "2026-09-15 08:00", arrivalTime: "2026-09-15 10:40", basePrice: "700", totalTax: "50" }] },
    searchLowestPriceTrain: { successCode: true, data: [{ trainNum: "D3810", departStationName: "广州南", destStationName: "大理", departureTime: "2026-09-15 07:49", arrivalTime: "2026-09-15 18:43", duration: "10时54分", price: { edzPrice: "673", ydzPrice: "1075.5" }, seatAvailable: { edzNum: 2, ydzNum: 0 } }] },
  });
  const provider = new TuniuTravelResearchProvider({ client: fake });

  const result = await provider.research({ brief: { origin: "广州", destination: "大理", dates: "2026-09-15" }, domains: ["transport"], question: "帮我安排合适的交通工具" });

  assert.deepEqual(fake.calls.map((call) => call.tool).sort(), ["searchLowestPriceFlight", "searchLowestPriceTrain"]);
  assert.deepEqual(result.byDomain.transport.map((candidate) => candidate.operability.transportType).sort(), ["FLIGHT", "TRAIN"]);
  const train = result.byDomain.transport.find((candidate) => candidate.operability.transportType === "TRAIN");
  assert.deepEqual(train.operability.fareOptions, [
    { seatClass: "二等座", fare: 673, availableSeats: 2 },
    { seatClass: "一等座", fare: 1075.5, availableSeats: 0 },
  ]);
  assert.deepEqual(train.operability.arrivalPlace, { kind: "rail_station", city: "大理", label: "大理站", terminal: null });
});
