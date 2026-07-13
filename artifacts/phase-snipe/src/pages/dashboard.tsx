import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSol, formatUsd, formatPercent, cn } from "@/lib/utils";
import { ShoppingCart, TrendingDown, Crosshair, Briefcase, Wallet, Settings, ArrowUpRight, Activity } from "lucide-react";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase">
          Command Center
        </h1>
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 uppercase flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary animate-pulse" />
          Command Center
        </h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <Card className="glass-panel glass-panel-hover">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">Total Value</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-3xl font-mono font-bold text-foreground">
              {formatSol(dashboard.totalValueSol)} <span className="text-sm text-primary opacity-80">SOL</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel glass-panel-hover relative overflow-hidden">
          <div className={cn("absolute top-0 right-0 w-16 h-16 blur-2xl -z-10 rounded-full", 
            dashboard.pnlTodaySol >= 0 ? "bg-success/20" : "bg-destructive/20"
          )} />
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">24h PnL</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className={cn(
              "text-3xl font-mono font-bold flex items-baseline gap-2",
              dashboard.pnlTodaySol >= 0 ? "text-success" : "text-destructive"
            )}>
              {dashboard.pnlTodaySol >= 0 ? "+" : ""}{formatSol(dashboard.pnlTodaySol)}
              <span className="text-sm opacity-80 bg-background/50 px-2 py-0.5 rounded border border-current/20">
                {formatPercent(dashboard.pnlTodayPercent)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel glass-panel-hover">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">Wallet Balance</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-2xl font-mono font-bold">{formatSol(dashboard.walletBalanceSol)} <span className="text-xs text-primary opacity-80">SOL</span></div>
            <div className="text-sm font-mono text-muted-foreground mt-1 tracking-wider">{formatUsd(dashboard.walletBalanceUsdc)}</div>
          </CardContent>
        </Card>

        <Card className="glass-panel glass-panel-hover">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">Active Operations</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 grid grid-cols-2 gap-4 text-sm font-mono">
            <div className="flex flex-col bg-background/50 p-2 rounded border border-border">
              <span className="text-muted-foreground text-[10px] uppercase">Snipers</span>
              <span className="text-primary font-bold text-lg">{dashboard.activeSnipersCount}</span>
            </div>
            <div className="flex flex-col bg-background/50 p-2 rounded border border-border">
              <span className="text-muted-foreground text-[10px] uppercase">Positions</span>
              <span className="text-foreground font-bold text-lg">{dashboard.openPositionsCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Link href="/buy" className="col-span-1">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-3 border-success/30 bg-success/5 hover:border-success hover:bg-success/10 text-success transition-all terminal-glow">
            <ShoppingCart className="h-6 w-6 stroke-[1.5]" />
            <span className="text-xs font-mono font-bold tracking-widest uppercase">Buy</span>
          </Button>
        </Link>
        <Link href="/sell" className="col-span-1">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-3 border-destructive/30 bg-destructive/5 hover:border-destructive hover:bg-destructive/10 text-destructive transition-all hover:shadow-[0_0_15px_-3px_hsl(var(--destructive)/0.3)]">
            <TrendingDown className="h-6 w-6 stroke-[1.5]" />
            <span className="text-xs font-mono font-bold tracking-widest uppercase">Sell</span>
          </Button>
        </Link>
        <Link href="/snipe" className="col-span-1 md:col-span-2">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-3 border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10 text-primary transition-all hover:shadow-[0_0_15px_-3px_hsl(var(--primary)/0.3)]">
            <Crosshair className="h-6 w-6 stroke-[1.5]" />
            <span className="text-xs font-mono font-bold tracking-widest uppercase">Sniper Hub</span>
          </Button>
        </Link>
        <Link href="/portfolio" className="col-span-1 hidden md:flex">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-3 glass-panel hover:bg-accent hover:text-foreground text-muted-foreground">
            <Briefcase className="h-6 w-6 stroke-[1.5]" />
            <span className="text-xs font-mono tracking-widest uppercase">Portfolio</span>
          </Button>
        </Link>
        <Link href="/wallets" className="col-span-1 hidden md:flex">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-3 glass-panel hover:bg-accent hover:text-foreground text-muted-foreground">
            <Wallet className="h-6 w-6 stroke-[1.5]" />
            <span className="text-xs font-mono tracking-widest uppercase">Wallets</span>
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-panel">
          <CardHeader className="p-5 border-b border-border bg-card/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Recent Trades
              </CardTitle>
              <Link href="/portfolio" className="text-[10px] font-mono text-primary hover:underline flex items-center">
                View All <ArrowUpRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(dashboard.recentTrades?.length ?? 0) === 0 ? (
              <div className="p-10 text-center text-sm font-mono text-muted-foreground">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent mb-4 border border-border">
                  <Activity className="h-5 w-5 opacity-50" />
                </div>
                <p>No trade activity detected.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dashboard.recentTrades.map((trade) => (
                  <div key={trade.id} className="p-5 flex items-center justify-between hover:bg-accent/50 transition-colors group cursor-default">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-2.5 rounded border",
                        trade.type === 'buy' ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"
                      )}>
                        {trade.type === 'buy' ? <ShoppingCart className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-mono font-bold text-sm text-foreground">{trade.tokenSymbol}</div>
                        <div className="text-xs font-mono text-muted-foreground mt-0.5">{new Date(trade.executedAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-foreground">{formatSol(trade.amountSol)} SOL</div>
                      {trade.pnlPercent != null && trade.type === 'sell' && (
                        <div className={cn("text-xs font-mono mt-0.5 font-medium flex justify-end", trade.pnlPercent >= 0 ? "text-success" : "text-destructive")}>
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
        <Card className="glass-panel overflow-hidden relative">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
          <CardHeader className="p-5 border-b border-border bg-card/50">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Network Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-muted-foreground uppercase">RPC Latency</span>
                  <span className="text-success">24ms (Optimal)</span>
                </div>
                <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-success w-1/5" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-muted-foreground uppercase">Solana Network</span>
                  <span className="text-primary">3,120 TPS</span>
                </div>
                <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border">
                  <div className="h-full bg-primary w-3/4" />
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">System Logs</div>
                <div className="space-y-2 font-mono text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-2"><span className="text-primary">→</span> Connected to mainnet-beta</div>
                  <div className="flex items-center gap-2"><span className="text-success">→</span> Wallet signatures verified</div>
                  <div className="flex items-center gap-2"><span className="text-primary">→</span> Listening for Jupiter AMM events</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
