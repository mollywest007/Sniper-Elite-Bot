import { useListPositions, getListPositionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase } from "lucide-react";
import { formatSol, formatUsd, formatPercent, cn, truncateAddress } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Portfolio() {
  const { data: positions, isLoading } = useListPositions({ query: { queryKey: getListPositionsQueryKey() } });

  const totalValue = positions?.reduce((acc, pos) => acc + pos.valueSol, 0) || 0;
  const totalPnlSol = positions?.reduce((acc, pos) => acc + pos.pnlSol, 0) || 0;
  
  // Safe calculation for total pnl percent to avoid division by zero
  const totalEntryValue = totalValue - totalPnlSol;
  const totalPnlPercent = totalEntryValue > 0 ? (totalPnlSol / totalEntryValue) * 100 : 0;

  // Sort by PnL desc
  const sortedPositions = positions ? [...positions].sort((a, b) => b.pnlPercent - a.pnlPercent) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Portfolio</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border md:col-span-2">
          <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-1">Total Position Value</div>
              <div className="text-4xl font-mono font-bold text-foreground">
                {formatSol(totalValue)} <span className="text-lg text-muted-foreground">SOL</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-1">Total PnL</div>
              <div className={cn(
                "text-2xl font-mono font-bold flex items-baseline justify-end gap-2",
                totalPnlSol >= 0 ? "text-primary" : "text-destructive"
              )}>
                {totalPnlSol >= 0 ? "+" : ""}{formatSol(totalPnlSol)} SOL
                <span className="text-sm opacity-80 bg-background/50 px-2 py-0.5 rounded border border-current/20">
                  {formatPercent(totalPnlPercent)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border md:col-span-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-2">Open Positions</div>
            <div className="text-4xl font-mono font-bold">{positions?.length || 0}</div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Active Positions</h2>
        </div>
        
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full bg-muted/50 rounded-md" />
            <Skeleton className="h-16 w-full bg-muted/50 rounded-md" />
            <Skeleton className="h-16 w-full bg-muted/50 rounded-md" />
          </div>
        ) : sortedPositions.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded-md bg-card/10 flex flex-col items-center gap-4">
            <Briefcase className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <div className="font-mono font-bold">No open positions</div>
              <div className="text-sm font-mono text-muted-foreground mt-1">Execute a buy or arm a sniper to get started</div>
            </div>
            <Link href="/buy">
              <Button className="font-mono mt-2">Go to Buy</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedPositions.map((pos) => (
              <div 
                key={pos.id} 
                className="p-4 rounded-md border border-border bg-card/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-card/60 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-lg">{pos.tokenSymbol}</span>
                    <span className="text-xs text-muted-foreground font-mono bg-accent/50 px-2 py-0.5 rounded">
                      {truncateAddress(pos.contractAddress)}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {pos.amountTokens.toLocaleString()} tokens @ {formatSol(pos.entryPriceSol)} SOL
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground mt-1">
                    <span>MC: {formatUsd(pos.marketCapUsd)}</span>
                    <span>Liq: {formatUsd(pos.liquidityUsd)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 sm:w-1/2">
                  <div className="text-right">
                    <div className="text-xs font-mono uppercase text-muted-foreground">Current Value</div>
                    <div className="font-mono font-bold">{formatSol(pos.valueSol)} SOL</div>
                  </div>
                  
                  <div className="text-right min-w[80px]">
                    <div className="text-xs font-mono uppercase text-muted-foreground">PnL</div>
                    <div className={cn(
                      "font-mono font-bold text-sm",
                      pos.pnlPercent >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {formatPercent(pos.pnlPercent)}
                    </div>
                  </div>

                  <Link href="/sell">
                    <Button variant="outline" size="sm" className="font-mono text-xs h-8 ml-2 border-destructive/30 hover:border-destructive/60 hover:bg-destructive/10 text-destructive">
                      Sell
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
