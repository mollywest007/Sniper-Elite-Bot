import { useListSnipers, getListSnipersQueryKey, useCreateSniper, useStartSniper, useStopSniper, useDeleteSniper, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Crosshair, Play, Square, Trash2, Loader2, Activity } from "lucide-react";
import { SniperInputPriorityFee, SniperStatus } from "@workspace/api-client-react";
import { formatSol, cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const sniperSchema = z.object({
  contractAddress: z.string().min(32, "Invalid address").max(44, "Invalid address"),
  buyAmountSol: z.coerce.number().positive(),
  slippagePercent: z.coerce.number().min(0.1).max(100),
  priorityFee: z.nativeEnum(SniperInputPriorityFee),
});

export default function Snipe() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: snipers, isLoading } = useListSnipers({ query: { queryKey: getListSnipersQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const createSniper = useCreateSniper();
  const startSniper = useStartSniper();
  const stopSniper = useStopSniper();
  const deleteSniper = useDeleteSniper();

  const form = useForm<z.infer<typeof sniperSchema>>({
    resolver: zodResolver(sniperSchema),
    defaultValues: {
      contractAddress: "",
      buyAmountSol: settings?.defaultBuyAmountSol || 0.1,
      slippagePercent: settings?.defaultSlippagePercent || 1,
      priorityFee: (settings?.defaultPriorityFee as any) || "auto",
    },
  });

  function onSubmit(values: z.infer<typeof sniperSchema>) {
    createSniper.mutate({
      data: {
        contractAddress: values.contractAddress,
        buyAmountSol: values.buyAmountSol,
        slippagePercent: values.slippagePercent,
        priorityFee: values.priorityFee,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Sniper created" });
        form.reset({ ...values, contractAddress: "" });
        queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create sniper", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: SniperStatus) => {
    switch (status) {
      case "monitoring": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-500 animate-pulse border border-amber-500/50">Monitoring</span>;
      case "sniped": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50">Sniped</span>;
      case "stopped": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground border border-border">Stopped</span>;
      case "failed": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-destructive/20 text-destructive border border-destructive/50">Failed</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-card border border-border text-muted-foreground">Idle</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Sniper Hub</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Active & Recent Snipers</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() })}>Refresh</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
            </div>
          ) : !snipers || snipers.length === 0 ? (
            <div className="p-8 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-md">
              No snipers configured
            </div>
          ) : (
            <div className="space-y-3">
              {snipers.map((sniper) => (
                <Card key={sniper.id} className="bg-card/30 border-border overflow-hidden">
                  <div className="p-4 flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold font-mono text-sm">{sniper.tokenSymbol || "Unknown Token"}</span>
                        {getStatusBadge(sniper.status)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mb-2">{truncateAddress(sniper.contractAddress)}</div>
                      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                        <span>Buy: <span className="text-foreground font-bold">{formatSol(sniper.buyAmountSol)} SOL</span></span>
                        <span>Slip: <span className="text-foreground">{sniper.slippagePercent}%</span></span>
                        {sniper.status === "monitoring" && (
                          <span className="flex items-center gap-1 text-amber-500">
                            <Activity className="h-3 w-3" />
                            {sniper.latencyMs ? `${sniper.latencyMs}ms` : 'Ping...'}
                          </span>
                        )}
                        <span>Attempts: {sniper.attempts}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      {sniper.status === "idle" || sniper.status === "stopped" || sniper.status === "failed" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10 hover:border-primary/50"
                          onClick={() => {
                            startSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) });
                          }}
                          disabled={startSniper.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      ) : sniper.status === "monitoring" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/50"
                          onClick={() => {
                            stopSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) });
                          }}
                          disabled={stopSniper.isPending}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      ) : null}
                      
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) });
                        }}
                        disabled={deleteSniper.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {sniper.status === "monitoring" && (
                    <div className="h-0.5 w-full bg-border overflow-hidden">
                      <div className="h-full bg-amber-500 w-1/3 animate-[slide_1s_ease-in-out_infinite]" />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="bg-card/50 border-border sticky top-4">
            <CardHeader className="p-4 border-b border-border/50">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">New Sniper</CardTitle>
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

                  <FormField
                    control={form.control}
                    name="buyAmountSol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Buy Amount (SOL)</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" className="font-mono bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="slippagePercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Slippage (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priorityFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Priority Fee</FormLabel>
                          <FormControl>
                            <select 
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                              {...field}
                            >
                              <option value="auto">Auto</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 mt-4 font-mono font-bold tracking-wider bg-amber-500 text-black hover:bg-amber-600"
                    disabled={createSniper.isPending}
                  >
                    {createSniper.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Crosshair className="mr-2 h-5 w-5" />
                        ARM SNIPER
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
