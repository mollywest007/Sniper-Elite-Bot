import { useListSnipers, getListSnipersQueryKey, useCreateSniper, useStartSniper, useStopSniper, useDeleteSniper, useUpdateSniper, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crosshair, Play, Square, Trash2, Loader2, Activity, Pencil, Terminal } from "lucide-react";
import { SniperInputPriorityFee, SniperStatus } from "@workspace/api-client-react";
import { formatSol, cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

const sniperSchema = z.object({
  contractAddress: z.string().min(32, "Invalid address").max(44, "Invalid address"),
  buyAmountSol: z.coerce.number().positive(),
  slippagePercent: z.coerce.number().min(0.1).max(100),
  priorityFee: z.nativeEnum(SniperInputPriorityFee),
});

const editSchema = z.object({
  buyAmountSol: z.coerce.number().positive(),
  slippagePercent: z.coerce.number().min(0.1).max(100),
  priorityFee: z.nativeEnum(SniperInputPriorityFee),
});

type EditingSniper = {
  id: number;
  buyAmountSol: number;
  slippagePercent: number;
  priorityFee: string;
};

export default function Snipe() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: snipers, isLoading } = useListSnipers({ query: { queryKey: getListSnipersQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const createSniper = useCreateSniper();
  const startSniper = useStartSniper();
  const stopSniper = useStopSniper();
  const deleteSniper = useDeleteSniper();
  const updateSniper = useUpdateSniper();

  const [editingSniper, setEditingSniper] = useState<EditingSniper | null>(null);

  const form = useForm<z.infer<typeof sniperSchema>>({
    resolver: zodResolver(sniperSchema),
    defaultValues: {
      contractAddress: "",
      buyAmountSol: settings?.defaultBuyAmountSol || 0.1,
      slippagePercent: settings?.defaultSlippagePercent || 1,
      priorityFee: (settings?.defaultPriorityFee as any) || "auto",
    },
  });

  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      buyAmountSol: 0.1,
      slippagePercent: 1,
      priorityFee: "auto" as any,
    },
  });

  function openEdit(sniper: EditingSniper) {
    setEditingSniper(sniper);
    editForm.reset({
      buyAmountSol: sniper.buyAmountSol,
      slippagePercent: sniper.slippagePercent,
      priorityFee: sniper.priorityFee as any,
    });
  }

  function onEditSubmit(values: z.infer<typeof editSchema>) {
    if (!editingSniper) return;
    updateSniper.mutate({
      id: editingSniper.id,
      data: {
        buyAmountSol: values.buyAmountSol,
        slippagePercent: values.slippagePercent,
        priorityFee: values.priorityFee,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Sniper updated" });
        setEditingSniper(null);
        queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() });
      },
      onError: (err) => toast({ title: "Failed to update sniper", description: String(err), variant: "destructive" }),
    });
  }

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
        toast({ title: "Sniper initialized", description: "Target acquired and ready." });
        form.reset({ ...values, contractAddress: "" });
        queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Initialization failed", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: SniperStatus) => {
    switch (status) {
      case "monitoring": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/20 text-warning border border-warning/50 shadow-[0_0_10px_hsl(var(--warning)/0.2)]">Monitoring</span>;
      case "sniped": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-success/20 text-success border border-success/50">Acquired</span>;
      case "stopped": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground border border-border">Halted</span>;
      case "failed": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-destructive/20 text-destructive border border-destructive/50">Failed</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-background border border-border text-muted-foreground">Standby</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
        <Crosshair className="h-6 w-6 text-primary" />
        Sniper Protocol
      </h1>

      {/* Edit Dialog */}
      <Dialog open={!!editingSniper} onOpenChange={(open) => { if (!open) setEditingSniper(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-md glass-panel">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-primary flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Reconfigure #{editingSniper?.id}
            </DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6 mt-4">
              <FormField
                control={editForm.control}
                name="buyAmountSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Commitment (SOL)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" className="font-mono bg-background/50 border-border h-12 text-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="slippagePercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Slippage (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" className="font-mono bg-background/50 border-border h-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="priorityFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Network Fee</FormLabel>
                      <FormControl>
                        <select className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm font-mono focus-visible:ring-1 focus-visible:ring-primary/50" {...field}>
                          <option value="auto">Auto</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <Button type="button" variant="outline" className="flex-1 font-mono text-xs tracking-widest uppercase border-border h-12" onClick={() => setEditingSniper(null)}>
                  Abort
                </Button>
                <Button type="submit" className="flex-1 font-mono text-xs tracking-widest font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90 h-12 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.4)]" disabled={updateSniper.isPending}>
                  {updateSniper.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Sync"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground pl-1">Active Directives</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs tracking-widest uppercase border-border hover:bg-accent hover:text-foreground" onClick={() => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() })}>Sync Data</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full bg-card border-border rounded-xl" />
              <Skeleton className="h-32 w-full bg-card border-border rounded-xl" />
            </div>
          ) : !snipers || snipers.length === 0 ? (
            <div className="p-16 text-center border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-4">
              <Crosshair className="h-12 w-12 text-muted-foreground/30 mb-2" />
              <p className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-widest">No Active Snipers</p>
              <p className="font-mono text-xs text-muted-foreground/60">Initialize a new target via the command panel →</p>
            </div>
          ) : (
            <div className="space-y-4">
              {snipers.map((sniper) => (
                <Card key={sniper.id} className={cn("overflow-hidden transition-all group glass-panel", sniper.status === "monitoring" ? "border-warning/40 shadow-[0_0_15px_-3px_hsl(var(--warning)/0.1)]" : "border-border")}>
                  <div className="p-5">
                    <div className="flex flex-col sm:flex-row justify-between gap-5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-bold font-mono text-lg text-foreground tracking-tight">{sniper.tokenSymbol || "Unknown Token"}</span>
                          <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">OBJ-{sniper.id}</span>
                          {getStatusBadge(sniper.status)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mb-4 flex items-center gap-1.5">
                          <Terminal className="h-3 w-3" /> {truncateAddress(sniper.contractAddress)}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                          <div className="bg-background/50 rounded-lg p-2.5 border border-border/50">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-1">Commit</div>
                            <div className="font-bold text-foreground">{formatSol(sniper.buyAmountSol)} SOL</div>
                          </div>
                          <div className="bg-background/50 rounded-lg p-2.5 border border-border/50">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-1">Slippage</div>
                            <div className="font-bold text-foreground">{sniper.slippagePercent}%</div>
                          </div>
                          <div className="bg-background/50 rounded-lg p-2.5 border border-border/50">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-1">Network</div>
                            <div className="font-bold capitalize text-foreground">{sniper.priorityFee}</div>
                          </div>
                          <div className="bg-background/50 rounded-lg p-2.5 border border-border/50">
                            <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-1">Tries</div>
                            <div className="font-bold text-foreground">{sniper.attempts}</div>
                          </div>
                        </div>
                        {sniper.status === "monitoring" && (
                          <div className="mt-4 flex items-center gap-2 text-[10px] tracking-widest text-warning font-mono uppercase bg-warning/10 inline-flex px-2 py-1 rounded border border-warning/20">
                            <Activity className="h-3 w-3 animate-pulse" />
                            Awaiting Liquidity Event...
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:self-start sm:flex-col sm:items-end">
                        <div className="flex gap-2">
                          {sniper.status === "idle" || sniper.status === "stopped" || sniper.status === "failed" ? (
                            <Button 
                              size="sm"
                              variant="outline" 
                              className="h-9 font-mono text-[10px] tracking-widest uppercase font-bold text-warning border-warning/30 hover:bg-warning/10 hover:border-warning"
                              onClick={() => startSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) })}
                              disabled={startSniper.isPending}
                            >
                              <Play className="h-3 w-3 mr-1.5" /> Arm
                            </Button>
                          ) : sniper.status === "monitoring" ? (
                            <Button 
                              size="sm"
                              variant="outline" 
                              className="h-9 font-mono text-[10px] tracking-widest uppercase font-bold text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                              onClick={() => stopSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) })}
                              disabled={stopSniper.isPending}
                            >
                              <Square className="h-3 w-3 mr-1.5" /> Halt
                            </Button>
                          ) : null}

                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-9 font-mono text-[10px] tracking-widest uppercase font-bold text-muted-foreground border-border hover:text-foreground hover:bg-accent"
                            onClick={() => openEdit({ id: sniper.id, buyAmountSol: sniper.buyAmountSol, slippagePercent: sniper.slippagePercent, priorityFee: sniper.priorityFee })}
                          >
                            <Pencil className="h-3 w-3 mr-1.5" /> Mod
                          </Button>

                          <Button 
                            size="icon"
                            variant="ghost" 
                            className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) })}
                            disabled={deleteSniper.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {sniper.status === "monitoring" && (
                    <div className="h-0.5 w-full bg-border overflow-hidden">
                      <div className="h-full bg-warning animate-pulse w-full opacity-70" />
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
                <Terminal className="h-4 w-4" /> Initialize Target
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

                  <div className="bg-background/30 p-4 rounded-xl border border-border space-y-4">
                    <FormField
                      control={form.control}
                      name="buyAmountSol"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-center mb-2">
                            <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Commitment (SOL)</FormLabel>
                            <div className="flex gap-1.5">
                              {[0.1, 0.5, 1].map(v => (
                                <button key={v} type="button" onClick={() => field.onChange(v)}
                                  className={cn("px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition-colors",
                                    field.value === v ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-border/80 bg-background"
                                  )}>
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          <FormControl>
                            <Input type="number" step="any" className="font-mono bg-background h-12 text-primary font-bold text-lg border-border focus:border-primary/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="slippagePercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Slippage (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background/50 h-12 border-border focus:border-primary/50" {...field} />
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
                          <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Priority</FormLabel>
                          <FormControl>
                            <select 
                              className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm font-mono focus-visible:ring-1 focus-visible:ring-primary/50"
                              {...field}
                            >
                              <option value="auto">Auto</option>
                              <option value="low">Low</option>
                              <option value="medium">Med</option>
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
                    className="w-full h-14 mt-6 font-mono text-sm font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)] transition-all uppercase"
                    disabled={createSniper.isPending}
                  >
                    {createSniper.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Crosshair className="mr-2 h-4 w-4" />
                        Arm Sniper
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
