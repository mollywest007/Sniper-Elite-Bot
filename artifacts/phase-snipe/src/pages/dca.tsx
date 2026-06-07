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
import { Repeat, Play, Pause, Trash2, Loader2, Link2, Clock } from "lucide-react";
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
        toast({ title: "DCA setup created" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to create DCA", description: String(err), variant: "destructive" });
      }
    });
  }

  const getStatusBadge = (status: DcaSetupStatus) => {
    switch (status) {
      case "active": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/50 animate-pulse">Active</span>;
      case "paused": return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-500 border border-amber-500/50">Paused</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground border border-border">Stopped</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">DCA Operations</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Active DCA Jobs</h2>
            <Button variant="outline" size="sm" className="h-8 font-mono text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() })}>Refresh</Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
              <Skeleton className="h-24 w-full bg-muted/50 rounded-md" />
            </div>
          ) : !dcaSetups || dcaSetups.length === 0 ? (
            <div className="p-8 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-md">
              No active DCA setups
            </div>
          ) : (
            <div className="space-y-3">
              {dcaSetups.map((dca) => (
                <Card key={dca.id} className={cn("bg-card/30 border-border overflow-hidden", dca.status === 'active' && "border-primary/50")}>
                  <div className="p-4 flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold font-mono text-sm">{dca.tokenSymbol || "Unknown Token"}</span>
                        {getStatusBadge(dca.status)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {truncateAddress(dca.contractAddress)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-muted-foreground">
                        <span>Amount: <span className="text-foreground font-bold">{formatSol(dca.amountSol)} SOL</span></span>
                        <span>Interval: <span className="text-foreground">{dca.intervalHours}h</span></span>
                        <span>Executions: <span className="text-foreground">{dca.executionsCount}</span></span>
                        {dca.nextExecutionAt && dca.status === "active" && (
                          <span className="flex items-center gap-1 text-primary">
                            <Clock className="h-3 w-3" />
                            Next: {new Date(dca.nextExecutionAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-start">
                      {dca.status === "paused" || dca.status === "stopped" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 text-primary border-primary/20 hover:bg-primary/10 hover:border-primary/50"
                          onClick={() => {
                            startDcaSetup.mutate({ id: dca.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() }) });
                          }}
                          disabled={startDcaSetup.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      ) : dca.status === "active" ? (
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 text-amber-500 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/50"
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
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteDcaSetup.mutate({ id: dca.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDcaSetupsQueryKey() }) });
                        }}
                        disabled={deleteDcaSetup.isPending}
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
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">New DCA</CardTitle>
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
                      name="amountSol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Amount (SOL)</FormLabel>
                          <FormControl>
                            <Input type="number" step="any" className="font-mono bg-background" {...field} />
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
                          <FormLabel className="font-mono text-xs uppercase">Interval (Hrs)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.5" className="font-mono bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 mt-4 font-mono font-bold tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={createDcaSetup.isPending}
                  >
                    {createDcaSetup.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <Repeat className="mr-2 h-5 w-5" />
                        START DCA
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
