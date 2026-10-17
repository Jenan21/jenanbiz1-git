"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** A still map of the city behind a page: no controls, no dragging, tinted by CSS. */
export function ProjectMapBackdrop({ latitude, longitude, zoom = 15 }: { latitude: number; longitude: number; zoom?: number }) {
  return (
    <MapContainer
      attributionControl
      center={[latitude, longitude]}
      className="an-backdrop__map"
      doubleClickZoom={false}
      dragging={false}
      keyboard={false}
      scrollWheelZoom={false}
      touchZoom={false}
      zoom={zoom}
      zoomControl={false}
    >
      <TileLayer attribution={tileAttribution} url={tileUrl} />
    </MapContainer>
  );
}
