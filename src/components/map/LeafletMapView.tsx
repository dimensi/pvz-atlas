"use client";

import { useEffect, useMemo } from "react";
import { divIcon, latLngBounds, type LatLngExpression } from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { PointStatus } from "@/lib/data-model/types";
import type { MappablePointItem } from "@/lib/map/points";

interface LeafletMapViewProps {
  markers: MappablePointItem[];
  onMarkerSelect: (pointId: string) => void;
  onTileError: () => void;
}

const DEFAULT_MAP_CENTER: LatLngExpression = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;
const SINGLE_MARKER_ZOOM = 15;
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const STATUS_MARKER_CLASSES: Record<PointStatus, string> = {
  new: "map-marker-new",
  active: "map-marker-active",
  needs_review: "map-marker-needs-review",
  closed: "map-marker-closed"
};

function markerPosition(item: MappablePointItem): LatLngExpression {
  return [item.coordinates.lat, item.coordinates.lon];
}

function createStatusIcon(status: PointStatus) {
  return divIcon({
    className: `map-marker ${STATUS_MARKER_CLASSES[status]}`,
    html: "<span></span>",
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function MapViewportController({ markers }: { markers: MappablePointItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length === 0) {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_ZOOM, { animate: true });
      return;
    }

    if (markers.length === 1) {
      map.setView(markerPosition(markers[0]), SINGLE_MARKER_ZOOM, { animate: true });
      return;
    }

    const bounds = latLngBounds(markers.map(markerPosition));
    map.fitBounds(bounds, {
      animate: true,
      maxZoom: SINGLE_MARKER_ZOOM,
      padding: [32, 32]
    });
  }, [map, markers]);

  return null;
}

export default function LeafletMapView({
  markers,
  onMarkerSelect,
  onTileError
}: LeafletMapViewProps) {
  const markerIcons = useMemo(
    () => ({
      new: createStatusIcon("new"),
      active: createStatusIcon("active"),
      needs_review: createStatusIcon("needs_review"),
      closed: createStatusIcon("closed")
    }),
    []
  );

  return (
    <MapContainer
      center={DEFAULT_MAP_CENTER}
      className="map-canvas-leaflet"
      scrollWheelZoom
      zoom={DEFAULT_ZOOM}
      zoomControl
    >
      <TileLayer
        attribution={OSM_ATTRIBUTION}
        eventHandlers={{ tileerror: onTileError }}
        url={OSM_TILE_URL}
      />
      <MapViewportController markers={markers} />
      {markers.map((item) => (
        <Marker
          eventHandlers={{ click: () => onMarkerSelect(item.point.id) }}
          icon={markerIcons[item.point.status]}
          key={item.point.id}
          position={markerPosition(item)}
          title={`${item.point.brand}: ${item.point.address}`}
        />
      ))}
    </MapContainer>
  );
}
