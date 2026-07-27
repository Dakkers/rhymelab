import type { ReactNode } from "react";
import { Link as RouterLink } from "@tanstack/react-router";

/**
 * The black app bar. The brand sits left; `context` (e.g. the "Analyzing …"
 * label on the workbench) and the nav sit right. Rendered per-page rather than
 * by the layout so each page can supply its own `context`.
 */
export function TopBar({ context }: { context?: ReactNode }) {
  return (
    <header className="rl-topbar">
      <RouterLink to="/library" className="rl-brand" aria-label="RhymeLab — go to library">
        <span className="rl-brand-dot" aria-hidden />
        <span className="rl-brand-name">RhymeLab</span>
        <span className="rl-chip-beta">Alpha</span>
      </RouterLink>

      <div className="rl-topbar-right">
        {context}
        <nav className="rl-topnav">
          <RouterLink to="/library">Library</RouterLink>
          {/* preload=false so a hover-preload of the logout route doesn't sign out. */}
          <RouterLink to="/auth/logout" preload={false}>
            Log out
          </RouterLink>
        </nav>
      </div>
    </header>
  );
}
