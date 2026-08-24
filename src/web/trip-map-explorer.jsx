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

function mappedRoutePaths(mobility) {
  return (mobility?.legs ?? []).map((leg) => {
    const recommended = leg.alternatives?.find((alternative) => alternative.mode === leg.recommendedMode);
    return (recommended?.polyline ?? []).map(coordinatesForWebMap).filter(Boolean);
  }).filter((path) => path.length >= 2);
}

function mapDataKey(points, paths) {
  return JSON.stringify({
    points: points.map(({ node, latitude, longitude }) => [node.nodeId, latitude, longitude]),
    paths: paths.map((path) => path.map(({ latitude, longitude }) => [latitude, longitude])),
  });
}

function numberedMarker(index, active = false) {
  return L.divIcon({
    className: "trip-map-marker-shell",
    html: `<span class="trip-map-marker ${active ? "active" : ""}"><b>${index + 1}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
    tooltipAnchor: [0, -34],
  });
}

export function TripDecisionMap({ nodes = [], activeNodeId = null, onFocusNode, mobility = null, tripId = null, staticMapAvailable = false, label = "旅行地点地图", locale = "zh-CN" }) {
  const english = locale === "en";
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const focusCallbackRef = useRef(onFocusNode);
  const [interactiveFailed, setInteractiveFailed] = useState(false);
  const [staticFailed, setStaticFailed] = useState(false);
  const points = useMemo(() => nodes.map(mappedPoint).filter(Boolean), [nodes]);
  const paths = useMemo(() => mappedRoutePaths(mobility), [mobility]);
  const dataKey = useMemo(() => mapDataKey(points, paths), [points, paths]);
  focusCallbackRef.current = onFocusNode;

  useEffect(() => {
    if (!containerRef.current || !tileUrl || !points.length || interactiveFailed) return undefined;
    setInteractiveFailed(false);
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, preferCanvas: true, scrollWheelZoom: false });
    mapRef.current = map;
    markersRef.current = new Map();
    const tiles = L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19, crossOrigin: true });
    tiles.on("tileerror", () => setInteractiveFailed(true));
    tiles.addTo(map);
    const bounds = [];
    points.forEach((point, index) => {
      const position = [point.latitude, point.longitude];
      const marker = L.marker(position, { title: point.node.title, keyboard: true, riseOnHover: true, icon: numberedMarker(index, point.node.nodeId === activeNodeId) })
        .bindTooltip(`${index + 1} · ${point.node.title}`, { direction: "top", opacity: 0.95 })
        .on("click", () => focusCallbackRef.current?.(point.node.nodeId))
        .addTo(map);
      markersRef.current.set(point.node.nodeId, { marker, index });
      bounds.push(position);
    });
    paths.forEach((path) => {
      const positions = path.map(({ latitude, longitude }) => [latitude, longitude]);
      L.polyline(positions, { color: "#2f6fda", weight: 5, opacity: 0.82, lineCap: "round", lineJoin: "round" }).addTo(map);
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
    markersRef.current.forEach(({ marker, index }, nodeId) => marker.setIcon(numberedMarker(index, nodeId === activeNodeId)));
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
      {points.length ? <span className="trip-map-count"><MapPin weight="fill" />{english ? `${points.length} places located${paths.length ? ` · ${paths.length} route segments` : ""}` : `${points.length} 个地点已定位${paths.length ? ` · ${paths.length} 段路线` : ""}`}</span> : null}
    </div>
    <footer><span>{useInteractive ? (configuredTileUrl ? (english ? "Configured interactive map" : "已配置互动底图") : (english ? "OpenStreetMap development basemap" : "OpenStreetMap 开发底图")) : useStatic ? (english ? "Amap static map" : "高德静态地图") : (english ? "Map pending" : "地图待补")}</span><small>{useInteractive ? (english ? "Coordinates are converted for map comparison only. Final navigation still uses Amap." : "地点坐标已转换为底图坐标，仅作位置比较；正式导航仍使用高德。") : (english ? "Maps and routes show only data returned by named sources." : "地图与路线均只展示具名来源返回的资料。")}</small></footer>
  </section>;
}
