import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7c3aed",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            width: 34,
            height: 44,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 6,
            background: "#ffffff",
            borderRadius: 8,
            padding: "8px 8px",
          }}
        >
          <div style={{ width: 18, height: 5, background: "#7c3aed", borderRadius: 3, display: "flex" }} />
          <div style={{ width: 12, height: 5, background: "#c4b5fd", borderRadius: 3, display: "flex" }} />
        </div>
      </div>
    ),
    size,
  );
}
