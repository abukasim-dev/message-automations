import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/client/components/AppShell";

const LINKS = [
  { to: "/", label: "Automations", exact: true },
  { to: "/inbox", label: "Inbox" },
  { to: "/contacts", label: "Contacts" },
  { to: "/broadcasts", label: "Broadcasts" },
  { to: "/preview", label: "Preview" },
  { to: "/settings", label: "Settings" },
] as const;

/** Every page's frame: the shell with the app's sections in its bar. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <AppShell
      nav={
        <nav className="-my-2 flex min-w-0 items-center gap-3 overflow-x-auto py-2 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: "exact" in link }}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children}
    </AppShell>
  );
}
