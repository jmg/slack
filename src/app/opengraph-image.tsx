import { ImageResponse } from "next/og";
import { BRAND, BRAND_TAGLINE, BRAND_DOMAIN } from "@/lib/brand";
import { TEAM_PRICE_USD } from "@/lib/plans";

export const runtime = "edge";
export const alt = `${BRAND} — ${BRAND_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social-share card (og:image + twitter:image) for the whole site.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              width: "88px",
              height: "88px",
              borderRadius: "20px",
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "52px",
            }}
          >
            💬
          </div>
          <div style={{ fontSize: "64px", fontWeight: 800 }}>{BRAND}</div>
        </div>
        <div style={{ fontSize: "76px", fontWeight: 800, marginTop: "48px", lineHeight: 1.05 }}>
          {BRAND_TAGLINE}
        </div>
        <div style={{ fontSize: "34px", opacity: 0.9, marginTop: "28px" }}>
          Team chat for ${TEAM_PRICE_USD}/user — a fraction of Slack.
        </div>
        <div style={{ fontSize: "30px", opacity: 0.7, marginTop: "48px" }}>{BRAND_DOMAIN}</div>
      </div>
    ),
    { ...size },
  );
}
