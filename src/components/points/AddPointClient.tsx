"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Save } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { suggestAddresses } from "@/lib/api/address-api";
import type { AddressSuggestion } from "@/lib/api/address-types";
import { BRAND_OPTIONS, getStoredBrand, type BrandId } from "@/lib/brands";
import { parsePointCoordinatesText } from "@/lib/points/coordinates";
import { createPointLocal } from "@/lib/sync/local-actions";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/combobox";
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
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isAddressComboboxOpen, setIsAddressComboboxOpen] = useState(false);
  const [isSuggestingAddress, setIsSuggestingAddress] = useState(false);
  const [addressSuggestionError, setAddressSuggestionError] = useState<string | null>(null);
  const [isAddressSuggestEnabled, setIsAddressSuggestEnabled] = useState(true);
  const [comment, setComment] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addressSuggestRequestId = useRef(0);

  const resetStatus = () => {
    setStatus(null);
    setError(null);
  };

  const resetAddressSuggestions = () => {
    addressSuggestRequestId.current += 1;
    setAddressSuggestions([]);
    setAddressSuggestionError(null);
    setIsSuggestingAddress(false);
    setIsAddressComboboxOpen(false);
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
      resetAddressSuggestions();
      setComment("");
      setCoordinates("");
      setStatus("Сохранено на устройстве.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить ПВЗ.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setIsAddressSuggestEnabled(true);
    addressSuggestRequestId.current += 1;
    setAddressSuggestions([]);
    setAddressSuggestionError(null);
  };

  const handleSelectAddressSuggestion = (suggestion: AddressSuggestion | null) => {
    if (!suggestion) {
      return;
    }

    setIsAddressSuggestEnabled(false);
    if (suggestion.city) {
      setCity(suggestion.city);
    }
    setAddress(suggestion.address);
    setIsAddressComboboxOpen(false);
    setAddressSuggestions([]);
    setAddressSuggestionError(null);
    if (suggestion.lat !== null && suggestion.lon !== null) {
      setCoordinates(`${suggestion.lat}, ${suggestion.lon}`);
    } else {
      setCoordinates("");
    }
  };

  useEffect(() => {
    const query = address.trim();
    const requestId = addressSuggestRequestId.current + 1;
    addressSuggestRequestId.current = requestId;

    if (!isAddressSuggestEnabled || query.length < 3) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSuggestingAddress(true);
      setAddressSuggestionError(null);

      void suggestAddresses({ query, city: city.trim() || undefined })
        .then((response) => {
          if (addressSuggestRequestId.current !== requestId) {
            return;
          }
          setAddressSuggestions(response.suggestions);
          setIsAddressComboboxOpen(response.suggestions.length > 0);
        })
        .catch((caught: unknown) => {
          if (addressSuggestRequestId.current !== requestId) {
            return;
          }
          setAddressSuggestions([]);
          setIsAddressComboboxOpen(false);
          setAddressSuggestionError(
            caught instanceof ApiError && caught.code === "dadata_not_configured"
              ? "Подсказки адресов не настроены, можно ввести адрес вручную."
              : "Подсказки временно недоступны, можно ввести адрес вручную."
          );
        })
        .finally(() => {
          if (addressSuggestRequestId.current === requestId) {
            setIsSuggestingAddress(false);
          }
        });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [address, city, isAddressSuggestEnabled]);

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
          <Combobox<AddressSuggestion>
            open={isAddressComboboxOpen}
            onOpenChange={(open) => setIsAddressComboboxOpen(open)}
            items={addressSuggestions}
            filteredItems={addressSuggestions}
            filter={null}
            inputValue={address}
            itemToStringValue={(suggestion) => suggestion.unrestrictedValue}
            itemToStringLabel={(suggestion) => suggestion.value}
            onInputValueChange={(value, details) => {
              if (details.reason === "input-change" || details.reason === "input-clear") {
                handleAddressChange(value);
              }
            }}
            onValueChange={(value) => handleSelectAddressSuggestion(value)}
          >
            <ComboboxInput
              id="address"
              name="address"
              placeholder="Улица и дом"
              autoComplete="street-address"
              aria-describedby="address-suggest-status"
              className="min-h-12"
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>
                {isSuggestingAddress ? "Ищу адрес..." : "Нет подсказок"}
              </ComboboxEmpty>
              <ComboboxList>
                {(suggestion: AddressSuggestion) => (
                  <ComboboxItem
                    key={suggestion.unrestrictedValue}
                    value={suggestion}
                    className="address-suggestion-item"
                  >
                    <MapPin size={18} aria-hidden="true" />
                    <span>
                      <strong>{suggestion.value}</strong>
                      <small>
                        {suggestion.lat !== null && suggestion.lon !== null
                          ? "Координаты предложены DaData, проверьте при необходимости"
                          : "Координат нет, можно добавить вручную"}
                      </small>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <p className="field-hint" id="address-suggest-status" aria-live="polite">
            {isSuggestingAddress ? "Ищу адрес..." : addressSuggestionError}
          </p>
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
