import Script from "next/script";

// GA4 (gtag.js). Server Component — the id is resolved at request time, so the
// prod container needs no build-time inlining. The measurement id defaults to
// the Talkaroo property (ids are public; see DevCloud GA account "Shopify
// Apps"/property 547394827) and can be overridden or disabled via
// GA_MEASUREMENT_ID (set it to "off" locally/CI to keep the property clean).
// Privacy: anonymize_ip + SameSite cookie flags — the network convention.
const GA_ID = process.env.GA_MEASUREMENT_ID ?? "G-0L4BSNM9TM";

export function GoogleAnalytics() {
  if (!GA_ID || !GA_ID.startsWith("G-")) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true, cookie_flags: 'SameSite=None;Secure' });`}
      </Script>
    </>
  );
}
