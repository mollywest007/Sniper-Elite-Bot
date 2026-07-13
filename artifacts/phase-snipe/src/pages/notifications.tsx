import { 
  useListNotifications, 
  getListNotificationsQueryKey, 
  useMarkNotificationRead 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Bell, 
  ShoppingCart, 
  TrendingDown, 
  Crosshair, 
  AlertTriangle, 
  Wallet, 
  CheckCircle2, 
  Link2, 
  Copy,
  Target,
  Repeat,
  TerminalSquare,
  Zap
} from "lucide-react";
import { cn, formatPercent, formatSol } from "@/lib/utils";
import { NotificationType } from "@workspace/api-client-react";

export default function Notifications() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });
  const markRead = useMarkNotificationRead();

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "buy_success": return <ShoppingCart className="h-4 w-4 text-success" />;
      case "sell_success": return <TrendingDown className="h-4 w-4 text-destructive" />;
      case "sniper_triggered": return <Crosshair className="h-4 w-4 text-primary" />;
      case "sniper_failed": return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "wallet_alert": return <Wallet className="h-4 w-4 text-primary" />;
      case "copy_trade": return <Copy className="h-4 w-4 text-primary" />;
      case "limit_order": return <Target className="h-4 w-4 text-primary" />;
      case "dca_executed": return <Repeat className="h-4 w-4 text-primary" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        queryClient.setQueryData(getListNotificationsQueryKey(), (old: any) => {
          if (!old) return old;
          return old.map((n: any) => n.id === id ? { ...n, isRead: true } : n);
        });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black italic tracking-widest text-foreground uppercase flex items-center gap-3">
          <Zap className="h-8 w-8 text-primary fill-primary" />
          Event Matrix
        </h1>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
            <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
            <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="p-16 text-center border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-4">
            <TerminalSquare className="h-12 w-12 text-muted-foreground/30 mb-2" />
            <p className="font-bold text-sm font-bold text-muted-foreground uppercase tracking-widest">No Events Found</p>
            <p className="font-bold text-xs text-muted-foreground/60">System logs are empty.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={cn(
                  "p-5 rounded-xl border flex gap-5 transition-colors relative overflow-hidden group",
                  !notif.isRead ? "bg-primary/5 border-primary/30" : "bg-card/40 border-border hover:bg-card/80 glass-panel"
                )}
              >
                {!notif.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                
                <div className="shrink-0 mt-1 p-2 rounded bg-background border border-border h-fit">
                  {getIcon(notif.type)}
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className={cn("font-bold font-bold text-sm tracking-tight", !notif.isRead ? "text-primary" : "text-foreground")}>
                        {notif.title}
                      </h3>
                      {!notif.isRead && <span className="text-[9px] uppercase tracking-widest bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-bold">New</span>}
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {new Date(notif.createdAt).toLocaleString()}
                    </div>
                  </div>
                  
                  <p className="text-xs font-bold text-muted-foreground/80 leading-relaxed">{notif.message}</p>
                  
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-bold uppercase tracking-widest">
                    {notif.tokenSymbol && (
                      <span className="bg-background/80 px-2 py-1 rounded border border-border">
                        Asset: <span className="text-foreground font-bold">{notif.tokenSymbol}</span>
                      </span>
                    )}
                    {notif.amountSol && (
                      <span className="bg-background/80 px-2 py-1 rounded border border-border">
                        Vol: <span className="text-foreground font-bold">{formatSol(notif.amountSol)} SOL</span>
                      </span>
                    )}
                    {notif.pnlPercent != null && (
                      <span className={cn(
                        "bg-background/80 px-2 py-1 rounded border font-bold",
                        notif.pnlPercent >= 0 ? "border-success/30 text-success" : "border-destructive/30 text-destructive"
                      )}>
                        Delta: {formatPercent(notif.pnlPercent)}
                      </span>
                    )}
                    {notif.txHash && (
                      <a href={`https://solscan.io/tx/${notif.txHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:text-primary/70 bg-primary/10 px-2 py-1 rounded border border-primary/20 transition-colors">
                        <Link2 className="h-3 w-3" /> Solscan Trace
                      </a>
                    )}
                  </div>
                </div>

                {!notif.isRead && (
                  <div className="shrink-0 flex items-start">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => handleMarkRead(notif.id)}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
