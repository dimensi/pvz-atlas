"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { BRAND_OPTIONS, getStoredBrand, type BrandId } from "@/lib/brands";
import { parsePointCoordinatesText } from "@/lib/points/coordinates";
import { createPointLocal } from "@/lib/sync/local-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export default function AddPointClient() {
  const [brand, setBrand] = useState<BrandId>("ozon");
  const [city, setCity] = useState("Видное");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetStatus = () => {
    setStatus(null);
    setError(null);
  };

  const validateRequiredFields = (): boolean => {
    if (!city.trim() || !address.trim()) {
      setError("Заполните город и адрес.");
      return false;
    }

    return true;
  };

  const handleSave = async (mode: "close" | "again") => {
    resetStatus();
    if (!validateRequiredFields()) {
      return;
    }

    const parsedCoordinates = parsePointCoordinatesText(coordinates);
    if (!parsedCoordinates.ok) {
      setError(parsedCoordinates.message);
      return;
    }

    try {
      setIsSaving(true);
      await createPointLocal({
        brand: getStoredBrand(brand),
        city: city.trim(),
        address: address.trim(),
        lat: parsedCoordinates.coordinates?.lat ?? null,
        lon: parsedCoordinates.coordinates?.lon ?? null,
        comment: comment.trim() || null
      });
      if (mode === "close") {
        setBrand("ozon");
        setCity("Видное");
      }
      setAddress("");
      setComment("");
      setCoordinates("");
      setStatus("Сохранено на устройстве.");
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
        <p className="lead">Новая точка сохранится на устройстве и будет отправлена при сети.</p>
      </section>

      <form className="card form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="brand">Бренд</label>
          <Select value={brand} onValueChange={(value) => setBrand(value as BrandId)}>
            <SelectTrigger id="brand" className="w-full min-h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_OPTIONS.map((brandOption) => (
                <SelectItem key={brandOption.id} value={brandOption.id}>
                  {brandOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            autoComplete="street-address"
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
        <div className="field">
          <label htmlFor="coordinates">Координаты</label>
          <input
            id="coordinates"
            inputMode="text"
            name="coordinates"
            placeholder="55.123, 37.123 или ссылка из карт"
            value={coordinates}
            onChange={(event) => setCoordinates(event.target.value)}
          />
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
        {status ? <p>{status}</p> : null}
        <div className="action-row">
          <button
            className="button"
            type="button"
            onClick={() => void handleSave("close")}
            disabled={isSaving}
          >
            <Save size={18} aria-hidden="true" />
            {isSaving ? "Сохраняю..." : "Сохранить"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => void handleSave("again")}
            disabled={isSaving}
          >
            <Save size={18} aria-hidden="true" />
            Сохранить и добавить еще
          </button>
        </div>
      </form>
    </div>
  );
}
