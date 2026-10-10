"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: Record<string, unknown>,
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

// Renders the Cloudflare Turnstile widget when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set; renders nothing otherwise (local dev / pre-Turnstile deployment).
export default function TurnstileBox({
  onToken,
  resetKey,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const ready = useRef(false);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  const tryRender = () => {
    if (!SITE_KEY || !ready.current || !holder.current || widgetId.current !== null) return;
    if (!window.turnstile) return;
    widgetId.current = window.turnstile.render(holder.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => tokenRef.current(token),
      "expired-callback": () => tokenRef.current(""),
      theme: "light",
    });
  };

  useEffect(() => {
    tryRender();
  });

  useEffect(() => {
    // Bump resetKey to get a fresh token (they are single-use server-side).
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      tokenRef.current("");
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return (
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={() => {
        ready.current = true;
        tryRender();
      }}
    />
  );
}
