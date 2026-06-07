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
  Repeat
} from "lucide-react";
import { cn, formatPercent, formatSol } from "@/lib/utils";
import { NotificationType } from "@workspace/api-client-react";

export default function Notifications() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });
  const markRead = useMarkNotificationRead();

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "buy_success": return <ShoppingCart className="h-5 w-5 text-primary" />;
      case "sell_success": return <TrendingDown className="h-5 w-5 text-destructive" />;
      case "sniper_triggered": return <Crosshair className="h-5 w-5 text-primary" />;
      case "sniper_failed": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "wallet_alert": return <Wallet className="h-5 w-5 text-amber-500" />;
      case "copy_trade": return <Copy className="h-5 w-5 text-primary" />;
      case "limit_order": return <Target className="h-5 w-5 text-primary" />;
      case "dca_executed": return <Repeat className="h-5 w-5 text-primary" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        // Optimistic update
        queryClient.setQueryData(getListNotificationsQueryKey(), (old: any) => {
          if (!old) return old;
          return old.map((n: any) => n.id === id ? { ...n, isRead: true } : n);
        });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">System Logs</h1>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
            <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
            <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded-md bg-card/10 flex flex-col items-center gap-4">
            <Bell className="h-12 w-12 text-muted-foreground/50" />
            <div className="font-mono text-muted-foreground">No logs found</div>
          </div>
        ) : (
          <div className="divide-y divide-border/50 border border-border rounded-md overflow-hidden bg-card/30">
            {notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={cn(
                  "p-4 flex gap-4 transition-colors",
                  !notif.isRead ? "bg-accent/20" : "hover:bg-accent/10"
                )}
              >
                <div className="shrink-0 mt-1">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className={cn("font-mono font-bold text-sm", !notif.isRead && "text-primary")}>
                        {notif.title}
                      </h3>
                      {!notif.isRead && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">
                      {new Date(notif.createdAt).toLocaleString()}
                    </div>
                  </div>
                  
                  <p className="text-sm font-mono text-muted-foreground">{notif.message}</p>
                  
                  <div className="flex flex-wrap items-center gap-4 mt-2 pt-2 text-xs font-mono">
                    {notif.tokenSymbol && (
                      <span className="bg-background/80 px-2 py-1 rounded border border-border">
                        Token: <span className="text-foreground font-bold">{notif.tokenSymbol}</span>
                      </span>
                    )}
                    {notif.amountSol && (
                      <span className="bg-background/80 px-2 py-1 rounded border border-border">
                        Amount: <span className="text-foreground font-bold">{formatSol(notif.amountSol)} SOL</span>
                      </span>
                    )}
                    {notif.pnlPercent != null && (
                      <span className={cn(
                        "bg-background/80 px-2 py-1 rounded border border-border font-bold",
                        notif.pnlPercent >= 0 ? "text-primary" : "text-destructive"
                      )}>
                        PnL: {formatPercent(notif.pnlPercent)}
                      </span>
                    )}
                    {notif.txHash && (
                      <a href={`https://solscan.io/tx/${notif.txHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <Link2 className="h-3 w-3" /> Solscan
                      </a>
                    )}
                  </div>
                </div>
                {!notif.isRead && (
                  <div className="shrink-0 flex items-start">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
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
