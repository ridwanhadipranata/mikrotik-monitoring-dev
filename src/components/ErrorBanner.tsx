"use client";

import { AlertCircle, X } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--red-soft)] text-[13px] text-[var(--red)] font-medium">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error" className="ml-2">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
