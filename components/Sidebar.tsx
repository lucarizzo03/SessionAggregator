"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

// Client component: active-link highlighting needs the current pathname,
// which isn't available to a Server Component without threading it down
// manually. Kept as the one nav-only client boundary so every page under it
// stays a Server Component.
export function Sidebar() {
  const pathname = usePathname();
  const sessionsActive = pathname === "/" || pathname.startsWith("/sessions");

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.eyebrow}>Tavus</span>
        <span className={styles.name}>Session Aggregator</span>
      </div>
      <nav className={styles.nav}>
        <Link href="/" className={sessionsActive ? styles.linkActive : styles.link}>
          Sessions
        </Link>
        {/* Aggregate ships in Phase 2 — kept as a non-interactive nav item
            so the sidebar reflects the intended product shape rather than
            omitting a route that's already spec'd. */}
        <span className={styles.linkDisabled}>
          Aggregate
          <span className={styles.soon}>Soon</span>
        </span>
      </nav>
    </aside>
  );
}
