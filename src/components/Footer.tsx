import Link from "next/link";
import { Logo } from "@/components/Logo";
import { brand, desktopNav } from "@/data/content";

const columns = [
  { title: "Explore", links: ["Destinations", "Experiences", "Stays", "Journal"] },
  { title: "Company", links: ["About", "Careers", "Press", "Contact"] },
  { title: "Support", links: ["Help Centre", "Travel Advice", "Privacy", "Terms"] },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="mx-auto w-full max-w-[1440px] px-8 py-20 xl:px-12 3xl:max-w-[1680px]">
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-12 xl:col-span-5">
            <Logo className="h-11 max-w-[230px]" />
            <p className="mt-7 max-w-[34ch] text-[14.5px] leading-[1.7] font-light text-fg-muted">
              Curated stays, unique experiences and intelligent planning — built for travellers who
              care how a journey feels, not only where it goes.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="col-span-4 xl:col-span-2">
              <h2 className="font-sans text-[11px] font-medium tracking-[0.2em] text-fg-subtle uppercase">
                {column.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {column.links.map((link) => (
                  <li key={link}>
                    <Link
                      href={desktopNav.find((n) => n.label === link)?.href ?? "/"}
                      className="text-[14px] font-light text-fg-muted transition-colors duration-300 hover:text-heading"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center gap-6 border-t border-line pt-10 lg:flex-row lg:justify-between">
          <p className="text-[10.5px] tracking-[0.26em] text-fg-subtle uppercase">
            Travel <span className="mx-2.5 text-accent">&middot;</span> Explore
            <span className="mx-2.5 text-accent">&middot;</span> Experience
            <span className="mx-2.5 text-accent">&middot;</span> Belong
          </p>
          <p className="font-display text-[13px] text-fg-muted">{brand.tagline}</p>
          <p className="text-[12px] font-light text-fg-subtle">
            &copy; {new Date().getFullYear()} {brand.name}. Visual demo.
          </p>
        </div>
      </div>
    </footer>
  );
}
