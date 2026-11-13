import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { themeInitScript } from "@/lib/theme-init";
import "./globals.css";

/**
 * Editorial luxury pairing: Cormorant Garamond for display and Sora for UI/body.
 * Loaded through `next/font`, which self-hosts at build time.
 */
const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cinzel",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

/**
 * Brand metadata.
 *
 * Until this point a link shared to WhatsApp, Slack or LinkedIn rendered as a
 * bare URL with no image, no title and no description — the least premium thing
 * a luxury travel brand can do, and the one piece of the brand most people meet
 * before they ever reach the site.
 *
 * `metadataBase` is what makes the relative image paths below resolve to
 * absolute URLs. Without it Next emits a build warning and social crawlers,
 * which do not resolve relative paths, silently show nothing.
 *
 * The card itself is `src/app/opengraph-image.jpg`, picked up by filename
 * convention. Interior pages override it where they have something better —
 * an experience shares with its own photograph.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "La Vivenzia — Journeys Designed Around You",
    template: "%s · La Vivenzia",
  },
  description:
    "Curated experiences led by the people who know a place best. Every host verified, every listing reviewed.",
  applicationName: "La Vivenzia",
  keywords: [
    "curated experiences",
    "experiential travel",
    "verified hosts",
    "India travel",
    "La Vivenzia",
  ],
  openGraph: {
    type: "website",
    siteName: "La Vivenzia",
    title: "La Vivenzia — Journeys Designed Around You",
    description:
      "Curated experiences led by the people who know a place best. Every host verified, every listing reviewed.",
  },
  twitter: {
    card: "summary_large_image",
    title: "La Vivenzia — Journeys Designed Around You",
    description: "Experiences beyond destinations.",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

/**
 * The browser chrome colour, per theme.
 *
 * Matched to the two page grounds so the address bar on a phone continues the
 * page rather than framing it — a small thing that separates an application
 * from a website.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1611" },
  ],
};

/**
 * `suppressHydrationWarning` is required, not cosmetic.
 *
 * `themeInitScript` runs before paint and writes the `.dark` class and
 * `data-palette` onto <html> from stored preference, so the server-rendered
 * markup and the first client render legitimately disagree on those attributes.
 * Without this React logs a hydration mismatch for a difference that is the
 * whole point of the script — the alternative is a visible flash of the wrong
 * palette on every load.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${displayFont.variable} ${sora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg text-fg min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
