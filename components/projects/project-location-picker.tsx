"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type PickedPoint = { latitude: number; longitude: number };

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

export function ProjectLocationPicker({
  center,
  label,
  onPick,
  point,
  zoom,
}: {
  center: PickedPoint;
  label: string;
  onPick: (point: PickedPoint) => void;
  point: PickedPoint | null;
  zoom: number;
}) {
  return (
    <div aria-label={label} className="pa-entry-map" role="application">
      <MapContainer center={[center.latitude, center.longitude]} className="pa-entry-map__canvas" scrollWheelZoom zoom={zoom} zoomControl>
        <TileLayer attribution={tileAttribution} url={tileUrl} />
        <Recenter center={center} zoom={zoom} />
        <ClickToPick onPick={onPick} />
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
