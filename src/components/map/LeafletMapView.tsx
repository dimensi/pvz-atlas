"use client";

import { useEffect, useMemo } from "react";
import { divIcon, latLngBounds, type LatLngExpression, type Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { getBrandLabel } from "@/lib/brands";
import { getMapMarkerClassName, getMapMarkerHtml } from "@/lib/map/marker-style";
import type { MappablePointItem, MapMarkerCluster } from "@/lib/map/points";
import { POINT_STATUS_LABELS } from "@/lib/points/list";

interface LeafletMapViewProps {
  markerClusters: MapMarkerCluster[];
  onMarkerSelect: (pointId: string) => void;
  onClusterSelect: (clusterId: string) => void;
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

function createClusterIcon(cluster: MapMarkerCluster) {
  return divIcon({
    className: "map-marker-cluster",
    html: `<span class="map-marker-cluster-count">${cluster.items.length}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function clusterPosition(cluster: MapMarkerCluster): LatLngExpression {
  return [cluster.coordinates.lat, cluster.coordinates.lon];
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
  onClusterSelect,
  onMarkerSelect,
  onTileError
}: LeafletMapViewProps) {
  const markerIcons = useMemo(() => {
    const iconsByPointId = new Map<string, ReturnType<typeof createBrandIcon>>();

    for (const cluster of markerClusters) {
      if (cluster.items.length === 1) {
        const item = cluster.items[0];
        iconsByPointId.set(item.point.id, createBrandIcon(item));
      }
    }

    return iconsByPointId;
  }, [markerClusters]);

  const clusterIcons = useMemo(() => {
    const iconsByClusterId = new Map<string, ReturnType<typeof createClusterIcon>>();

    for (const cluster of markerClusters) {
      if (cluster.items.length > 1) {
        iconsByClusterId.set(cluster.id, createClusterIcon(cluster));
      }
    }

    return iconsByClusterId;
  }, [markerClusters]);

  const setMarkerAccessibility = (marker: LeafletMarker, label: string, onSelect: () => void) => {
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
      <MapViewportController clusters={markerClusters} />
      {markerClusters.map((cluster) => {
        if (cluster.items.length > 1) {
          const label = `${cluster.items.length} ПВЗ в одной точке`;

          return (
            <Marker
              eventHandlers={{
                add: (event) =>
                  setMarkerAccessibility(event.target as LeafletMarker, label, () =>
                    onClusterSelect(cluster.id)
                  ),
                click: () => onClusterSelect(cluster.id)
              }}
              icon={clusterIcons.get(cluster.id)}
              key={cluster.id}
              position={clusterPosition(cluster)}
              title={label}
            />
          );
        }

        const item = cluster.items[0];
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
            position={markerPosition(item)}
            title={`${getBrandLabel(item.point.brand)}: ${item.point.address}`}
          />
        );
      })}
    </MapContainer>
  );
}
