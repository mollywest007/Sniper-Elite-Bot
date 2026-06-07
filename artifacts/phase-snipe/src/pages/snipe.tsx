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
import { Crosshair, Play, Square, Trash2, Loader2, Activity, Pencil } from "lucide-react";
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
      case "monitoring": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-500 animate-pulse border border-amber-500/50">● Monitoring</span>;
      case "sniped": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50">● Sniped</span>;
      case "stopped": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground border border-border">Stopped</span>;
      case "failed": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-destructive/20 text-destructive border border-destructive/50">Failed</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-card border border-border text-muted-foreground">Idle</span>;
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Sniper Hub</h1>

      {/* Edit Dialog */}
      <Dialog open={!!editingSniper} onOpenChange={(open) => { if (!open) setEditingSniper(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase">Edit Sniper #{editingSniper?.id}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 mt-2">
              <FormField
                control={editForm.control}
                name="buyAmountSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Buy Amount (SOL)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" className="font-mono bg-background" {...field} />
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
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Slippage (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" className="font-mono bg-background" {...field} />
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
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Priority Fee</FormLabel>
                      <FormControl>
                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" {...field}>
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
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 font-mono text-xs" onClick={() => setEditingSniper(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 font-mono font-bold bg-amber-500 text-black hover:bg-amber-600" disabled={updateSniper.isPending}>
                  {updateSniper.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Active & Recent Snipers</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() })}>Refresh</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-28 w-full bg-muted/50 rounded-md" />
              <Skeleton className="h-28 w-full bg-muted/50 rounded-md" />
            </div>
          ) : !snipers || snipers.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border rounded-md bg-card/10">
              <Crosshair className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-mono text-sm text-muted-foreground">No snipers configured</p>
              <p className="font-mono text-xs text-muted-foreground/60 mt-1">Create one using the panel →</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snipers.map((sniper) => (
                <Card key={sniper.id} className={cn("border overflow-hidden transition-all", sniper.status === "monitoring" ? "border-amber-500/40 bg-amber-500/5" : "bg-card/30 border-border")}>
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-bold font-mono text-sm">{sniper.tokenSymbol || "Unknown Token"}</span>
                          <span className="text-xs font-mono text-muted-foreground">#{sniper.id}</span>
                          {getStatusBadge(sniper.status)}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mb-3">{truncateAddress(sniper.contractAddress)}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-muted-foreground uppercase text-[10px] mb-0.5">Buy</div>
                            <div className="font-bold text-foreground">{formatSol(sniper.buyAmountSol)} SOL</div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-muted-foreground uppercase text-[10px] mb-0.5">Slippage</div>
                            <div className="font-bold text-foreground">{sniper.slippagePercent}%</div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-muted-foreground uppercase text-[10px] mb-0.5">Fee</div>
                            <div className="font-bold capitalize text-foreground">{sniper.priorityFee}</div>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <div className="text-muted-foreground uppercase text-[10px] mb-0.5">Attempts</div>
                            <div className="font-bold text-foreground">{sniper.attempts}</div>
                          </div>
                        </div>
                        {sniper.status === "monitoring" && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-500 font-mono">
                            <Activity className="h-3 w-3 animate-pulse" />
                            Watching for liquidity...
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:self-start sm:flex-col sm:items-end">
                        <div className="flex gap-2">
                          {sniper.status === "idle" || sniper.status === "stopped" || sniper.status === "failed" ? (
                            <Button 
                              size="sm"
                              variant="outline" 
                              className="h-8 font-mono text-xs text-primary border-primary/20 hover:bg-primary/10 hover:border-primary/50"
                              onClick={() => startSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) })}
                              disabled={startSniper.isPending}
                            >
                              <Play className="h-3 w-3 mr-1" /> Start
                            </Button>
                          ) : sniper.status === "monitoring" ? (
                            <Button 
                              size="sm"
                              variant="outline" 
                              className="h-8 font-mono text-xs text-destructive border-destructive/20 hover:bg-destructive/10"
                              onClick={() => stopSniper.mutate({ id: sniper.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSnipersQueryKey() }) })}
                              disabled={stopSniper.isPending}
                            >
                              <Square className="h-3 w-3 mr-1" /> Stop
                            </Button>
                          ) : null}

                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 font-mono text-xs text-muted-foreground hover:text-foreground hover:border-border"
                            onClick={() => openEdit({ id: sniper.id, buyAmountSol: sniper.buyAmountSol, slippagePercent: sniper.slippagePercent, priorityFee: sniper.priorityFee })}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>

                          <Button 
                            size="icon"
                            variant="ghost" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                      <div className="h-full bg-amber-500 animate-pulse w-full opacity-50" />
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
                        <FormLabel className="font-mono text-xs uppercase">Token Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Paste contract address..." className="font-mono bg-background text-xs" {...field} />
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
                        <div className="flex gap-1 mb-1">
                          {[0.1, 0.5, 1].map(v => (
                            <button key={v} type="button" onClick={() => field.onChange(v)}
                              className={cn("px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                                field.value === v ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-border/80"
                              )}>
                              {v} SOL
                            </button>
                          ))}
                        </div>
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
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
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
                    className="w-full h-12 mt-2 font-mono font-bold tracking-wider bg-amber-500 text-black hover:bg-amber-600"
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
