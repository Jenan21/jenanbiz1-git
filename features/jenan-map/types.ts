export type LocationSource = "map" | "search" | "geolocation" | "coordinates";

export interface JenanLocation {
  latitude: number;
  longitude: number;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  formattedAddress: string | null;
  source: LocationSource | null;
  selectedAt: string | null;
}

export type SavedJenanLocation = JenanLocation & {
  country: "SA";
  source: LocationSource;
  selectedAt: string;
};

export interface MapLayer {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  styleLayerIds?: string[];
}

export interface MapRelease {
  id: string;
  version: string;
  styleUrl: string | null;
  layers: MapLayer[];
  attribution?: string;
  boundaryNotice?: string;
  source?: string;
  sourceDate?: string;
  license?: string;
  artifacts?: Array<{ id: string; kind: string; url: string }>;
}

export interface MapManifest {
  status: "enabled" | "maintenance" | "disabled" | "unavailable";
  release: MapRelease | null;
}

export interface SearchResult {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface RendererProps {
  adminPreview?: boolean;
  release: MapRelease;
  location: JenanLocation | null;
  radius: number;
  visibleLayers: string[];
  viewport?: MapViewport | null;
  onViewportChange?: (viewport: MapViewport) => void;
  onSelect: (latitude: number, longitude: number) => void;
  onError: (message: string) => void;
}

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapPreferences {
  releaseId: string;
  radius: number;
  visibleLayers: string[];
  viewport: MapViewport | null;
  revision: number;
}
