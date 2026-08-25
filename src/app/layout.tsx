import type { Metadata } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import "./globals.css";

/**
 * The pairing DESIGN.md §6 asks for: a classical high-contrast serif for
 * display, a modern sans for everything a user has to read closely.
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
  weight: ["400", "500", "600"],
  variable: "--font-cinzel",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "La Vivenzia",
    template: "%s · La Vivenzia",
  },
  description: "Curated experiential tourism marketplace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${montserrat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
