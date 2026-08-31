import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PublicShareLinkAdapter } from "../src/adapters/share-link/public-share-link-adapter.mjs";
import { EvidenceCompanionService } from "../src/api/evidence-companion-service.mjs";
import { TravelService } from "../src/api/travel-service.mjs";
import { FileEvidenceProjectionRepository } from "../src/persistence/evidence-projection-repository.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

const fixedClock = () => new Date("2026-08-31T12:00:00.000Z");

async function evidenceFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-evidence-"));
  const travelService = new TravelService({ store: new TripStore({ rootDir: join(rootDir, "trips") }), clock: fixedClock });
  await travelService.createTrip({ tripId: "trip_evidence", brief: { destination: "上海" }, travelers: [{ travelerId: "traveler_1" }] });
  const node = {
    nodeId: "food_local_1",
    domain: "food",
    title: "弄堂本帮菜",
    summary: "午市排队较短，步行可达酒店。",
    sourceStatus: "verified_provider",
    sourceRefs: ["source_amap_food", "source_visit_food"],
    claimRefs: ["claim_queue", "claim_local"],
    location: { address: "上海市黄浦区", coordinates: { longitude: 121.48, latitude: 31.23, coordinateSystem: "GCJ-02" } },
    media: [{ url: "https://example.com/food.jpg", title: "餐厅门面", source: "amap_web_service" }],
    operability: { checkedAt: "2026-08-31T11:30:00.000Z", requestedFacilityNeeds: ["少走路"] },
  };
  await travelService.proposeTripChange({
    tripId: "trip_evidence",
    proposal: {
      schemaVersion: "trip-patch-proposal-v1",
      proposalId: "proposal_evidence",
      tripId: "trip_evidence",
      baseRevision: 0,
      writeSet: [node.nodeId],
      writeContract: { allowedNodeIds: [node.nodeId] },
      readSet: [],
      operations: [{ kind: "add_candidate", nodeId: node.nodeId, node }],
      evidenceBundle: {
        contentItems: [
          { contentItemId: "source_amap_food", provider: "amap_web_service", sourceType: "official_map_provider", providerRef: "poi_food", checkedAt: "2026-08-31T11:30:00.000Z", documentationUrl: "https://lbs.amap.com/", independenceGroup: "amap_food", commercialBias: "provider_ranking_unknown", title: "弄堂本帮菜", originalLanguage: "zh-CN", access: "public" },
          { contentItemId: "source_visit_food", provider: "traveler_visit_feedback", sourceType: "anonymous_visit_feedback", providerRef: "visit_1", checkedAt: "2026-08-30T10:00:00.000Z", documentationUrl: null, independenceGroup: "visit_food", commercialBias: "personal_experience", title: "匿名到访反馈", originalLanguage: "zh-CN", access: "public" },
        ],
        entities: [{ entityId: "entity_food", kind: "place", canonicalName: "弄堂本帮菜", providerRefs: ["source_amap_food"] }],
        claims: [
          { claimId: "claim_queue", entityId: "entity_food", nodeId: node.nodeId, kind: "queue", statement: "午市等待相对较短。", sourceRefs: ["source_visit_food"], sourceIndependence: "independent_visit", commercialBias: "personal_experience", confidence: 0.72 },
          { claimId: "claim_local", entityId: "entity_food", nodeId: node.nodeId, kind: "local_character", statement: "菜单以本帮家常菜为主。", sourceRefs: ["source_amap_food"], sourceIndependence: "provider_record", commercialBias: "provider_ranking_unknown", confidence: 0.8 },
        ],
      },
    },
  });
  const repository = new FileEvidenceProjectionRepository({ rootDir: join(rootDir, "evidence"), clock: fixedClock });
  return { rootDir, travelService, repository, node };
}

test("node evidence builds a canonical cached presentation without changing TripState", async () => {
  const { travelService, repository, node } = await evidenceFixture();
  const service = new EvidenceCompanionService({ travelService, repository, clock: fixedClock });
  const before = await travelService.getTripControlView("trip_evidence");
  const first = await service.presentationForNode({ tripId: "trip_evidence", nodeId: node.nodeId, targetLanguage: "zh-CN" });
  const second = await service.presentationForNode({ tripId: "trip_evidence", nodeId: node.nodeId, targetLanguage: "zh-CN" });
  const after = await travelService.getTripControlView("trip_evidence");

  assert.equal(first.schemaVersion, "evidence-presentation-bundle-v1");
  assert.equal(first.bundleId, second.bundleId);
  assert.equal(first.decisionFit.routeEligible, true);
  assert.equal(first.media[0].rights, "provider_display");
  assert.equal(first.media[0].displayUrl, "https://example.com/food.jpg");
  assert.equal(first.claimGroups.length, 2);
  assert.equal(first.sources.some((source) => source.sourceType === "anonymous_visit_feedback"), true);
  assert.equal(after.revision, before.revision);
  assert.equal(after.pendingProposalCount, before.pendingProposalCount);
});

