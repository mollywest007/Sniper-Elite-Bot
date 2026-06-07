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
import { Target, Trash2, Loader2, Link2 } from "lucide-react";
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
        toast({ title: "Limit order created" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListLimitOrdersQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: LimitOrderStatus) => {
    switch (status) {
      case "active": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-500 border border-amber-500/50 animate-pulse">Active</span>;
      case "triggered": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50">Triggered</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground border border-border">Cancelled</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Limit Orders</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Active Orders</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: getListLimitOrdersQueryKey() })}>Refresh</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
            </div>
          ) : !limitOrders || limitOrders.length === 0 ? (
            <div className="p-8 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-md">
              No active limit orders
            </div>
          ) : (
            <div className="space-y-3">
              {limitOrders.map((order) => (
                <Card key={order.id} className={cn("bg-card/30 border-border overflow-hidden", order.status === 'active' && "border-amber-500/30")}>
                  <div className="p-4 flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold font-mono text-sm">{order.tokenSymbol || "Unknown Token"}</span>
                        {getStatusBadge(order.status)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {truncateAddress(order.contractAddress)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-muted-foreground">
                        {order.takeProfitPercent && <span>TP: <span className="text-primary font-bold">+{order.takeProfitPercent}%</span></span>}
                        {order.stopLossPercent && <span>SL: <span className="text-destructive font-bold">-{order.stopLossPercent}%</span></span>}
                        {order.trailingStopPercent && <span>Trailing: <span className="text-foreground">{order.trailingStopPercent}%</span></span>}
                        <span className="bg-accent/50 px-2 py-0.5 rounded">Auto Sell: <span className="text-foreground">{order.autoSell ? "Yes" : "No"}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteLimitOrder.mutate({ id: order.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListLimitOrdersQueryKey() }) });
                        }}
                        disabled={deleteLimitOrder.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="bg-card/50 border-border sticky top-4">
            <CardHeader className="p-4 border-b border-border/50">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">New Order</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="contractAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Contract Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Token address..." className="font-mono bg-background" {...field} />
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
                          <FormLabel className="font-mono text-xs uppercase">Take Profit (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background text-primary" {...field} value={field.value ?? ""} />
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
                          <FormLabel className="font-mono text-xs uppercase">Stop Loss (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background text-destructive" {...field} value={field.value ?? ""} />
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
                        <FormLabel className="font-mono text-xs uppercase">Trailing Stop (%)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="Optional" className="font-mono bg-background" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoSell"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4 bg-background/50">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-mono text-xs uppercase cursor-pointer">
                            Auto Sell
                          </FormLabel>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            Automatically execute sell when conditions are met
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full h-12 mt-4 font-mono font-bold tracking-wider bg-amber-500 text-black hover:bg-amber-600"
                    disabled={createLimitOrder.isPending}
                  >
                    {createLimitOrder.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Target className="mr-2 h-5 w-5" />
                        SET ORDER
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
