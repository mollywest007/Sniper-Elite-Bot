import { useListPositions, getListPositionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, ArrowUpRight, ArrowDownRight, TrendingUp, Zap } from "lucide-react";
import { formatSol, formatUsd, formatPercent, cn, truncateAddress } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Portfolio() {
  const { data: positions, isLoading } = useListPositions({ query: { queryKey: getListPositionsQueryKey() } });

  const totalValue = positions?.reduce((acc, pos) => acc + pos.valueSol, 0) || 0;
  const totalPnlSol = positions?.reduce((acc, pos) => acc + pos.pnlSol, 0) || 0;
  
  const totalEntryValue = totalValue - totalPnlSol;
  const totalPnlPercent = totalEntryValue > 0 ? (totalPnlSol / totalEntryValue) * 100 : 0;

  const sortedPositions = positions ? [...positions].sort((a, b) => b.pnlPercent - a.pnlPercent) : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black italic tracking-widest text-foreground uppercase flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-primary" />
          Portfolio
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hero-gradient corner-brackets md:col-span-2 relative overflow-hidden border-none">
          <div className="absolute -right-10 -top-10 text-primary/10">
            <TrendingUp className="h-48 w-48" />
          </div>
          <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="z-10">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 mb-2">Total Position Value</div>
              <div className="text-5xl font-black tracking-tight text-foreground flex items-baseline gap-2">
                {formatSol(totalValue)} <span className="text-xl text-primary font-bold">SOL</span>
              </div>
            </div>
            <div className="text-right z-10 w-full md:w-auto">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 mb-2">Total Return</div>
              <div className={cn(
                "text-3xl font-black tracking-tight flex flex-row md:flex-col items-center md:items-end justify-between md:justify-end gap-2",
                totalPnlSol >= 0 ? "text-primary" : "text-destructive"
              )}>
                <div className="flex items-center gap-1">
                  {totalPnlSol >= 0 ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
                  {formatSol(Math.abs(totalPnlSol))} SOL
                </div>
                <span className="text-sm bg-background/50 px-3 py-1 rounded border border-current/20 font-bold">
                  {totalPnlSol >= 0 ? "+" : ""}{formatPercent(totalPnlPercent)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel md:col-span-1 flex flex-col justify-center p-8 border-border/50">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Active Positions</div>
          <div className="text-6xl font-black tracking-tight text-primary drop-shadow-[0_0_15px_rgba(57,255,20,0.3)]">{positions?.length || 0}</div>
          <div className="mt-6 pt-4 border-t border-border flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>Health</span>
            <span className="text-primary flex items-center gap-1"><Zap className="h-3 w-3 fill-current" /> Optimal</span>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pl-1">Holdings</h2>
        
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full bg-card border-border rounded-xl" />
            <Skeleton className="h-20 w-full bg-card border-border rounded-xl" />
            <Skeleton className="h-20 w-full bg-card border-border rounded-xl" />
          </div>
        ) : sortedPositions.length === 0 ? (
          <div className="p-16 text-center border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-5">
            <Briefcase className="h-16 w-16 text-muted-foreground/30" />
            <div>
              <div className="text-lg font-bold uppercase tracking-widest">No Active Holdings</div>
              <div className="text-sm text-muted-foreground mt-2 ">Execute a buy or arm a sniper to get started.</div>
            </div>
            <Link href="/buy">
              <Button className="font-bold text-sm tracking-widest uppercase h-12 px-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.4)]">Execute Buy</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedPositions.map((pos) => (
              <div 
                key={pos.id} 
                className="p-5 rounded-xl border border-border/50 bg-card/40 backdrop-blur flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:border-primary/30 transition-all group"
              >
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-2xl tracking-tight text-foreground">{pos.tokenSymbol}</span>
                    <span className="text-[10px] font-bold text-muted-foreground  bg-background px-2 py-1 rounded border border-border uppercase tracking-widest">
                      {truncateAddress(pos.contractAddress)}
                    </span>
                  </div>
                  <div className="text-xs  font-bold text-muted-foreground flex items-center gap-3">
                    <span className="bg-background px-2 py-0.5 rounded text-foreground/80 border border-border/50">{pos.amountTokens.toLocaleString()} tokens</span>
                    <span>Entry: <span className="text-foreground">{formatSol(pos.entryPriceSol)} SOL</span></span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-8 sm:w-1/2">
                  <div className="text-right">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Value</div>
                    <div className=" font-bold text-lg text-foreground">{formatSol(pos.valueSol)} SOL</div>
                  </div>
                  
                  <div className="text-right min-w-[90px]">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">PnL</div>
                    <div className={cn(
                      " font-bold text-lg",
                      pos.pnlPercent >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {pos.pnlPercent >= 0 ? "+" : ""}{formatPercent(pos.pnlPercent)}
                    </div>
                  </div>

                  <Link href="/sell">
                    <Button variant="outline" className="text-xs font-bold tracking-widest uppercase h-10 border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-destructive bg-destructive/5 transition-all">
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
