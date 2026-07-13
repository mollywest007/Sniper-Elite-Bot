import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSol, formatUsd, formatPercent, cn } from "@/lib/utils";
import { 
  ShoppingCart, 
  TrendingDown, 
  Crosshair, 
  Briefcase, 
  Wallet, 
  Copy, 
  Target, 
  Repeat, 
  Settings, 
  Zap, 
  Activity,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Search
} from "lucide-react";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-black italic tracking-wider uppercase text-foreground">
            Phase<span className="text-primary">Snipe</span>
          </h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-32 w-full bg-card border-border rounded-xl" />
          <Skeleton className="h-32 w-full bg-card border-border rounded-xl" />
          <Skeleton className="h-32 w-full bg-card border-border rounded-xl" />
          <Skeleton className="h-32 w-full bg-card border-border rounded-xl" />
        </div>
        <Skeleton className="h-[400px] w-full bg-card border-border rounded-xl" />
      </div>
    );
  }

  if (!dashboard) return null;

  const quickActions = [
    { href: "/wallets", label: "Wallets", icon: Wallet, desc: formatUsd(dashboard.walletBalanceUsdc) },
    { href: "/", label: "Refresh", icon: RefreshCw, desc: "Sync Data" },
    { href: "/snipe", label: "AI Sniper", icon: Crosshair, desc: "Auto Buy" },
    { href: "/copy-trade", label: "Copy Trade", icon: Copy, desc: "Mirror" },
    { href: "/buy", label: "Buy / Sell", icon: TrendingUp, desc: "Swap" },
    { href: "/portfolio", label: "Positions", icon: Briefcase, desc: dashboard.openPositionsCount + " Open" },
    { href: "/limit-orders", label: "Search", icon: Search, desc: "Tokens" },
    { href: "/settings", label: "Settings", icon: Settings, desc: "Config" },
    { href: "/portfolio", label: "Profits", icon: Activity, desc: formatPercent(dashboard.pnlTodayPercent) },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Hero Treatment matched to reference */}
      <Card className="hero-gradient corner-brackets relative overflow-hidden p-6 sm:p-8 rounded-xl border-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-3xl -z-10 rounded-full" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-10 relative">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-6 w-6 text-primary fill-primary" />
              <h1 className="text-3xl sm:text-4xl font-black italic tracking-widest text-foreground uppercase">
                Phase<span className="text-primary">Snipe</span>
              </h1>
            </div>
            <p className="text-primary font-bold text-sm tracking-widest uppercase">Lightning Fast Solana Terminal</p>
          </div>
          
          <div className="flex gap-6 items-center">
            <div className="text-right">
              <div className="text-[10px] text-primary/80 uppercase font-bold tracking-widest mb-1">Network Value</div>
              <div className="text-3xl font-black tracking-tight text-foreground flex items-baseline justify-end gap-1">
                {formatSol(dashboard.totalValueSol)}
                <span className="text-sm text-primary">SOL</span>
              </div>
            </div>
            <div className="hidden sm:block h-12 w-px bg-primary/20" />
            <div className="text-right">
              <div className="text-[10px] text-primary/80 uppercase font-bold tracking-widest mb-1">24h PnL</div>
              <div className={cn(
                "text-2xl font-black tracking-tight flex items-center justify-end gap-2",
                dashboard.pnlTodaySol >= 0 ? "text-primary" : "text-destructive"
              )}>
                {dashboard.pnlTodaySol >= 0 ? "+" : ""}{formatSol(dashboard.pnlTodaySol)}
                <span className="text-xs bg-background/50 px-2 py-0.5 rounded border border-current/20 font-bold">
                  {formatPercent(dashboard.pnlTodayPercent)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Grid of icon-led action tiles matched to reference */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9 gap-3 sm:gap-4">
        {quickActions.map((action, i) => (
          <Link key={i} href={action.href} className="col-span-1 h-full block">
            <Button 
              variant="outline" 
              className="w-full h-28 flex flex-col items-center justify-center gap-2 border-border/50 bg-card hover:border-primary/50 hover:bg-card/80 text-foreground transition-all group"
            >
              <div className="p-2 rounded-full bg-accent/50 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                <action.icon className="h-6 w-6 stroke-[1.5]" />
              </div>
              <div className="text-center w-full overflow-hidden">
                <div className="text-[11px] font-bold tracking-wider uppercase truncate">{action.label}</div>
                <div className="text-[9px]  text-muted-foreground truncate group-hover:text-primary/70">{action.desc}</div>
              </div>
            </Button>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-panel border-border/50 hover:border-border/80 transition-colors">
          <CardHeader className="p-5 border-b border-border bg-card/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Activity Log
              </CardTitle>
              <Link href="/portfolio" className="text-[10px] font-bold text-primary hover:underline flex items-center tracking-widest uppercase">
                View All <ChevronRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(dashboard.recentTrades?.length ?? 0) === 0 ? (
              <div className="p-10 text-center text-sm  text-muted-foreground">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent mb-4 border border-border">
                  <Activity className="h-5 w-5 opacity-50" />
                </div>
                <p>No trade activity detected.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dashboard.recentTrades.map((trade) => (
                  <div key={trade.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-accent/50 transition-colors group cursor-default">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-2.5 rounded-xl border",
                        trade.type === 'buy' ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"
                      )}>
                        {trade.type === 'buy' ? <ShoppingCart className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-foreground tracking-wide">{trade.tokenSymbol}</div>
                        <div className="text-[10px]  font-bold text-muted-foreground mt-0.5 uppercase">
                          {trade.type} • {new Date(trade.executedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className=" text-sm font-bold text-foreground">{formatSol(trade.amountSol)} SOL</div>
                      {trade.pnlPercent != null && trade.type === 'sell' && (
                        <div className={cn("text-xs  font-bold mt-0.5 flex justify-end", trade.pnlPercent >= 0 ? "text-primary" : "text-destructive")}>
                          {trade.pnlPercent >= 0 ? "+" : ""}{formatPercent(trade.pnlPercent)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Space for future charts or logs */}
        <Card className="glass-panel border-border/50 hover:border-border/80 transition-colors overflow-hidden relative">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
          <CardHeader className="p-5 border-b border-border bg-card/40">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" /> System Core
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
                  <span className="text-muted-foreground">RPC Latency</span>
                  <span className="text-primary">18ms (Optimal)</span>
                </div>
                <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-primary w-1/5 shadow-[0_0_10px_hsl(var(--primary))]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
                  <span className="text-muted-foreground">Solana Network</span>
                  <span className="text-primary">3,450 TPS</span>
                </div>
                <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-primary w-3/4 shadow-[0_0_10px_hsl(var(--primary))]" />
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Live Terminal</div>
                <div className="space-y-2  text-xs font-medium text-muted-foreground bg-background p-4 rounded-xl border border-border">
                  <div className="flex items-center gap-2"><span className="text-primary">❯</span> Connection verified via mainnet</div>
                  <div className="flex items-center gap-2"><span className="text-primary">❯</span> Awaiting next protocol directive</div>
                  <div className="flex items-center gap-2 text-foreground/50"><span className="animate-pulse">_</span></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
