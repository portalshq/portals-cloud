import { ReactNode } from "react";

export function CTAButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="t-button min-w-220 w-fit inline-flex justify-center items-center rounded h-48 gap-x-9 px-12 border border-white/10 bg-white/8 text-white backdrop-blur-[12px] hover:backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30" href={href}>
      <span className="t-p-sans">{children}</span>
    </a>
  );
}