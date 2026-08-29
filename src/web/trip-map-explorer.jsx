import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import { MapPin, MapTrifold, WarningCircle } from "@phosphor-icons/react";
import { api } from "./api-client.js";
import { coordinatesForWebMap } from "./map-coordinates.js";

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

const configuredTileUrl = String(import.meta.env.VITE_TRAVEL_MAP_TILE_URL ?? "").trim();
const configuredAttribution = String(import.meta.env.VITE_TRAVEL_MAP_ATTRIBUTION ?? "").trim();
const developmentOsmFallback = import.meta.env.DEV ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png" : "";
const tileUrl = configuredTileUrl || developmentOsmFallback;
const tileAttribution = configuredAttribution || (tileUrl.includes("openstreetmap.org") ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' : "地图底图服务");

function mappedPoint(node) {
  const coordinates = coordinatesForWebMap(node?.location?.coordinates);
  return coordinates ? { node, latitude: coordinates.latitude, longitude: coordinates.longitude } : null;
}

function mappedDecisionPoints(nodes, mobility) {
  const byNodeId = new Map(nodes.map((node) => [node.nodeId, node]));
  const candidates = [...nodes];
  for (const place of (mobility?.legs ?? []).flatMap((leg) => [leg.origin, leg.destination])) {
    if (!place?.nodeId || !place?.coordinates) continue;
    const existing = byNodeId.get(place.nodeId);
    if (existing?.location?.coordinates) continue;
    const hydrated = {
      ...(existing ?? { nodeId: place.nodeId, title: place.label, domain: "transport" }),
      location: { ...(existing?.location && typeof existing.location === "object" ? existing.location : {}), label: existing?.location?.label ?? place.label, coordinates: place.coordinates },
    };
    byNodeId.set(place.nodeId, hydrated);
    candidates.push(hydrated);
  }
  return [...new Map(candidates.map((node) => [node.nodeId, node])).values()].map(mappedPoint).filter(Boolean);
}

function mappedRoutePaths(mobility) {
  return (mobility?.legs ?? []).map((leg) => {
    const recommended = leg.alternatives?.find((alternative) => alternative.mode === leg.recommendedMode);
    const recommendedPoints = (recommended?.polyline ?? []).map(coordinatesForWebMap).filter(Boolean);
    if (recommendedPoints.length >= 2) return { points: recommendedPoints, kind: "recommended", mode: leg.recommendedMode };
    const fallback = leg.alternatives?.find((alternative) => (alternative.polyline?.length ?? 0) >= 2);
    const fallbackPoints = (fallback?.polyline ?? []).map(coordinatesForWebMap).filter(Boolean);
    return fallbackPoints.length >= 2 ? { points: fallbackPoints, kind: "comparison", mode: fallback.mode } : null;
  }).filter(Boolean);
}

function mapDataKey(points, paths) {
  return JSON.stringify({
    points: points.map(({ node, latitude, longitude }) => [node.nodeId, latitude, longitude]),
    paths: paths.map((path) => [path.routeRole ?? "current", path.kind, path.mode, path.points.map(({ latitude, longitude }) => [latitude, longitude])]),
  });
}

function numberedMarker(index, { active = false, trial = false, currentOnly = false } = {}) {
  return L.divIcon({
    className: "trip-map-marker-shell",
    html: `<span class="trip-map-marker ${active ? "active" : ""} ${trial ? "trial" : ""} ${currentOnly ? "current-only" : ""}"><b>${index + 1}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
    tooltipAnchor: [0, -34],
  });
}

export function TripDecisionMap({ nodes = [], comparisonNodes = [], activeNodeId = null, onFocusNode, mobility = null, comparisonMobility = null, tripId = null, staticMapAvailable = false, label = "旅行地点地图", locale = "zh-CN" }) {
  const english = locale === "en";
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const focusCallbackRef = useRef(onFocusNode);
  const [interactiveFailed, setInteractiveFailed] = useState(false);
  const [staticFailed, setStaticFailed] = useState(false);
  const combinedNodes = useMemo(() => [...comparisonNodes, ...nodes], [comparisonNodes, nodes]);
  const combinedMobility = useMemo(() => ({ legs: [...(comparisonMobility?.legs ?? []), ...(mobility?.legs ?? [])] }), [comparisonMobility, mobility]);
  const points = useMemo(() => mappedDecisionPoints(combinedNodes, combinedMobility), [combinedNodes, combinedMobility]);
  const paths = useMemo(() => mappedRoutePaths(mobility).map((path) => ({ ...path, routeRole: comparisonMobility ? "trial" : "current" })), [mobility, comparisonMobility]);
  const baselinePaths = useMemo(() => mappedRoutePaths(comparisonMobility).map((path) => ({ ...path, routeRole: "current" })), [comparisonMobility]);
  const renderPaths = useMemo(() => [...baselinePaths, ...paths], [baselinePaths, paths]);
  const trialNodeIds = useMemo(() => new Set(nodes.map((node) => node.nodeId).filter((nodeId) => !comparisonNodes.some((node) => node.nodeId === nodeId))), [nodes, comparisonNodes]);
  const currentOnlyNodeIds = useMemo(() => new Set(comparisonNodes.map((node) => node.nodeId).filter((nodeId) => !nodes.some((node) => node.nodeId === nodeId))), [nodes, comparisonNodes]);
  const routeLegCount = mobility?.legs?.length ?? 0;
  const routePathGapCount = Math.max(0, routeLegCount - paths.length);
  const comparisonPathCount = paths.filter((path) => path.kind === "comparison").length;
  const dataKey = useMemo(() => mapDataKey(points, renderPaths), [points, renderPaths]);
  focusCallbackRef.current = onFocusNode;

  useEffect(() => {
    if (!containerRef.current || !tileUrl || !points.length || interactiveFailed) return undefined;
    setInteractiveFailed(false);
    const hasFinePointer = window.matchMedia?.("(any-hover: hover) and (any-pointer: fine)")?.matches === true;
    const map = L.map(containerRef.current, {
      zoomControl: hasFinePointer,
      attributionControl: true,
      scrollWheelZoom: hasFinePointer,
      touchZoom: true,
      doubleClickZoom: true,
      dragging: true,
      keyboard: true,
    });
    mapRef.current = map;
    markersRef.current = new Map();
    const tiles = L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19, crossOrigin: true });
    tiles.on("tileerror", () => setInteractiveFailed(true));
    tiles.addTo(map);
    const bounds = [];
    points.forEach((point, index) => {
      const position = [point.latitude, point.longitude];
      const primaryIndex = nodes.findIndex((node) => node.nodeId === point.node.nodeId);
      const matchingDomainIndex = nodes.findIndex((node) => node.domain === point.node.domain);
      const displayIndex = primaryIndex >= 0 ? primaryIndex : matchingDomainIndex >= 0 ? matchingDomainIndex : index;
      const markerState = { active: point.node.nodeId === activeNodeId, trial: trialNodeIds.has(point.node.nodeId), currentOnly: currentOnlyNodeIds.has(point.node.nodeId) };
      const marker = L.marker(position, { title: point.node.title, keyboard: true, riseOnHover: true, icon: numberedMarker(displayIndex, markerState) })
        .bindTooltip(`${displayIndex + 1} · ${point.node.title}`, { direction: "top", opacity: 0.95 })
        .on("click", () => focusCallbackRef.current?.(point.node.nodeId))
        .addTo(map);
      markersRef.current.set(point.node.nodeId, { marker, index: displayIndex });
      bounds.push(position);
    });
    renderPaths.forEach((path) => {
      const positions = path.points.map(({ latitude, longitude }) => [latitude, longitude]);
      const style = path.routeRole === "current" && comparisonMobility
        ? { color: "#8fa3bd", weight: 5, opacity: 0.76, lineCap: "round", lineJoin: "round" }
        : path.kind === "recommended"
          ? { color: "#2166bd", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }
          : { color: "#9aa7b0", weight: 3, opacity: 0.72, dashArray: "8 7", lineCap: "round", lineJoin: "round" };
      L.polyline(positions, style).addTo(map);
      bounds.push(...positions);
    });
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
    const timer = setTimeout(() => map.invalidateSize(), 80);
    return () => {
      clearTimeout(timer);
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [dataKey, interactiveFailed]);

  useEffect(() => {
    if (!activeNodeId) return;
    markersRef.current.forEach(({ marker, index }, nodeId) => marker.setIcon(numberedMarker(index, { active: nodeId === activeNodeId, trial: trialNodeIds.has(nodeId), currentOnly: currentOnlyNodeIds.has(nodeId) })));
    const entry = markersRef.current.get(activeNodeId);
    if (!entry || !mapRef.current) return;
    mapRef.current.panTo(entry.marker.getLatLng(), { animate: true, duration: 0.35 });
    entry.marker.openTooltip();
  }, [activeNodeId, dataKey]);

  const useInteractive = Boolean(tileUrl && points.length && !interactiveFailed);
  const useStatic = !useInteractive && staticMapAvailable && tripId && !staticFailed;
  return <section className="trip-decision-map" aria-label={label}>
    <div className="trip-map-surface">
      {useInteractive ? <div ref={containerRef} className="leaflet-trip-map" /> : useStatic ? <img src={api.mapUrl(tripId)} alt={english ? (paths.length ? "Current places and recommended routes" : "Current trip places") : (paths.length ? "当前地点与推荐路线地图" : "当前旅行地点分布地图")} onError={() => setStaticFailed(true)} /> : <div className="trip-map-unavailable"><MapTrifold weight="duotone" /><span><strong>{english ? "No map is available for these options yet" : "这些候选暂时没有可展示的地图"}</strong><small>{english ? "Addresses and Amap navigation remain available. Places appear here when coordinates are returned." : "仍可查看地址与高德导航；取得坐标后会自动出现在这里。"}</small></span></div>}
      {interactiveFailed ? <div className="trip-map-error"><WarningCircle weight="fill" />{english ? "The base map did not fully load. Place coordinates are still retained." : "底图暂时没有完整载入，地点坐标仍保留。"}</div> : null}
      {points.length ? <span className="trip-map-count"><MapPin weight="fill" />{english ? `${points.length} places located${paths.length ? ` · ${paths.length} route segments drawn` : ""}${comparisonPathCount ? ` · ${comparisonPathCount} shown as comparison paths` : ""}${routePathGapCount ? ` · ${routePathGapCount} segment without a drawable path` : ""}` : `${points.length} 个地点已定位${paths.length ? ` · 已绘制 ${paths.length} 段路线` : ""}${comparisonPathCount ? ` · ${comparisonPathCount} 段为灰色对照路线` : ""}${routePathGapCount ? ` · ${routePathGapCount} 段暂无可绘制折线` : ""}`}</span> : null}
    </div>
    <footer><span>{useInteractive ? (configuredTileUrl ? (english ? "Configured interactive map" : "已配置互动底图") : (english ? "OpenStreetMap development basemap" : "OpenStreetMap 开发底图")) : useStatic ? (english ? "Amap static map" : "高德静态地图") : (english ? "Map pending" : "地图待补")}</span><small>{useInteractive ? comparisonPathCount ? (english ? "Blue lines use the recommended mode. Gray dashed lines use another Amap-returned mode only where the recommended geometry is unavailable." : "蓝色实线为推荐方式；灰色虚线只在推荐折线缺失时展示同一路段的高德对照路线，具体方式以时间轴为准。") : (english ? "Coordinates are converted for map comparison only. Final navigation still uses Amap." : "地点坐标已转换为底图坐标，仅作位置比较；正式导航仍使用高德。") : (english ? "Maps and routes show only data returned by named sources." : "地图与路线均只展示具名来源返回的资料。")}</small></footer>
  </section>;
}
