import type { Metadata, Viewport } from "next";
import { Cinzel, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { themeInitScript } from "@/lib/theme-init";
import "./globals.css";

/**
 * The pairing DESIGN.md §6 asks for: a classical high-contrast serif for
 * display, a modern sans for everything a user has to read closely.
 *
 * Cinzel and **Sora** are the approved faces, matching the founder-approved
 * references. Sora replaced Montserrat on 2026-09-08 — it is the body face in
 * the approved demo, and it carries the slightly wider, more geometric feel the
 * reference screens have at small sizes. Cinzel was already correct.
 *
 * Loaded through `next/font`, which self-hosts the files at build time. That is
 * not only a performance choice — no request leaves the browser for
 * fonts.googleapis.com, so the page does not disclose every visitor to a third
 * party and the layout does not wait on someone else's CDN.
 *
 * `display: swap` shows the fallback immediately rather than holding text
 * invisible while a font loads.
 */
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html lang="en" suppressHydrationWarning className={`${cinzel.variable} ${sora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg text-fg min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
