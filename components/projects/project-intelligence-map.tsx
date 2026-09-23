"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

type MapLocation = { latitude: number; longitude: number; label: string };
type MapCompetitor = { name: string; category: string; latitude: number; longitude: number };

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const mapProviderLabel = process.env.NEXT_PUBLIC_MAP_PROVIDER_LABEL ?? "OpenStreetMap";

export function ProjectIntelligenceMap({
  location,
  competitors,
  locale,
}: {
  location: MapLocation;
  competitors: MapCompetitor[];
  locale: "ar" | "en";
}) {
  const ar = locale === "ar";
  const validCompetitors = competitors.filter((competitor) => Number.isFinite(competitor.latitude) && Number.isFinite(competitor.longitude));

  return (
    <div className="project-map" role="region" aria-label={ar ? "خريطة الموقع والمنافسين" : "Location and competitors map"}>
      <MapContainer center={[location.latitude, location.longitude]} zoom={13} scrollWheelZoom className="project-map__canvas">
        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
        />
        <CircleMarker center={[location.latitude, location.longitude]} pathOptions={{ color: "#0a7ea4", fillColor: "#0a7ea4", fillOpacity: 0.85 }} radius={10}>
          <Popup>{location.label}</Popup>
        </CircleMarker>
        {validCompetitors.map((competitor) => (
          <CircleMarker key={`${competitor.name}-${competitor.latitude}-${competitor.longitude}`} center={[competitor.latitude, competitor.longitude]} pathOptions={{ color: "#cf5e21", fillColor: "#cf5e21", fillOpacity: 0.72 }} radius={6}>
            <Popup>{competitor.name} · {competitor.category}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <small>{ar ? `الأزرق: الموقع المحدد. البرتقالي: منافسون مرصودون. مزود الخريطة: ${mapProviderLabel}.` : `Blue: selected location. Orange: discovered competitors. Map provider: ${mapProviderLabel}.`}</small>
    </div>
  );
}