"use client";

import { useState } from "react";
import { MapPin, Save } from "lucide-react";
import { geocodeAddress } from "@/lib/api/geocode-api";
import { createPointLocal } from "@/lib/sync/local-actions";

interface Coordinates {
  lat: number;
  lon: number;
}

export default function AddPointClient() {
  const [brand, setBrand] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetStatus = () => {
    setStatus(null);
    setError(null);
  };

  const validateRequiredFields = (): boolean => {
    if (!brand.trim() || !city.trim() || !address.trim()) {
      setError("Заполните бренд, город и адрес.");
      return false;
    }

    return true;
  };

  const handleGeocode = async () => {
    resetStatus();
    if (!validateRequiredFields()) {
      return;
    }

    try {
      setIsGeocoding(true);
      const result = await geocodeAddress({
        city: city.trim(),
        address: address.trim()
      });
      setCoordinates(result.coordinates);
      setStatus(
        result.coordinates
          ? "Координаты сохранены для локальной точки."
          : result.warnings?.[0] ?? "Координаты не найдены."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Геокодирование не выполнено.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSave = async () => {
    resetStatus();
    if (!validateRequiredFields()) {
      return;
    }

    try {
      setIsSaving(true);
      await createPointLocal({
        brand: brand.trim(),
        city: city.trim(),
        address: address.trim(),
        lat: coordinates?.lat ?? null,
        lon: coordinates?.lon ?? null,
        comment: comment.trim() || null
      });
      setBrand("");
      setCity("");
      setAddress("");
      setComment("");
      setCoordinates(null);
      setStatus("ПВЗ сохранен локально и добавлен в очередь синхронизации.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить ПВЗ.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Добавить ПВЗ</h2>
        <p className="lead">
          Новая точка сначала сохранится локально, а затем попадет в очередь
          синхронизации.
        </p>
      </section>

      <form className="card form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="brand">Бренд</label>
          <input
            id="brand"
            name="brand"
            placeholder="Ozon, WB, Яндекс"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="city">Город</label>
          <input
            id="city"
            name="city"
            placeholder="Город"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="address">Адрес</label>
          <input
            id="address"
            name="address"
            placeholder="Улица и дом"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="comment">Комментарий</label>
          <textarea
            id="comment"
            name="comment"
            placeholder="Приватная заметка"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
        {coordinates ? (
          <p className="lead">
            Координаты: {coordinates.lat}, {coordinates.lon}
          </p>
        ) : null}
        {error ? <div className="error-banner">{error}</div> : null}
        {status ? <p>{status}</p> : null}
        <div className="action-row">
          <button
            className="button secondary"
            type="button"
            onClick={handleGeocode}
            disabled={isGeocoding || isSaving}
          >
            <MapPin size={18} aria-hidden="true" />
            {isGeocoding ? "Ищу..." : "Геокодировать"}
          </button>
          <button
            className="button"
            type="button"
            onClick={handleSave}
            disabled={isSaving || isGeocoding}
          >
            <Save size={18} aria-hidden="true" />
            {isSaving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
