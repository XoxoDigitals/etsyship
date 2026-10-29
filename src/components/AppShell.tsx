"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

export interface StoreLite {
  id: string;
  name: string;
  platform: string;
  currency: string;
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", GBP: "£", EUR: "€" };

type IconName = "dashboard" | "listings" | "orders" | "analytics" | "stores" | "users" | "settings";

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    className: cn("h-[18px] w-[18px] shrink-0", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case "listings":
      return (
        <svg {...common}>
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V4a1 1 0 0 1 1-1h8.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8Z" />
          <circle cx="7.5" cy="7.5" r="1.3" />
        </svg>
      );
    case "orders":
      return (
        <svg {...common}>
          <path d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4Z" />
          <path d="M4 6h16" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 15l3-4 3 3 4-6" />
        </svg>
      );
    case "stores":
      return (
        <svg {...common}>
          <path d="M3 9 4.5 4h15L21 9" />
          <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
          <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
        </svg>
      );
  }
}

export function AppShell({
  stores,
  userName,
  children,
}: {
  stores: StoreLite[];
  userName?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const m = /\/stores\/([^/]+)/.exec(pathname || "");
  const activeStoreId = m?.[1];
  const activeStore = stores.find((s) => s.id === activeStoreId);

  const tabs: { href: string; label: string; icon: IconName; exact?: boolean }[] = activeStoreId
    ? [
        { href: `/stores/${activeStoreId}`, label: "Overview", icon: "dashboard", exact: true },
        { href: `/stores/${activeStoreId}/listings`, label: "Listings", icon: "listings" },
        { href: `/stores/${activeStoreId}/orders`, label: "Orders", icon: "orders" },
        { href: `/stores/${activeStoreId}/analytics`, label: "Analytics", icon: "analytics" },
      ]
    : [];

  const manage: { href: string; label: string; icon: IconName }[] = [
    { href: "/stores", label: "Stores", icon: "stores" },
    { href: "/users", label: "Users", icon: "users" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  const initial = (userName || "A").trim().charAt(0).toUpperCase();

  // Derive current section label for the top bar
  let currentSection = "Workspace";
  if (pathname?.startsWith("/users")) currentSection = "Team & Users";
  else if (pathname?.startsWith("/settings")) currentSection = "Settings";
  else if (pathname === "/stores") currentSection = "All Stores";
  else if (activeStore) {
    const activeTab = tabs.find((t) => (t.exact ? pathname === t.href : pathname?.startsWith(t.href)));
    currentSection = activeTab?.label || "Overview";
  }

  const navLink = (href: string, label: string, icon: IconName, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm shadow-brand-600/25"
          : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900"
      )}
    >
      <Icon name={icon} className={active ? "text-white" : "text-slate-400 transition group-hover:text-slate-600"} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-[1px_0_0_0_rgba(15,23,42,0.02)]">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 text-sm font-bold text-white shadow-md shadow-brand-600/25 ring-1 ring-inset ring-white/20 transition group-hover:scale-[1.02]">
              D
            </span>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-slate-900 leading-tight">Dropship Ops</p>
              <p className="text-[11px] font-medium text-slate-400">Commerce Suite</p>
            </div>
          </Link>
        </div>

        {/* Store Switcher */}
        <div className="px-3.5 pt-4 pb-2">
          <div className="flex items-center justify-between px-1.5 pb-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Store</label>
            <Link href="/stores" className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
              Manage
            </Link>
          </div>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-xl border border-slate-200/90 bg-slate-50/70 pl-3.5 pr-8 py-2.5 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition hover:border-slate-300 hover:bg-white focus:border-brand-500 focus:bg-white focus:ring-3 focus:ring-brand-500/15"
              value={activeStoreId || ""}
              onChange={(e) => {
                const id = e.target.value;
                if (id) router.push(`/stores/${id}`);
              }}
            >
              <option value="" disabled>
                Select a store…
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {CURRENCY_SYMBOL[s.currency] || s.currency}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-2 flex-1 space-y-6 overflow-y-auto px-3.5 py-2">
          {tabs.length > 0 && (
            <div className="space-y-1">
              <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Store Operations
              </p>
              {tabs.map((t) =>
                navLink(t.href, t.label, t.icon, t.exact ? pathname === t.href : !!pathname?.startsWith(t.href))
              )}
            </div>
          )}

          <div className="space-y-1">
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Administration
            </p>
            {manage.map((t) => navLink(t.href, t.label, t.icon, pathname === t.href || !!pathname?.startsWith(`${t.href}/`)))}
          </div>
        </nav>

        {/* User Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 p-3.5">
          <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-indigo-100 text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-500/20">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{userName || "Account"}</p>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-[11px] font-medium text-slate-400 transition hover:text-rose-600"
              >
                Sign out →
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Glass Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/70 bg-white/80 px-8 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm">
            {activeStore ? (
              <>
                <Link href="/stores" className="font-medium text-slate-400 transition hover:text-slate-600">
                  Stores
                </Link>
                <span className="text-slate-300">/</span>
                <Link
                  href={`/stores/${activeStore.id}`}
                  className="font-semibold text-slate-800 transition hover:text-brand-600"
                >
                  {activeStore.name}
                </Link>
                <span className="text-slate-300">/</span>
                <span className="font-medium text-slate-500">{currentSection}</span>
              </>
            ) : (
              <>
                <span className="font-medium text-slate-400">Workspace</span>
                <span className="text-slate-300">/</span>
                <span className="font-semibold text-slate-800">{currentSection}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {activeStore && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {activeStore.platform} · {activeStore.currency}
                </span>
                <Link
                  href={`/stores/${activeStore.id}/orders/new`}
                  className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800"
                >
                  + New Order
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="flex-1">
          <div className="w-full px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
