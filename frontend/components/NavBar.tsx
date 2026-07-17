"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const link = (href: string, label: string) => (
    <Link href={href} className={isActive(href) ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <nav className="nav">
      <Link href="/dashboard" className="nav-brand">
        TaskFlow
      </Link>
      <div className="nav-links">
        {link("/dashboard", "Dashboard")}
        {link("/projects", "Projects")}
        {link("/assigned-to-me", "Assigned to Me")}
      </div>
      <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{user.name}</span>
      <button className="btn btn-secondary" onClick={() => logout()}>
        Log out
      </button>
    </nav>
  );
}
