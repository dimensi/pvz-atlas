"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { parsePointCoordinateInputs } from "@/lib/points/coordinates";
import { createPointLocal } from "@/lib/sync/local-actions";

export default function AddPointClient() {
  const [brand, setBrand] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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

  const handleSave = async () => {
    resetStatus();
    if (!validateRequiredFields()) {
      return;
    }

    const parsedCoordinates = parsePointCoordinateInputs(lat, lon);
    if (!parsedCoordinates.ok) {
      setError(parsedCoordinates.message);
      return;
    }

    try {
      setIsSaving(true);
      await createPointLocal({
        brand: brand.trim(),
        city: city.trim(),
        address: address.trim(),
        lat: parsedCoordinates.coordinates?.lat ?? null,
        lon: parsedCoordinates.coordinates?.lon ?? null,
        comment: comment.trim() || null
      });
      setBrand("");
      setCity("");
      setAddress("");
      setComment("");
      setLat("");
      setLon("");
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
        <div className="form-grid-two">
          <div className="field">
            <label htmlFor="lat">Широта</label>
            <input
              id="lat"
              inputMode="decimal"
              name="lat"
              placeholder="55.751244"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lon">Долгота</label>
            <input
              id="lon"
              inputMode="decimal"
              name="lon"
              placeholder="37.618423"
              value={lon}
              onChange={(event) => setLon(event.target.value)}
            />
          </div>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
        {status ? <p>{status}</p> : null}
        <div className="action-row">
          <button
            className="button"
            type="button"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={18} aria-hidden="true" />
            {isSaving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
