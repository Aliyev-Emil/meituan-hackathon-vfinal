"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/planner", label: "Planner" },
  { href: "/friends", label: "Friends" },
  { href: "/orders", label: "Orders" },
  { href: "/data", label: "Data" },
  { href: "/profile", label: "Profile" },
];

export default function Nav() {
  const path = usePathname();
  const isLanding = path === "/";

  return (
    <nav
      style={{
        background: "var(--meituan-yellow)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        position: isLanding ? "sticky" : undefined,
        top: isLanding ? 0 : undefined,
        zIndex: isLanding ? 50 : undefined,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 22 }}>
        <img src="/cultra-logo.svg" alt="" width={36} height={36} />
        Cultra
      </Link>
      <span style={{ fontSize: 13, color: "#333", opacity: 0.75 }}>AI Food Delivery</span>
      <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              fontWeight: 600,
              background: path === l.href ? "#fff" : "transparent",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
