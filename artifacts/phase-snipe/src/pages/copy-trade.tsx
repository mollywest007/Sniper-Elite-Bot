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
import { Copy, Play, Pause, Trash2, Loader2, Link2, Radar, Zap } from "lucide-react";
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
        toast({ title: "Mirror protocol established" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Connection failed", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: CopyTradeStatus) => {
    switch (status) {
      case "active": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50 shadow-[0_0_10px_hsl(var(--primary)/0.2)]">Linked</span>;
      case "paused": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/20 text-warning border border-warning/50">Suspended</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-background border border-border text-muted-foreground">Severed</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-black italic tracking-widest text-foreground uppercase flex items-center gap-3">
        <Copy className="h-6 w-6 text-primary" />
        Mirror Protocol
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pl-1">Network Links</h2>
            <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold tracking-widest uppercase border-border hover:bg-accent" onClick={() => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() })}>Refresh Net</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
              <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
            </div>
          ) : !copyTrades || copyTrades.length === 0 ? (
            <div className="p-16 text-center text-sm  text-muted-foreground border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-4">
              <Radar className="h-12 w-12 text-muted-foreground/30 mb-2" />
              <p className="font-bold text-sm text-muted-foreground uppercase tracking-widest">No Active Links</p>
              <p className=" text-xs text-muted-foreground/60">Initialize a new mirror connection via the panel →</p>
            </div>
          ) : (
            <div className="space-y-4">
              {copyTrades.map((ct) => (
                <Card key={ct.id} className={cn("glass-panel overflow-hidden transition-all", ct.status === 'active' && "border-primary/40 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.1)]")}>
                  <div className="p-5 flex flex-col sm:flex-row justify-between gap-5">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-lg tracking-tight text-foreground">{ct.targetAlias || "Unnamed Node"}</span>
                        {getStatusBadge(ct.status)}
                      </div>
                      <div className="text-[10px] text-muted-foreground  font-bold mb-4 flex items-center gap-1.5 bg-background inline-flex px-2 py-0.5 rounded border border-border">
                        <Link2 className="h-3 w-3" />
                        {truncateAddress(ct.targetAddress)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs ">
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest mb-0.5">Strategy</div>
                          <div className="font-bold text-foreground capitalize">{ct.mode}</div>
                        </div>
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest mb-0.5">Commitment</div>
                          <div className="font-bold text-primary">{formatSol(ct.amountSol)} SOL</div>
                        </div>
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest mb-0.5">Mirrored</div>
                          <div className="font-bold text-foreground">{ct.tradesCopied} Txs</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      {ct.status === "paused" || ct.status === "stopped" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-10 w-10 text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => {
                            startCopyTrade.mutate({ id: ct.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() }) });
                          }}
                          disabled={startCopyTrade.isPending}
                        >
                          <Play className="h-4 w-4 ml-0.5 fill-current" />
                        </Button>
                      ) : ct.status === "active" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-10 w-10 text-warning border-warning/30 hover:bg-warning/10"
                          onClick={() => {
                            pauseCopyTrade.mutate({ id: ct.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() }) });
                          }}
                          disabled={pauseCopyTrade.isPending}
                        >
                          <Pause className="h-4 w-4 fill-current" />
                        </Button>
                      ) : null}
                      
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteCopyTrade.mutate({ id: ct.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyTradesQueryKey() }) });
                        }}
                        disabled={deleteCopyTrade.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {ct.status === "active" && (
                    <div className="h-0.5 w-full bg-border overflow-hidden">
                      <div className="h-full bg-primary animate-pulse w-full opacity-50 shadow-[0_0_10px_hsl(var(--primary))]" />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="glass-panel corner-brackets border-primary/30 sticky top-6 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -z-10 rounded-full" />
            <CardHeader className="p-6 border-b border-border bg-card/40">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <Radar className="h-4 w-4" /> Establish Link
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 relative z-10">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="targetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Target Hash</FormLabel>
                        <FormControl>
                          <Input placeholder="Wallet address..." className=" bg-background/50 h-12 border-border focus:border-primary/50 text-[10px] sm:text-xs" {...field} />
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
                        <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Node Alias (Opt)</FormLabel>
                        <FormControl>
                          <Input placeholder="Alpha Whale" className=" font-bold bg-background/50 h-12 border-border focus:border-primary/50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-background/30 p-4 rounded-xl border border-border space-y-4">
                    <FormField
                      control={form.control}
                      name="amountSol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Commitment (SOL)</FormLabel>
                          <FormControl>
                            <Input type="number" step="any" className=" bg-background h-12 text-primary font-bold text-lg border-border focus:border-primary/50" {...field} />
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
                          <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Strategy</FormLabel>
                          <FormControl>
                            <select 
                              className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-primary/50  font-bold transition-colors"
                              {...field}
                            >
                              <option value="fixed">Fixed Size</option>
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
                    className="w-full h-14 mt-6 text-sm font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)] transition-all uppercase rounded-xl"
                    disabled={createCopyTrade.isPending}
                  >
                    {createCopyTrade.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Zap className="mr-2 h-4 w-4 fill-current" />
                        Init Protocol
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
