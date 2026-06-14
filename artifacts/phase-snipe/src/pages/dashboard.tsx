import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSol, formatUsd, formatPercent, cn } from "@/lib/utils";
import { ShoppingCart, TrendingDown, Crosshair, Briefcase, Wallet, Copy, Target, Repeat, Settings } from "lucide-react";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-mono tracking-tight">COMMAND CENTER</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
          <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
          <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
          <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
        </div>
        <Skeleton className="h-[400px] w-full bg-muted/50 rounded-md" />
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Command Center</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase font-mono tracking-wider">Total Value</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-mono font-bold text-foreground">{formatSol(dashboard.totalValueSol)} <span className="text-sm text-muted-foreground">SOL</span></div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase font-mono tracking-wider">24h PnL</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={cn(
              "text-2xl font-mono font-bold flex items-baseline gap-2",
              dashboard.pnlTodaySol >= 0 ? "text-primary" : "text-destructive"
            )}>
              {dashboard.pnlTodaySol >= 0 ? "+" : ""}{formatSol(dashboard.pnlTodaySol)}
              <span className="text-sm opacity-80">{formatPercent(dashboard.pnlTodayPercent)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase font-mono tracking-wider">Wallet Balance</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-mono font-bold">{formatSol(dashboard.walletBalanceSol)} <span className="text-xs text-muted-foreground">SOL</span></div>
            <div className="text-sm font-mono text-muted-foreground mt-1">{formatUsd(dashboard.walletBalanceUsdc)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase font-mono tracking-wider">Active Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 grid grid-cols-2 gap-2 text-sm font-mono">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Snipers</span>
              <span className="text-amber-500 font-bold">{dashboard.activeSnipersCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Positions</span>
              <span className="text-foreground font-bold">{dashboard.openPositionsCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border col-span-2 md:col-span-4">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase font-mono tracking-wider">Monthly Users</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex items-baseline gap-3">
            <div className="text-3xl font-mono font-bold text-primary">
              {(dashboard as any).monthlyUsers?.toLocaleString() ?? 931}
            </div>
            <span className="text-sm text-muted-foreground font-mono">active in last 30 days</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Link href="/buy" className="col-span-1">
          <Button variant="outline" className="w-full h-16 flex flex-col items-center justify-center gap-1 border-primary/20 hover:border-primary/50 hover:bg-primary/10 text-primary transition-all">
            <ShoppingCart className="h-5 w-5" />
            <span className="text-xs font-mono">Buy</span>
          </Button>
        </Link>
        <Link href="/sell" className="col-span-1">
          <Button variant="outline" className="w-full h-16 flex flex-col items-center justify-center gap-1 border-destructive/20 hover:border-destructive/50 hover:bg-destructive/10 text-destructive transition-all">
            <TrendingDown className="h-5 w-5" />
            <span className="text-xs font-mono">Sell</span>
          </Button>
        </Link>
        <Link href="/snipe" className="col-span-1">
          <Button variant="outline" className="w-full h-16 flex flex-col items-center justify-center gap-1 border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/10 text-amber-500 transition-all">
            <Crosshair className="h-5 w-5" />
            <span className="text-xs font-mono">Snipe</span>
          </Button>
        </Link>
        <Link href="/portfolio" className="col-span-1 hidden md:flex">
          <Button variant="outline" className="w-full h-16 flex flex-col items-center justify-center gap-1 bg-card/50">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-mono">Portfolio</span>
          </Button>
        </Link>
        <Link href="/wallets" className="col-span-1 hidden md:flex">
          <Button variant="outline" className="w-full h-16 flex flex-col items-center justify-center gap-1 bg-card/50">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-mono">Wallets</span>
          </Button>
        </Link>
        <Link href="/settings" className="col-span-1 hidden md:flex">
          <Button variant="outline" className="w-full h-16 flex flex-col items-center justify-center gap-1 bg-card/50">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-mono">Settings</span>
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/30 border-border">
          <CardHeader className="p-4 border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Recent Trades</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(dashboard.recentTrades?.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-sm font-mono text-muted-foreground">
                No recent trades
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {dashboard.recentTrades.map((trade) => (
                  <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-full",
                        trade.type === 'buy' ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      )}>
                        {trade.type === 'buy' ? <ShoppingCart className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-mono font-bold text-sm">{trade.tokenSymbol}</div>
                        <div className="text-xs font-mono text-muted-foreground">{new Date(trade.executedAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold">{formatSol(trade.amountSol)} SOL</div>
                      {trade.pnlPercent != null && trade.type === 'sell' && (
                        <div className={cn("text-xs font-mono", trade.pnlPercent >= 0 ? "text-primary" : "text-destructive")}>
                          {formatPercent(trade.pnlPercent)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
