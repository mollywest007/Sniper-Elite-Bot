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
  Zap,
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
            <div className="p-2 bg-primary/10 rounded-md border border-primary/30">
              <Zap className="h-5 w-5 stroke-[2] fill-primary/20" />
            </div>
            <span className="font-bold  tracking-widest uppercase text-xl text-glow italic">Phase</span>
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
                  "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-bold tracking-wide transition-all group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_-3px_hsl(var(--primary)/0.4)]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 stroke-[2] transition-colors",
                    isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className={cn(isActive ? "uppercase tracking-widest text-[13px]" : "")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-[10px]  text-primary/70 uppercase tracking-widest flex items-center justify-center gap-2">
          <Zap className="h-3 w-3 fill-primary/50" /> System Online
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        {/* Top Bar (Mobile + Back Button) */}
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border glass-panel shrink-0 z-10 min-h-[64px]">
          {!isRoot ? (
            <button
              onClick={goBack}
              className="flex items-center gap-2 text-xs  font-bold tracking-widest text-muted-foreground hover:text-primary transition-colors rounded-md px-3 py-2 hover:bg-primary/10 border border-transparent hover:border-primary/20 uppercase"
            >
              <ChevronLeft className="h-4 w-4" />
              Return
            </button>
          ) : (
            <div className="md:hidden flex items-center gap-2 text-primary">
              <Zap className="h-5 w-5 stroke-[2] fill-primary/20" />
              <span className="font-bold  tracking-widest uppercase text-base text-glow italic">Phase</span>
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

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 relative bg-gradient-to-b from-background to-background/95">
          {/* subtle radial gradient overlay for depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/10 via-background/0 to-background/0 pointer-events-none -z-10" />
          <div className="w-full max-w-7xl mx-auto h-full">{children}</div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-xl pb-safe z-50 flex items-center justify-around px-2 py-2">
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
                  "flex flex-col items-center gap-1 p-2 rounded-md min-w-[60px] transition-colors relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && <div className="absolute top-0 w-8 h-1 rounded-b-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />}
                <Icon className={cn("h-5 w-5 stroke-[2]", isActive ? "mt-1" : "")} />
                <span className="text-[9px] font-bold tracking-wider uppercase mt-0.5">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
