"use client";

import { useEffect, useMemo } from "react";
import { divIcon, latLngBounds, type LatLngExpression, type Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { getBrandLabel } from "@/lib/brands";
import { getMapMarkerClassName, getMapMarkerHtml } from "@/lib/map/marker-style";
import type { MappablePointItem } from "@/lib/map/points";
import { POINT_STATUS_LABELS } from "@/lib/points/list";

interface LeafletMapViewProps {
  markers: MappablePointItem[];
  onMarkerSelect: (pointId: string) => void;
  onTileError: () => void;
}

const DEFAULT_MAP_CENTER: LatLngExpression = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;
const SINGLE_MARKER_ZOOM = 15;
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function markerPosition(item: MappablePointItem): LatLngExpression {
  return [item.coordinates.lat, item.coordinates.lon];
}

function createBrandIcon(item: MappablePointItem) {
  return divIcon({
    className: getMapMarkerClassName(item.point.brand, item.point.status),
    html: getMapMarkerHtml(item.point.brand),
    iconSize: [24, 24],
    iconAnchor: [12, 24]
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
      padding: [24, 24]
    });
  }, [map, markers]);

  return null;
}

export default function LeafletMapView({
  markers,
  onMarkerSelect,
  onTileError
}: LeafletMapViewProps) {
  const markerIcons = useMemo(() => {
    const iconsByPointId = new Map<string, ReturnType<typeof createBrandIcon>>();

    for (const item of markers) {
      iconsByPointId.set(item.point.id, createBrandIcon(item));
    }

    return iconsByPointId;
  }, [markers]);

  const setMarkerAccessibility = (
    marker: LeafletMarker,
    item: MappablePointItem
  ) => {
    const element = marker.getElement();
    if (!element) {
      return;
    }

    const label = `${getBrandLabel(item.point.brand)}: ${item.point.address}, ${POINT_STATUS_LABELS[item.point.status]}`;
    element.setAttribute("aria-label", label);
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onMarkerSelect(item.point.id);
      }
    });
  };

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
          eventHandlers={{
            add: (event) => setMarkerAccessibility(event.target as LeafletMarker, item),
            click: () => onMarkerSelect(item.point.id)
          }}
          icon={markerIcons.get(item.point.id)}
          key={item.point.id}
          position={markerPosition(item)}
          title={`${getBrandLabel(item.point.brand)}: ${item.point.address}`}
        />
      ))}
    </MapContainer>
  );
}
