"use client";

import { IMaskInput } from "react-imask";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface OwnerPhoneInputProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}

export function normalizeRussianPhoneForMask(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }

  return value;
}

function prepareRussianPhoneInput(appended: string, masked: { value?: string }): string {
  const normalized = normalizeRussianPhoneForMask(appended);
  if (normalized !== appended) {
    return normalized;
  }

  if (!masked.value && appended === "8") {
    return "+7";
  }

  return appended;
}

export function OwnerPhoneInput({ id, onValueChange, value }: OwnerPhoneInputProps) {
  const trimmedValue = value.trim();
  const shouldUseRussianMask =
    trimmedValue === "" ||
    trimmedValue.startsWith("+7") ||
    trimmedValue.startsWith("7") ||
    trimmedValue.startsWith("8");

  if (!shouldUseRussianMask) {
    return (
      <Input
        id={id}
        inputMode="tel"
        placeholder="+7 (999) 123-45-67"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  }

  return (
    <IMaskInput
      id={id}
      data-slot="input"
      inputMode="tel"
      mask="+{7} (000) 000-00-00"
      placeholder="+7 (999) 123-45-67"
      prepare={prepareRussianPhoneInput}
      value={normalizeRussianPhoneForMask(value)}
      unmask={false}
      onAccept={(nextValue) => onValueChange(String(nextValue))}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      )}
    />
  );
}
