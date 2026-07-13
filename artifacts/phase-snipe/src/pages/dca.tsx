import { 
  useListDcaSetups, 
  getListDcaSetupsQueryKey, 
  useCreateDcaSetup, 
  useStartDcaSetup, 
  usePauseDcaSetup, 
  useDeleteDcaSetup 
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Repeat, Play, Pause, Trash2, Loader2, Link2, Clock, Activity } from "lucide-react";
import { DcaSetupStatus } from "@workspace/api-client-react";
import { formatSol, cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const dcaSchema = z.object({
  contractAddress: z.string().min(32, "Invalid address").max(44, "Invalid address"),
  amountSol: z.coerce.number().positive(),
  intervalHours: z.coerce.number().min(0.5).max(720),
});

export default function Dca() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: dcaSetups, isLoading } = useListDcaSetups({ query: { queryKey: getListDcaSetupsQueryKey() } });
  
  const createDcaSetup = useCreateDcaSetup();
  const startDcaSetup = useStartDcaSetup();
  const pauseDcaSetup = usePauseDcaSetup();
  const deleteDcaSetup = useDeleteDcaSetup();

  const form = useForm<z.infer<typeof dcaSchema>>({
    resolver: zodResolver(dcaSchema),
    defaultValues: {
      contractAddress: "",
      amountSol: 0.1,
      intervalHours: 24,
    },
  });

  function onSubmit(values: z.infer<typeof dcaSchema>) {
    createDcaSetup.mutate({
      data: {
        contractAddress: values.contractAddress,
        amountSol: values.amountSol,
        intervalHours: values.intervalHours,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Routine scheduled" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Scheduling failed", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: DcaSetupStatus) => {
    switch (status) {
      case "active": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50 shadow-[0_0_10px_hsl(var(--primary)/0.2)]">Active</span>;
      case "paused": return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/20 text-warning border border-warning/50">Suspended</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-background border border-border text-muted-foreground">Halted</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-bold  tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
        <Repeat className="h-6 w-6 text-primary" />
        Temporal Ops
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs  uppercase tracking-widest text-muted-foreground pl-1">Scheduled Routines</h2>
            <Button variant="outline" size="sm" className="h-8  text-xs tracking-widest uppercase border-border hover:bg-accent" onClick={() => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() })}>Sync Data</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
              <Skeleton className="h-28 w-full bg-card border-border rounded-xl" />
            </div>
          ) : !dcaSetups || dcaSetups.length === 0 ? (
            <div className="p-16 text-center text-sm  text-muted-foreground border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-4">
              <Activity className="h-12 w-12 text-muted-foreground/30 mb-2" />
              <p className=" text-sm font-bold text-muted-foreground uppercase tracking-widest">No Active Routines</p>
              <p className=" text-xs text-muted-foreground/60">Schedule an automated purchase via the panel →</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dcaSetups.map((dca) => (
                <Card key={dca.id} className={cn("glass-panel overflow-hidden transition-all", dca.status === 'active' && "border-primary/40 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.1)]")}>
                  <div className="p-5 flex flex-col sm:flex-row justify-between gap-5">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold  text-lg tracking-tight text-foreground">{dca.tokenSymbol || "Unknown Asset"}</span>
                        {getStatusBadge(dca.status)}
                      </div>
                      <div className="text-[10px] text-muted-foreground  mb-4 flex items-center gap-1.5 bg-background inline-flex px-2 py-0.5 rounded border border-border">
                        <Link2 className="h-3 w-3" />
                        {truncateAddress(dca.contractAddress)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs ">
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Commitment</div>
                          <div className="font-bold text-primary">{formatSol(dca.amountSol)} SOL</div>
                        </div>
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Interval</div>
                          <div className="font-bold text-foreground">{dca.intervalHours}h</div>
                        </div>
                        <div className="bg-background/50 rounded-lg p-2 border border-border/50">
                          <div className="text-muted-foreground uppercase text-[9px] tracking-widest mb-0.5">Executions</div>
                          <div className="font-bold text-foreground">{dca.executionsCount}</div>
                        </div>
                        {dca.nextExecutionAt && dca.status === "active" && (
                          <div className="bg-primary/5 rounded-lg p-2 border border-primary/20 text-primary">
                            <div className="text-primary/70 uppercase text-[9px] tracking-widest mb-0.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Next T-Minus</div>
                            <div className="font-bold">{new Date(dca.nextExecutionAt).toLocaleTimeString()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      {dca.status === "paused" || dca.status === "stopped" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-10 w-10 text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => {
                            startDcaSetup.mutate({ id: dca.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() }) });
                          }}
                          disabled={startDcaSetup.isPending}
                        >
                          <Play className="h-4 w-4 ml-0.5" />
                        </Button>
                      ) : dca.status === "active" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-10 w-10 text-warning border-warning/30 hover:bg-warning/10"
                          onClick={() => {
                            pauseDcaSetup.mutate({ id: dca.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() }) });
                          }}
                          disabled={pauseDcaSetup.isPending}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : null}
                      
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteDcaSetup.mutate({ id: dca.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() }) });
                        }}
                        disabled={deleteDcaSetup.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {dca.status === "active" && (
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
              <CardTitle className="text-xs  uppercase tracking-widest text-primary flex items-center gap-2">
                <Repeat className="h-4 w-4" /> New Sequence
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
                        <FormLabel className=" text-xs uppercase tracking-widest text-muted-foreground">Contract Hash</FormLabel>
                        <FormControl>
                          <Input placeholder="Token address..." className=" bg-background/50 h-12 border-border focus:border-primary/50 text-[10px] sm:text-xs" {...field} />
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
                          <FormLabel className=" text-[10px] uppercase tracking-widest text-muted-foreground">Volume (SOL)</FormLabel>
                          <FormControl>
                            <Input type="number" step="any" className=" bg-background/50 h-12 text-primary font-bold border-border focus:border-primary/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="intervalHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className=" text-[10px] uppercase tracking-widest text-muted-foreground">Interval (Hr)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.5" className=" bg-background/50 h-12 border-border focus:border-primary/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 mt-6  text-sm font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)] transition-all uppercase"
                    disabled={createDcaSetup.isPending}
                  >
                    {createDcaSetup.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Repeat className="mr-2 h-4 w-4" />
                        Execute Chrono
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
