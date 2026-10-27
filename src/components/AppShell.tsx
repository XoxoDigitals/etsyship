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

type IconName = "dashboard" | "listings" | "orders" | "analytics" | "stores" | "settings";

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    className: cn("h-[18px] w-[18px]", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
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
        { href: `/stores/${activeStoreId}`, label: "Dashboard", icon: "dashboard", exact: true },
        { href: `/stores/${activeStoreId}/listings`, label: "Listings", icon: "listings" },
        { href: `/stores/${activeStoreId}/orders`, label: "Orders", icon: "orders" },
        { href: `/stores/${activeStoreId}/analytics`, label: "Analytics", icon: "analytics" },
      ]
    : [];

  const manage: { href: string; label: string; icon: IconName }[] = [
    { href: "/stores", label: "Stores", icon: "stores" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  const initial = (userName || "A").trim().charAt(0).toUpperCase();

  const navLink = (href: string, label: string, icon: IconName, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <Icon name={icon} className={active ? "text-white" : "text-slate-400 group-hover:text-slate-500"} />
      {label}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm">
            D
          </span>
          <Link href="/" className="text-[15px] font-bold tracking-tight text-slate-900">
            Dropship Ops
          </Link>
        </div>

        <div className="px-3">
          <label className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Store</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
                {s.name} ({CURRENCY_SYMBOL[s.currency] || s.currency})
              </option>
            ))}
          </select>
        </div>

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {tabs.map((t) => navLink(t.href, t.label, t.icon, t.exact ? pathname === t.href : !!pathname?.startsWith(t.href)))}

          <div className="pt-5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Manage</p>
            {manage.map((t) => navLink(t.href, t.label, t.icon, pathname === t.href))}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">{userName || "Account"}</p>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-xs text-slate-400 transition hover:text-slate-600"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">
          {activeStore && (
            <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
              <span className="font-medium text-slate-500">{activeStore.name}</span>
              <span className="text-slate-300">·</span>
              <span>{activeStore.platform}</span>
              <span className="text-slate-300">·</span>
              <span>{activeStore.currency}</span>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
