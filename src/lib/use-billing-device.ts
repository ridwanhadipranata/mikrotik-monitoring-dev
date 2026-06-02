"use client";

import { useState, useEffect } from "react";

const DEVICE_KEY = "***";

function getSavedDevice(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(DEVICE_KEY) || "";
  } catch {
    return "";
  }
}

export function useBillingDevice() {
  const [device, setDeviceState] = useState<string>(getSavedDevice);

  const setDevice = (id: string) => {
    setDeviceState(id);
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {}
  };

  return { device, setDevice };
}
