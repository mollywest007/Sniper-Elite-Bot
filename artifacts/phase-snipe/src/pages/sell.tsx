import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useExecuteTrade, 
  useListPositions, 
  getListPositionsQueryKey,
  useGetSettings,
  getGetSettingsQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TrendingDown, Loader2, AlertCircle, Zap } from "lucide-react";
import { TradeInputType, TradeInputPriorityFee } from "@workspace/api-client-react";
import { formatSol, formatPercent, cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const sellSchema = z.object({
  contractAddress: z.string().min(1, "Select a position"),
  percentOfPosition: z.coerce.number().min(1).max(100),
  slippagePercent: z.coerce.number().min(0.1).max(100),
  priorityFee: z.nativeEnum(TradeInputPriorityFee),
});

const PRESET_PERCENT = [25, 50, 75, 100];

export default function Sell() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const executeTrade = useExecuteTrade();
  const { data: positions, isLoading: positionsLoading } = useListPositions({ query: { queryKey: getListPositionsQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const form = useForm<z.infer<typeof sellSchema>>({
    resolver: zodResolver(sellSchema),
    defaultValues: {
      contractAddress: "",
      percentOfPosition: 100,
      slippagePercent: settings?.defaultSlippagePercent || 1,
      priorityFee: (settings?.defaultPriorityFee as any) || "auto",
    },
  });

  const selectedContract = form.watch("contractAddress");
  const selectedPosition = positions?.find(p => p.contractAddress === selectedContract);

  function onSubmit(values: z.infer<typeof sellSchema>) {
    executeTrade.mutate({
      data: {
        type: TradeInputType.sell,
        contractAddress: values.contractAddress,
        percentOfPosition: values.percentOfPosition,
        slippagePercent: values.slippagePercent,
        priorityFee: values.priorityFee,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Sell order submitted", description: `Selling ${values.percentOfPosition}% of position` });
        form.reset({ ...values, contractAddress: "" });
        queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to execute sell", description: String(err), variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-black italic tracking-widest text-foreground uppercase flex items-center gap-3">
        <TrendingDown className="h-6 w-6 text-destructive" />
        Liquidate Position
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pl-1">Select Asset</h2>
          {positionsLoading ? (
            <Skeleton className="h-[400px] w-full bg-card border-border rounded-xl" />
          ) : !positions || positions.length === 0 ? (
            <div className="p-12 text-center text-sm  text-muted-foreground border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-4">
              <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
              <p>No open positions available to sell.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {positions.map((pos) => (
                <div 
                  key={pos.id}
                  onClick={() => form.setValue("contractAddress", pos.contractAddress)}
                  className={cn(
                    "p-5 rounded-xl border cursor-pointer transition-all hover:bg-accent group relative overflow-hidden",
                    selectedContract === pos.contractAddress 
                      ? "border-destructive bg-destructive/10 shadow-[inset_4px_0_0_0_hsl(var(--destructive))]" 
                      : "border-border bg-card/40 glass-panel"
                  )}
                >
                  {selectedContract === pos.contractAddress && (
                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-destructive/10 to-transparent pointer-events-none" />
                  )}
                  <div className="flex justify-between items-center relative z-10">
                    <div>
                      <div className="font-bold text-lg tracking-tight text-foreground flex items-center gap-2">
                        {pos.tokenSymbol}
                        {selectedContract === pos.contractAddress && <span className="text-[10px] bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">Selected</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground  mt-1 bg-background inline-block px-2 py-0.5 rounded border border-border">{truncateAddress(pos.contractAddress)}</div>
                    </div>
                    <div className="text-right">
                      <div className=" text-base font-bold text-foreground">{formatSol(pos.valueSol)} SOL</div>
                      <div className={cn("text-xs  mt-0.5 font-bold", pos.pnlPercent >= 0 ? "text-primary" : "text-destructive")}>
                        {pos.pnlPercent >= 0 ? "+" : ""}{formatPercent(pos.pnlPercent)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Card className="glass-panel corner-brackets border-destructive/30 sticky top-6 overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-destructive/10 blur-3xl -z-10 rounded-full" />
            <CardHeader className="p-8 border-b border-border bg-card/40">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-destructive flex items-center gap-2">
                <Zap className="h-4 w-4" /> Execution Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 relative z-10">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <div className="bg-background/30 p-6 rounded-xl border border-border space-y-6">
                    <FormField
                      control={form.control}
                      name="percentOfPosition"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-end mb-2">
                            <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Liquidation Amount (%)</FormLabel>
                            {selectedPosition && (
                              <span className="text-[10px]  text-muted-foreground font-bold">
                                Est: <span className="text-foreground">{formatSol((selectedPosition.valueSol * field.value) / 100)} SOL</span>
                              </span>
                            )}
                          </div>
                          <FormControl>
                            <Input type="number" min="1" max="100" className=" bg-background h-14 text-xl font-bold text-destructive border-border focus:border-destructive/50" {...field} disabled={!selectedContract} />
                          </FormControl>
                          <div className="grid grid-cols-4 gap-3 mt-4">
                            {PRESET_PERCENT.map(pct => (
                              <Button
                                key={pct}
                                type="button"
                                variant="outline"
                                disabled={!selectedContract}
                                className={cn(" text-xs font-bold h-10 border-border bg-background hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors",
                                  field.value === pct && "bg-destructive/10 border-destructive/50 text-destructive"
                                )}
                                onClick={() => form.setValue("percentOfPosition", pct)}
                              >
                                {pct}%
                              </Button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="slippagePercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Slippage (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className=" bg-background/50 h-12 border-border focus:border-destructive/50" {...field} disabled={!selectedContract} />
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
                          <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Network Priority</FormLabel>
                          <FormControl>
                            <select 
                              className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/50 disabled:cursor-not-allowed disabled:opacity-50  font-bold transition-colors"
                              {...field}
                              disabled={!selectedContract}
                            >
                              <option value="auto">Auto</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High (Fastest)</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-16 mt-4 text-sm font-bold tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_0_25px_-5px_hsl(var(--destructive)/0.6)] transition-all uppercase rounded-xl"
                    disabled={executeTrade.isPending || !selectedContract}
                  >
                    {executeTrade.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                      <>
                        <Zap className="mr-3 h-5 w-5 fill-current" />
                        Execute Sell Order
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
