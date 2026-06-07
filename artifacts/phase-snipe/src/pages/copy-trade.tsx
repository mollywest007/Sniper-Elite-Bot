import { 
  useListCopyTrades, 
  getListCopyTradesQueryKey, 
  useCreateCopyTrade, 
  useStartCopyTrade, 
  usePauseCopyTrade, 
  useDeleteCopyTrade 
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Copy, Play, Pause, Trash2, Loader2, Link2 } from "lucide-react";
import { CopyTradeInputMode, CopyTradeStatus } from "@workspace/api-client-react";
import { formatSol, cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const copyTradeSchema = z.object({
  targetAddress: z.string().min(32, "Invalid address").max(44, "Invalid address"),
  targetAlias: z.string().max(20).optional(),
  amountSol: z.coerce.number().positive(),
  mode: z.nativeEnum(CopyTradeInputMode),
});

export default function CopyTrade() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: copyTrades, isLoading } = useListCopyTrades({ query: { queryKey: getListCopyTradesQueryKey() } });
  
  const createCopyTrade = useCreateCopyTrade();
  const startCopyTrade = useStartCopyTrade();
  const pauseCopyTrade = usePauseCopyTrade();
  const deleteCopyTrade = useDeleteCopyTrade();

  const form = useForm<z.infer<typeof copyTradeSchema>>({
    resolver: zodResolver(copyTradeSchema),
    defaultValues: {
      targetAddress: "",
      targetAlias: "",
      amountSol: 0.1,
      mode: "fixed" as any,
    },
  });

  function onSubmit(values: z.infer<typeof copyTradeSchema>) {
    createCopyTrade.mutate({
      data: {
        targetAddress: values.targetAddress,
        targetAlias: values.targetAlias || undefined,
        amountSol: values.amountSol,
        mode: values.mode,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Copy trade configured" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: CopyTradeStatus) => {
    switch (status) {
      case "active": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50 animate-pulse">Active</span>;
      case "paused": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-500 border border-amber-500/50">Paused</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground border border-border">Stopped</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Copy Trade</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Monitored Targets</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() })}>Refresh</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
            </div>
          ) : !copyTrades || copyTrades.length === 0 ? (
            <div className="p-8 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-md">
              No targets configured
            </div>
          ) : (
            <div className="space-y-3">
              {copyTrades.map((ct) => (
                <Card key={ct.id} className={cn("bg-card/30 border-border overflow-hidden", ct.status === 'active' && "border-primary/50")}>
                  <div className="p-4 flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold font-mono text-sm">{ct.targetAlias || "Unnamed Target"}</span>
                        {getStatusBadge(ct.status)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {truncateAddress(ct.targetAddress)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-muted-foreground">
                        <span className="bg-accent/50 px-2 py-0.5 rounded">Mode: <span className="text-foreground">{ct.mode}</span></span>
                        <span>Amount: <span className="text-foreground font-bold">{formatSol(ct.amountSol)} SOL</span></span>
                        <span>Trades: <span className="text-foreground">{ct.tradesCopied}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      {ct.status === "paused" || ct.status === "stopped" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10 hover:border-primary/50"
                          onClick={() => {
                            startCopyTrade.mutate({ id: ct.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() }) });
                          }}
                          disabled={startCopyTrade.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      ) : ct.status === "active" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 text-amber-500 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/50"
                          onClick={() => {
                            pauseCopyTrade.mutate({ id: ct.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() }) });
                          }}
                          disabled={pauseCopyTrade.isPending}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : null}
                      
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteCopyTrade.mutate({ id: ct.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() }) });
                        }}
                        disabled={deleteCopyTrade.isPending}
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
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Add Target</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="targetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Wallet Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Target address..." className="font-mono bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetAlias"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Alias (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Whale #1" className="font-mono bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amountSol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Amount</FormLabel>
                          <FormControl>
                            <Input type="number" step="any" className="font-mono bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Mode</FormLabel>
                          <FormControl>
                            <select 
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                              {...field}
                            >
                              <option value="fixed">Fixed</option>
                              <option value="proportional">Proportional</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 mt-4 font-mono font-bold tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={createCopyTrade.isPending}
                  >
                    {createCopyTrade.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Copy className="mr-2 h-5 w-5" />
                        START COPYING
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
