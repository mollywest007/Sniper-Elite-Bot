import { 
  useListLimitOrders, 
  getListLimitOrdersQueryKey, 
  useCreateLimitOrder, 
  useDeleteLimitOrder 
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Target, Trash2, Loader2, Link2, Activity } from "lucide-react";
import { LimitOrderStatus } from "@workspace/api-client-react";
import { cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const limitOrderSchema = z.object({
  contractAddress: z.string().min(32, "Invalid address").max(44, "Invalid address"),
  takeProfitPercent: z.coerce.number().optional(),
  stopLossPercent: z.coerce.number().optional(),
  trailingStopPercent: z.coerce.number().optional(),
  autoSell: z.boolean().default(true),
});

export default function LimitOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: limitOrders, isLoading } = useListLimitOrders({ query: { queryKey: getListLimitOrdersQueryKey() } });
  
  const createLimitOrder = useCreateLimitOrder();
  const deleteLimitOrder = useDeleteLimitOrder();

  const form = useForm<z.infer<typeof limitOrderSchema>>({
    resolver: zodResolver(limitOrderSchema),
    defaultValues: {
      contractAddress: "",
      takeProfitPercent: undefined,
      stopLossPercent: undefined,
      trailingStopPercent: undefined,
      autoSell: true,
    },
  });

  function onSubmit(values: z.infer<typeof limitOrderSchema>) {
    createLimitOrder.mutate({
      data: {
        contractAddress: values.contractAddress,
        takeProfitPercent: values.takeProfitPercent || null,
        stopLossPercent: values.stopLossPercent || null,
        trailingStopPercent: values.trailingStopPercent || null,
        autoSell: values.autoSell,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Trigger conditions recorded" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListLimitOrdersQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to configure", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: LimitOrderStatus) => {
    switch (status) {
      case "active": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50 shadow-[0_0_10px_hsl(var(--primary)/0.2)]">Armed</span>;
      case "triggered": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-success/20 text-success border border-success/50">Executed</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-background border border-border text-muted-foreground">Cancelled</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
        <Target className="h-6 w-6 text-primary" />
        Conditional Ops
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground pl-1">Armed Triggers</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs tracking-widest uppercase border-border hover:bg-accent" onClick={() => queryClient.invalidateQueries({ queryKey: getListLimitOrdersQueryKey() })}>Sync Data</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
              <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
            </div>
          ) : !limitOrders || limitOrders.length === 0 ? (
            <div className="p-16 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-4">
              <Activity className="h-12 w-12 text-muted-foreground/30 mb-2" />
              <p className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-widest">No Active Conditions</p>
              <p className="font-mono text-xs text-muted-foreground/60">Configure execution parameters via the panel →</p>
            </div>
          ) : (
            <div className="space-y-4">
              {limitOrders.map((order) => (
                <Card key={order.id} className={cn("glass-panel overflow-hidden transition-all", order.status === 'active' && "border-primary/40 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.1)]")}>
                  <div className="p-5 flex flex-col sm:flex-row justify-between gap-5">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold font-mono text-lg tracking-tight text-foreground">{order.tokenSymbol || "Unknown Asset"}</span>
                        {getStatusBadge(order.status)}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mb-4 flex items-center gap-1.5 bg-background inline-flex px-2 py-0.5 rounded border border-border">
                        <Link2 className="h-3 w-3" />
                        {truncateAddress(order.contractAddress)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                        {order.takeProfitPercent && (
                          <div className="bg-background/50 rounded-lg p-2 border border-success/30">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Take Profit</div>
                            <div className="font-bold text-success">+{order.takeProfitPercent}%</div>
                          </div>
                        )}
                        {order.stopLossPercent && (
                          <div className="bg-background/50 rounded-lg p-2 border border-destructive/30">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Stop Loss</div>
                            <div className="font-bold text-destructive">-{order.stopLossPercent}%</div>
                          </div>
                        )}
                        {order.trailingStopPercent && (
                          <div className="bg-background/50 rounded-lg p-2 border border-primary/30">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Trailing</div>
                            <div className="font-bold text-primary">{order.trailingStopPercent}%</div>
                          </div>
                        )}
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Auto Exec</div>
                          <div className="font-bold text-foreground">{order.autoSell ? "ENABLED" : "MANUAL"}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteLimitOrder.mutate({ id: order.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListLimitOrdersQueryKey() }) });
                        }}
                        disabled={deleteLimitOrder.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {order.status === "active" && (
                    <div className="h-0.5 w-full bg-border overflow-hidden">
                      <div className="h-full bg-primary animate-pulse w-full opacity-50" />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="glass-panel border-primary/20 sticky top-6">
            <CardHeader className="p-6 border-b border-border bg-card/40">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-primary flex items-center gap-2">
                <Activity className="h-4 w-4" /> Parameter Config
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="contractAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Contract Hash</FormLabel>
                        <FormControl>
                          <Input placeholder="Token address..." className="font-mono bg-background/50 h-12 border-border focus:border-primary/50 text-[10px] sm:text-xs" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="takeProfitPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">TP (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background/50 h-12 text-success font-bold border-border focus:border-success/50" {...field} value={field.value ?? ""} placeholder="Opt" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stopLossPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">SL (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background/50 h-12 text-destructive font-bold border-border focus:border-destructive/50" {...field} value={field.value ?? ""} placeholder="Opt" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="trailingStopPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Trailing Stop (%)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="Optional" className="font-mono bg-background/50 h-12 text-primary font-bold border-border focus:border-primary/50" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoSell"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border p-4 bg-background/30">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground border-border"
                          />
                        </FormControl>
                        <div className="space-y-1.5 leading-none">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest cursor-pointer text-foreground">
                            Auto Execution
                          </FormLabel>
                          <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                            System executes parameters immediately upon condition match
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full h-14 mt-6 font-mono text-sm font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)] transition-all uppercase"
                    disabled={createLimitOrder.isPending}
                  >
                    {createLimitOrder.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Target className="mr-2 h-4 w-4" />
                        Arm Triggers
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
