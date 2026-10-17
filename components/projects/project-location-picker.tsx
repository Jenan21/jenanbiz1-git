"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type PickedPoint = { latitude: number; longitude: number };
export type MapCompetitor = { name: string; category: string; latitude: number; longitude: number };

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function ClickToPick({ onPick }: { onPick: (point: PickedPoint) => void }) {
  useMapEvents({
    click(event) {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function Recenter({ center, zoom }: { center: PickedPoint; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.latitude, center.longitude], zoom);
  }, [center.latitude, center.longitude, map, zoom]);
  return null;
}

/** A dialog that changes size while the map is open (or a window that is resized) must not leave grey, untiled edges. */
function KeepSize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function FitToPoints({ competitors, point }: { competitors: MapCompetitor[]; point: PickedPoint }) {
  const map = useMap();
  // The parent rebuilds the array on every render; the signature keeps the view from being re-fitted each time.
  const signature = JSON.stringify([point.latitude, point.longitude, competitors.map((item) => [item.latitude, item.longitude])]);
  useEffect(() => {
    const [latitude, longitude, others] = JSON.parse(signature) as [number, number, Array<[number, number]>];
    if (!others.length) return;
    map.fitBounds([[latitude, longitude], ...others], { padding: [28, 28], maxZoom: 15 });
  }, [map, signature]);
  return null;
}

/** Picks a point when `onPick` is given; otherwise it is a read-only map that shows the point and its competitors. */
export function ProjectLocationPicker({
  center,
  competitors = [],
  label,
  onPick,
  point,
  zoom,
}: {
  center: PickedPoint;
  competitors?: MapCompetitor[];
  label: string;
  onPick?: (point: PickedPoint) => void;
  point: PickedPoint | null;
  zoom: number;
}) {
  const visible = competitors.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  return (
    <div aria-label={label} className={`pa-entry-map${onPick ? "" : " pa-evidence-map"}`} role="application">
      <MapContainer center={[center.latitude, center.longitude]} className="pa-entry-map__canvas" scrollWheelZoom zoom={zoom} zoomControl>
        <TileLayer attribution={tileAttribution} url={tileUrl} />
        <Recenter center={center} zoom={zoom} />
        <KeepSize />
        {!onPick && point && visible.length ? <FitToPoints competitors={visible} point={point} /> : null}
        {onPick ? <ClickToPick onPick={onPick} /> : null}
        {visible.map((item, index) => (
          <CircleMarker center={[item.latitude, item.longitude]} key={`${item.name}-${index}`} pathOptions={{ color: "#ffb347", fillColor: "#ffb347", fillOpacity: 0.85, weight: 1 }} radius={6}>
            <Popup>{item.name} · {item.category}</Popup>
          </CircleMarker>
        ))}
        {point ? (
          <>
            <CircleMarker center={[point.latitude, point.longitude]} pathOptions={{ color: "#19f0f6", fillColor: "#19f0f6", fillOpacity: 0.18, weight: 1 }} radius={34} />
            <CircleMarker center={[point.latitude, point.longitude]} pathOptions={{ color: "#ffffff", fillColor: "#19f0f6", fillOpacity: 1, weight: 2 }} radius={8} />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}
