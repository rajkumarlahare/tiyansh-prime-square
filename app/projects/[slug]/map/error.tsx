"use client";

import { useEffect } from "react";

export default function PublicGeoMapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public Geo map route runtime error", error);
  }, [error]);

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "#06101d",
        color: "#f7fbff",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        role="alert"
        style={{
          width: "min(520px, 100%)",
          display: "grid",
          gap: 10,
          padding: 18,
          border: "1px solid #35506f",
          borderRadius: 14,
          background: "#0a1828",
          boxShadow: "0 18px 50px rgba(0,0,0,.35)",
        }}
      >
        <strong>Satellite Map runtime error</strong>
        <span style={{ color: "#b9cbe0", fontSize: 13, lineHeight: 1.5 }}>
          Map safely stop hua hai; project data ya saved Geo alignment change nahi hua.
        </span>
        <span
          style={{
            color: "#8fa8c1",
            fontSize: 11,
            lineHeight: 1.45,
            overflowWrap: "anywhere",
          }}
        >
          Technical detail: {error.message || "Unknown client runtime error"}
        </span>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            justifySelf: "start",
            padding: "9px 12px",
            border: "1px solid #2c8f6b",
            borderRadius: 9,
            background: "#0f684b",
            color: "#effff8",
            fontWeight: 800,
          }}
        >
          Retry map
        </button>
      </section>
    </main>
  );
}
