"use client";

import { useEffect, useMemo, useState } from "react";
import {
  divIcon,
  latLngBounds,
  point as leafletPoint,
  type LatLngExpression,
  type Marker as LeafletMarker
} from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { getBrandLabel } from "@/lib/brands";
import { getMapMarkerClassName, getMapMarkerHtml } from "@/lib/map/marker-style";
import type { MappablePointItem, MapMarkerCluster } from "@/lib/map/points";
import { POINT_STATUS_LABELS } from "@/lib/points/list";

interface LeafletMapViewProps {
  markerClusters: MapMarkerCluster[];
  onMarkerSelect: (pointId: string) => void;
  onTileError: () => void;
}

const DEFAULT_MAP_CENTER: LatLngExpression = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;
const SINGLE_MARKER_ZOOM = 15;
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function createBrandIcon(item: MappablePointItem) {
  return divIcon({
    className: getMapMarkerClassName(item.point.brand, item.point.status),
    html: getMapMarkerHtml(item.point.brand),
    iconSize: [24, 24],
    iconAnchor: [12, 24]
  });
}

type MarkerIconMap = Map<string, ReturnType<typeof createBrandIcon>>;

function clusterPosition(cluster: MapMarkerCluster): LatLngExpression {
  return [cluster.coordinates.lat, cluster.coordinates.lon];
}

function getSpreadOffset(index: number, count: number): { x: number; y: number } {
  if (count <= 1) {
    return { x: 0, y: 0 };
  }

  const radius = count === 2 ? 14 : count <= 4 ? 18 : count <= 8 ? 22 : 26;
  const angle = (Math.PI * 2 * index) / count;

  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius)
  };
}

function setMarkerAccessibility(marker: LeafletMarker, label: string, onSelect: () => void) {
  const element = marker.getElement();
  if (!element) {
    return;
  }

  element.setAttribute("aria-label", label);
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  });
}

function SpreadMarkers({
  markerClusters,
  markerIcons,
  onMarkerSelect
}: {
  markerClusters: MapMarkerCluster[];
  markerIcons: MarkerIconMap;
  onMarkerSelect: (pointId: string) => void;
}) {
  const map = useMap();
  const [, setViewRevision] = useState(0);
  useMapEvents({
    moveend: () => setViewRevision((revision) => revision + 1),
    zoomend: () => setViewRevision((revision) => revision + 1)
  });

  return markerClusters.flatMap((cluster) =>
    cluster.items.map((item, index) => {
      const offset = getSpreadOffset(index, cluster.items.length);
      const basePoint = map.latLngToLayerPoint([
        cluster.coordinates.lat,
        cluster.coordinates.lon
      ]);
      const shiftedPosition = map.layerPointToLatLng(
        basePoint.add(leafletPoint(offset.x, offset.y))
      );
      const label = `${getBrandLabel(item.point.brand)}: ${item.point.address}, ${POINT_STATUS_LABELS[item.point.status]}`;

      return (
        <Marker
          eventHandlers={{
            add: (event) =>
              setMarkerAccessibility(event.target as LeafletMarker, label, () =>
                onMarkerSelect(item.point.id)
              ),
            click: () => onMarkerSelect(item.point.id)
          }}
          icon={markerIcons.get(item.point.id)}
          key={item.point.id}
          position={shiftedPosition}
          title={`${getBrandLabel(item.point.brand)}: ${item.point.address}`}
        />
      );
    })
  );
}

function MapViewportController({ clusters }: { clusters: MapMarkerCluster[] }) {
  const map = useMap();

  useEffect(() => {
    if (clusters.length === 0) {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_ZOOM, { animate: true });
      return;
    }

    if (clusters.length === 1) {
      map.setView(clusterPosition(clusters[0]), SINGLE_MARKER_ZOOM, { animate: true });
      return;
    }

    const bounds = latLngBounds(clusters.map(clusterPosition));
    map.fitBounds(bounds, {
      animate: true,
      maxZoom: SINGLE_MARKER_ZOOM,
      padding: [24, 24]
    });
  }, [map, clusters]);

  return null;
}

export default function LeafletMapView({
  markerClusters,
  onMarkerSelect,
  onTileError
}: LeafletMapViewProps) {
  const markerIcons = useMemo(() => {
    const iconsByPointId = new Map<string, ReturnType<typeof createBrandIcon>>();

    for (const cluster of markerClusters) {
      for (const item of cluster.items) {
        iconsByPointId.set(item.point.id, createBrandIcon(item));
      }
    }

    return iconsByPointId;
  }, [markerClusters]);

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
      <MapViewportController clusters={markerClusters} />
      <SpreadMarkers
        markerClusters={markerClusters}
        markerIcons={markerIcons}
        onMarkerSelect={onMarkerSelect}
      />
    </MapContainer>
  );
}
