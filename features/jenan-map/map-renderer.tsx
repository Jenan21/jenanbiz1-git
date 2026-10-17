"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as LibreMap, Marker } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { controlledReleaseMapUrl } from "./api";
import { geodesicRing } from "./geometry";
import type { RendererProps } from "./types";
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./jenan-map.module.css";

export default function MapRenderer({
  adminPreview = false,
  release,
  location,
  radius,
  visibleLayers,
  viewport,
  onViewportChange,
  onSelect,
  onError,
}: RendererProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const selection = useRef(onSelect);
  const failure = useRef(onError);
  const cameraChange = useRef(onViewportChange);
  const initialViewport = useRef(viewport);
  const latest = useRef({ location, radius, visibleLayers });
  useEffect(() => {
    selection.current = onSelect;
    failure.current = onError;
    cameraChange.current = onViewportChange;
  }, [onSelect, onError, onViewportChange]);

  function updateMap() {
    const instance = map.current;
    const current = latest.current;
    if (!instance?.isStyleLoaded()) return;
    for (const layer of release.layers) {
      for (const id of layer.styleLayerIds ?? []) {
        if (instance.getLayer(id))
          instance.setLayoutProperty(
            id,
            "visibility",
            layer.available && current.visibleLayers.includes(layer.id) ? "visible" : "none",
          );
      }
    }
    if (!current.location) {
      marker.current?.remove();
      marker.current = null;
      (
        instance.getSource("jenan-selection-radius") as
          GeoJSONSource | undefined
      )?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const { latitude, longitude } = current.location;
    if (!marker.current) {
      const element = document.createElement("div");
      element.className = styles.marker;
      element.setAttribute("aria-hidden", "true");
      marker.current = new maplibregl.Marker({ element, draggable: true })
        .setLngLat([longitude, latitude])
        .addTo(instance);
      marker.current.on("dragend", () => {
        const point = marker.current!.getLngLat();
        selection.current(point.lat, point.lng);
      });
    } else marker.current.setLngLat([longitude, latitude]);
    const data: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [geodesicRing(latitude, longitude, current.radius)],
      },
    };
    const source = instance.getSource("jenan-selection-radius") as
      GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      instance.addSource("jenan-selection-radius", { type: "geojson", data });
      instance.addLayer({
        id: "jenan-radius-fill",
        type: "fill",
        source: "jenan-selection-radius",
        paint: { "fill-color": "#18dbc2", "fill-opacity": 0.08 },
      });
      instance.addLayer({
        id: "jenan-radius-line",
        type: "line",
        source: "jenan-selection-radius",
        paint: {
          "line-color": "#24e6cf",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
    }
  }

  const update = useRef(updateMap);
  useEffect(() => {
    update.current = updateMap;
  });
  useEffect(() => {
    latest.current = { location, radius, visibleLayers };
    update.current();
    if (location && map.current) {
      const center = map.current.getCenter();
      if (
        Math.abs(center.lat - location.latitude) > 0.005 ||
        Math.abs(center.lng - location.longitude) > 0.005
      ) {
        map.current.easeTo({
          center: [location.longitude, location.latitude],
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 450,
        });
      }
    }
  }, [location, radius, visibleLayers]);

  useEffect(() => {
    if (!container.current) return;
    let instance: LibreMap | null = null;
    let resize: ResizeObserver | null = null;
    const protocol = new Protocol();
    let disposed = false;
    let loaded = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (!loaded && !disposed)
        failure.current(
          "انتهت مهلة تحميل الخريطة. تحقق من الشبكة ثم أعد المحاولة.",
        );
      controller.abort();
    }, 20_000);
    async function initialize() {
      try {
        const resourceUrl = (url: string) =>
          controlledReleaseMapUrl(
            url,
            window.location.origin,
            release,
            adminPreview,
          );
        if (!window.WebGL2RenderingContext)
          throw new Error(
            "WebGL غير متاح في هذا الجهاز. يمكنك إدخال الإحداثيات يدوياً.",
          );
        maplibregl.setWorkerUrl(
          new URL("/jenan-map/maplibre-gl-worker.mjs", window.location.origin)
            .href,
        );
        maplibregl.addProtocol("pmtiles", protocol.tile);
        if (!release.styleUrl)
          throw new Error("لا يتضمن الإصدار نمط خريطة معتمداً.");
        const styleUrl = resourceUrl(release.styleUrl);
        const response = await fetch(styleUrl, {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("تعذر تحميل نمط الإصدار المعتمد.");
        const style = await response.json();
        if (disposed) return;
        // Keep style resources pinned to the controlled API even if a style is misconfigured.
        if (style.glyphs) style.glyphs = resourceUrl(style.glyphs);
        if (style.sprite) {
          if (typeof style.sprite === "string")
            style.sprite = resourceUrl(style.sprite);
          else
            for (const sprite of style.sprite)
              sprite.url = resourceUrl(sprite.url);
        }
        for (const source of Object.values(style.sources ?? {}) as Array<{
          url?: string;
          tiles?: string[];
          type?: string;
          data?: unknown;
        }>) {
          if (source.url) source.url = resourceUrl(source.url);
          if (source.tiles)
            source.tiles = source.tiles.map((url) => resourceUrl(url));
          if (source.type === "geojson" && typeof source.data === "string") {
            source.data = resourceUrl(source.data);
          }
          if (
            source.type !== "vector" &&
            source.type !== "raster" &&
            source.type !== "raster-dem" &&
            source.type !== "geojson"
          )
            throw new Error("مصدر بيانات غير مدعوم في الإصدار.");
        }
        const current = latest.current.location;
        const camera = initialViewport.current;
        instance = new maplibregl.Map({
          container: container.current!,
          style,
          center: camera ? [camera.longitude, camera.latitude] : current ? [current.longitude, current.latitude] : [45, 24],
          zoom: camera?.zoom ?? (current ? 12 : 5),
          minZoom: 3,
          maxZoom: 18,
          // Camera framing only; Saudi inclusion uses the release's reviewed PostGIS polygon.
          maxBounds: [
            [34, 16],
            [56.5, 33],
          ],
          renderWorldCopies: false,
          attributionControl: {
            compact: false,
            customAttribution: [
              "Jenan PRO",
              '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL 1.0)',
              '<a href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (product CC BY 4.0; upstream licenses retained)',
              "حدود غير رسمية — Unofficial boundaries",
            ],
          },
          locale: {
            "NavigationControl.ZoomIn": "تكبير الخريطة",
            "NavigationControl.ZoomOut": "تصغير الخريطة",
            "AttributionControl.ToggleAttribution": "عرض مصادر الخريطة",
          },
          transformRequest: (url) => ({
            url: resourceUrl(url),
            credentials: "same-origin",
          }),
        });
        map.current = instance;
        instance.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-left",
        );
        instance.on("click", (event) =>
          selection.current(event.lngLat.lat, event.lngLat.lng),
        );
        instance.on("moveend", () => {
          if (!instance || disposed) return;
          const center = instance.getCenter();
          cameraChange.current?.({
            latitude: center.lat, longitude: center.lng, zoom: instance.getZoom(),
          });
        });
        instance.on("load", () => {
          loaded = true;
          clearTimeout(timeout);
          instance
            ?.getCanvas()
            .setAttribute(
              "aria-label",
              "خريطة جنان برو. يمكن إدخال الإحداثيات من الحقول المجاورة.",
            );
          update.current();
        });
        instance.on("error", () => {
          if (!disposed)
            failure.current(
              "تعذر تحميل بيانات الخريطة المعتمدة. لا توجد خريطة بديلة خارجية.",
            );
        });
        instance.getCanvas().addEventListener("webglcontextlost", contextLost);
        resize = new ResizeObserver(() => instance?.resize());
        resize.observe(container.current!);
      } catch (error) {
        if (!disposed)
          failure.current(
            error instanceof Error ? error.message : "تعذر تشغيل الخريطة.",
          );
      }
    }
    const contextLost = () =>
      failure.current(
        "تعذر استمرار WebGL. أعد المحاولة أو أدخل الإحداثيات يدوياً.",
      );
    void initialize();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
      resize?.disconnect();
      marker.current?.remove();
      marker.current = null;
      instance
        ?.getCanvas()
        .removeEventListener("webglcontextlost", contextLost);
      instance?.remove();
      map.current = null;
      maplibregl.removeProtocol("pmtiles");
    };
  }, [release, adminPreview]);

  return <div className={styles.canvas} ref={container} />;
}
