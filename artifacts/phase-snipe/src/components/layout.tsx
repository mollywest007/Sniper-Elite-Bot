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
  Bell 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useListNotifications } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/buy", label: "Buy", icon: ShoppingCart },
  { href: "/sell", label: "Sell", icon: TrendingDown },
  { href: "/snipe", label: "Snipe", icon: Crosshair },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/copy-trade", label: "Copy Trade", icon: Copy },
  { href: "/limit-orders", label: "Limit Orders", icon: Target },
  { href: "/dca", label: "DCA", icon: Repeat },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: notifications } = useListNotifications();
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Crosshair className="h-6 w-6" />
            <span className="font-bold tracking-wider uppercase text-lg">Phase Snipe</span>
          </div>
          <Link href="/notifications" className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-primary/10 text-primary" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-sidebar/80 backdrop-blur-sm shrink-0 z-10">
          <div className="flex items-center gap-2 text-primary">
            <Crosshair className="h-5 w-5" />
            <span className="font-bold tracking-wider uppercase text-base">Phase Snipe</span>
          </div>
          <Link href="/notifications" className="relative p-2 text-muted-foreground hover:text-foreground">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-sidebar/95 backdrop-blur-md pb-safe z-50 flex items-center justify-around px-2 py-2">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-md min-w-[64px]",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
