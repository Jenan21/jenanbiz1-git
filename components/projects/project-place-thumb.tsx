"use client";

import type { CSSProperties } from "react";
import { TILE_SIZE, TILE_ZOOM, tileAt } from "@/lib/projects/map-tile";

/** A small crop of the map around the chosen point, drawn from the same OpenStreetMap tiles the picker map loads. */
export function PlaceThumb({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { px, py, tx, ty } = tileAt(latitude, longitude);
  const dx = px < TILE_SIZE / 2 ? -1 : 1;
  const dy = py < TILE_SIZE / 2 ? -1 : 1;
  const tiles = [0, dx].flatMap((ox) => [0, dy].map((oy) => ({ ox, oy })));
  return (
    <span aria-hidden="true" className="an-thumb">
      {tiles.map(({ ox, oy }) => (
        <i
          key={`${ox}:${oy}`}
          style={
            {
              backgroundImage: `url(https://${["a", "b", "c"][(tx + ox + ty + oy) % 3]}.tile.openstreetmap.org/${TILE_ZOOM}/${tx + ox}/${ty + oy}.png)`,
              "--tx": 50 - px + ox * TILE_SIZE,
              "--ty": 29.5 - py + oy * TILE_SIZE,
            } as CSSProperties
          }
        />
      ))}
      <b />
    </span>
  );
}