test("translation creates a sidecar projection while retaining the original text and TripState", async () => {
  const { travelService, repository, node } = await evidenceFixture();
  const translator = async ({ sections }) => ({ translations: sections.map((section) => ({ sectionId: section.sectionId, text: `EN: ${section.originalText}` })), provider: "deepseek", model: "fixture-translation", tokenUsage: { input: 30, output: 20, total: 50 } });
  const service = new EvidenceCompanionService({ travelService, repository, translator, clock: fixedClock });
  const original = await service.presentationForNode({ tripId: "trip_evidence", nodeId: node.nodeId });
  const before = await travelService.getTripControlView("trip_evidence");
  const translated = await service.translateBundle({ tripId: "trip_evidence", bundleId: original.bundleId, targetLanguage: "en", userId: "usr_test" });
  const after = await travelService.getTripControlView("trip_evidence");

  assert.notEqual(translated.bundleId, original.bundleId);
  assert.equal(translated.translationStatus, "translated");
  assert.match(translated.sections[0].translatedText, /^EN:/);
  assert.equal(translated.sections[0].originalText, original.sections[0].originalText);
  assert.deepEqual(translated.translationAudit.tokenUsage, { input: 30, output: 20, total: 50 });
  assert.equal(after.revision, before.revision);
});

test("a public share link remains a source-only sidecar and never becomes a TripState fact", async () => {
  const { travelService, repository, node } = await evidenceFixture();
  const shareLinkAdapter = { resolve: async () => ({ status: "completed", platform: "xiaohongshu", sourceUrl: "https://www.xiaohongshu.com/explore/abc", sourceId: "share_xhs_abc", title: "上海弄堂午餐", author: "旅行者 A", originalLanguage: "zh-CN", excerpt: "作者记录了午市排队和两道菜的个人体验。", media: [{ kind: "image", sourceUrl: "https://sns-webpic-qc.xhscdn.com/example.jpg" }], checkedAt: "2026-08-31T12:00:00.000Z", access: "public" }) };
  const service = new EvidenceCompanionService({ travelService, repository, shareLinkAdapter, clock: fixedClock });
  const before = await travelService.getTripControlView("trip_evidence");
  const bundle = await service.resolveShareLink({ tripId: "trip_evidence", nodeId: node.nodeId, url: "https://www.xiaohongshu.com/explore/abc" });
  const after = await travelService.getTripControlView("trip_evidence");

  assert.equal(bundle.status, "partial");
  assert.equal(bundle.media[0].rights, "source_only");
  assert.equal(bundle.media[0].displayUrl, null);
  assert.equal(bundle.decisionFit.routeEligible, true);
  assert.match(bundle.decisionFit.summary, /尚未被 Parent Agent 核验/);
  assert.equal(after.revision, before.revision);
});

test("public share adapter enforces SSRF and redirect boundaries before parsing visible HTML", async () => {
  let fetchCalls = 0;
  const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const adapter = new PublicShareLinkAdapter({
    lookup: publicLookup,
    clock: fixedClock,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('<html lang="zh-CN"><head><meta property="og:title" content="公开旅行笔记"><meta property="og:image" content="https://example.com/cover.jpg"></head><body><article>排队约 20 分钟，入口在侧门。</article><script>ignore()</script></body></html>', { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  const result = await adapter.resolve("https://www.xiaohongshu.com/explore/abc?xsec_token=public-share-token&utm_source=share");
  assert.equal(result.status, "completed");
  assert.equal(result.title, "公开旅行笔记");
  assert.match(result.excerpt, /排队约 20 分钟/);
  assert.equal(result.sourceUrl.includes("xsec_token"), false, "share tokens must not be persisted in the projection");
  assert.equal(fetchCalls, 1);

  await assert.rejects(() => adapter.resolve("http://www.xiaohongshu.com/explore/insecure"), (error) => error.code === "TERMS_BLOCKED");

  const privateAdapter = new PublicShareLinkAdapter({ lookup: async () => [{ address: "127.0.0.1", family: 4 }], fetchImpl: async () => { throw new Error("must_not_fetch"); } });
  await assert.rejects(() => privateAdapter.resolve("https://www.xiaohongshu.com/explore/private"), (error) => error.code === "TERMS_BLOCKED" && error.details.reason === "private_or_reserved_address");

  const redirectAdapter = new PublicShareLinkAdapter({ lookup: publicLookup, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://v.douyin.com/redirected" } }) });
  await assert.rejects(() => redirectAdapter.resolve("https://www.xiaohongshu.com/explore/redirect"), (error) => error.code === "TERMS_BLOCKED" && error.details.reason === "cross_platform_redirect_blocked");

  const oversizedAdapter = new PublicShareLinkAdapter({ lookup: publicLookup, fetchImpl: async () => new Response("x".repeat(1_000_001), { status: 200, headers: { "content-type": "text/html" } }) });
  await assert.rejects(() => oversizedAdapter.resolve("https://www.xiaohongshu.com/explore/oversized"), (error) => error.code === "SOURCE_CHANGED" && error.details.reason === "response_too_large");

  const challengeAdapter = new PublicShareLinkAdapter({ lookup: publicLookup, fetchImpl: async () => new Response("<html><body>请先登录后查看，扫码登录</body></html>", { status: 200, headers: { "content-type": "text/html" } }) });
  const challenge = await challengeAdapter.resolve("https://www.xiaohongshu.com/explore/challenge");
  assert.equal(challenge.status, "login_required");
  assert.equal(challenge.code, "CHALLENGE");
});

test("expired evidence projections are removed instead of being treated as current", async () => {
  let now = new Date("2026-08-31T12:00:00.000Z");
  const clock = () => new Date(now);
  const { travelService, node, rootDir } = await evidenceFixture();
  const repository = new FileEvidenceProjectionRepository({ rootDir: join(rootDir, "expiring-evidence"), clock });
  const service = new EvidenceCompanionService({ travelService, repository, clock });
  const bundle = await service.presentationForNode({ tripId: "trip_evidence", nodeId: node.nodeId });
  assert.ok(await repository.get(bundle.bundleId));
  now = new Date("2026-08-31T19:00:00.000Z");
  assert.equal(await repository.get(bundle.bundleId), null);
});
