import Link from "next/link";
import { Logo } from "@/components/Logo";
import { brand } from "@/data/content";

const footerNav = [
  {
    title: "The Curation",
    items: [
      { label: "The Collection", href: "/experiences" },
      { label: "Signature Journeys", href: "/journeys" },
      { label: "VivenIQ Concierge", href: "/viveniq" },
    ],
  },
  {
    title: "Patronage",
    items: [
      { label: "Patron Profile", href: "/profile" },
      { label: "Member Access", href: "/sign-in" },
      { label: "Join La Vivenzia", href: "/join" },
    ],
  },
  {
    title: "Pilot Corridor",
    items: [
      { label: "East Pune Curation", href: "/experiences" },
      { label: "Host Privileges", href: "/journeys" },
      { label: "Live Companion Map", href: "/journeys" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="mx-auto w-full max-w-[1440px] px-8 py-20 xl:px-12 3xl:max-w-[1680px]">
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-12 xl:col-span-5">
            <Logo className="h-11 max-w-[230px]" />
            <p className="mt-7 max-w-[36ch] text-[14.5px] leading-[1.7] font-light text-fg-muted">
              Choreographed multi-venue evenings and verified experiences across Pune — reserved in
              one touch with VIP privileges.
            </p>
          </div>

          {footerNav.map((col) => (
            <nav key={col.title} aria-label={col.title} className="col-span-6 sm:col-span-4 xl:col-span-2">
              <h2 className="font-sans text-[11px] font-medium tracking-[0.2em] text-fg-subtle uppercase">
                {col.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-[14px] font-light text-fg-muted transition-colors duration-300 hover:text-heading"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center gap-6 border-t border-line pt-10 lg:flex-row lg:justify-between">
          <p className="text-[10.5px] tracking-[0.26em] text-fg-subtle uppercase">
            Curate <span className="mx-2.5 text-accent">&middot;</span> Reserve
            <span className="mx-2.5 text-accent">&middot;</span> Experience
            <span className="mx-2.5 text-accent">&middot;</span> Belong
          </p>
          <p className="font-display text-[13px] text-fg-muted">{brand.tagline}</p>
          <p className="text-[12px] font-light text-fg-subtle">
            &copy; {new Date().getFullYear()} {brand.name}. Pune Pilot Corridor.
          </p>
        </div>
      </div>
    </footer>
  );
}
