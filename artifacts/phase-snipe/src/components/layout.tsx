import { Link, useLocation } from "wouter";
import {
  Home,
  ShoppingCart,
  TrendingDown,
  Crosshair,
  Briefcase,
  Wallet,
  Copy,
  Target,
  Repeat,
  Settings,
  Bell,
  ChevronLeft,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useListNotifications } from "@workspace/api-client-react";
import { useEffect } from "react";

const navItems = [
  { href: "/", label: "Command Center", icon: Home },
  { href: "/buy", label: "Buy Token", icon: ShoppingCart },
  { href: "/sell", label: "Sell Token", icon: TrendingDown },
  { href: "/snipe", label: "Sniper Hub", icon: Crosshair },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/copy-trade", label: "Copy Trade", icon: Copy },
  { href: "/limit-orders", label: "Limit Orders", icon: Target },
  { href: "/dca", label: "DCA", icon: Repeat },
  { href: "/settings", label: "Settings", icon: Settings },
];

const navHistory: string[] = [];
let suppressNextPush = false;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: notifications } = useListNotifications();
  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;
  const isRoot = location === "/";

  useEffect(() => {
    if (suppressNextPush) {
      suppressNextPush = false;
      return;
    }
    if (navHistory[navHistory.length - 1] !== location) {
      navHistory.push(location);
    }
  }, [location]);

  function goBack() {
    if (navHistory.length > 1) {
      navHistory.pop();
      const prev = navHistory[navHistory.length - 1];
      suppressNextPush = true;
      navigate(prev);
    } else {
      suppressNextPush = true;
      navigate("/");
    }
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] border-r border-border glass-panel shrink-0 relative z-20">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3 text-primary">
            <Terminal className="h-6 w-6 stroke-[1.5]" />
            <span className="font-bold font-mono tracking-widest uppercase text-lg text-glow">Phase</span>
          </div>
          <Link
            href="/notifications"
            className="relative p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-primary/10"
          >
            <Bell className="h-5 w-5 stroke-[1.5]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_5px_var(--primary)]" />
            )}
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-mono tracking-wide transition-all group",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[inset_4px_0_0_0_hsl(var(--primary))]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 stroke-[1.5] transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest text-center">
          Terminal Ready • v1.0.4
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        {/* Top Bar (Mobile + Back Button) */}
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border glass-panel shrink-0 z-10 min-h-[64px]">
          {!isRoot ? (
            <button
              onClick={goBack}
              className="flex items-center gap-2 text-xs font-mono font-medium text-muted-foreground hover:text-primary transition-colors rounded-md px-3 py-2 hover:bg-primary/10 border border-transparent hover:border-primary/20"
            >
              <ChevronLeft className="h-4 w-4" />
              BACK
            </button>
          ) : (
            <div className="md:hidden flex items-center gap-2 text-primary">
              <Terminal className="h-5 w-5 stroke-[1.5]" />
              <span className="font-bold font-mono tracking-widest uppercase text-base text-glow">Phase</span>
            </div>
          )}
          <div className="flex-1" />
          <Link
            href="/notifications"
            className="relative p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-primary/10 md:hidden"
          >
            <Bell className="h-5 w-5 stroke-[1.5]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_5px_var(--primary)]" />
            )}
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 md:pb-10 relative">
          {/* subtle radial gradient overlay for depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0 pointer-events-none -z-10" />
          <div className="w-full max-w-7xl mx-auto h-full">{children}</div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border glass-panel pb-safe z-50 flex items-center justify-around px-2 py-2">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-md min-w-[64px] transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 stroke-[1.5]" />
                <span className="text-[9px] font-mono tracking-wider uppercase">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
