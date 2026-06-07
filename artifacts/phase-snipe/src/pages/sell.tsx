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
import { TrendingDown, Loader2 } from "lucide-react";
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Sell Position</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Select Position</h2>
          {positionsLoading ? (
            <Skeleton className="h-64 w-full bg-muted/50 rounded-md" />
          ) : !positions || positions.length === 0 ? (
            <div className="p-8 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-md">
              No open positions to sell
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map((pos) => (
                <div 
                  key={pos.id}
                  onClick={() => form.setValue("contractAddress", pos.contractAddress)}
                  className={cn(
                    "p-3 rounded-md border cursor-pointer transition-all hover:bg-accent/50",
                    selectedContract === pos.contractAddress ? "border-primary bg-primary/5" : "border-border bg-card/30"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold font-mono text-sm">{pos.tokenSymbol}</div>
                      <div className="text-xs text-muted-foreground font-mono">{truncateAddress(pos.contractAddress)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold">{formatSol(pos.valueSol)} SOL</div>
                      <div className={cn("text-xs font-mono", pos.pnlPercent >= 0 ? "text-primary" : "text-destructive")}>
                        {formatPercent(pos.pnlPercent)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Card className="bg-card/50 border-border sticky top-4">
            <CardHeader className="p-4 border-b border-border/50">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Execute Sell</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="percentOfPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Sell Amount (%)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="100" className="font-mono bg-background" {...field} disabled={!selectedContract} />
                        </FormControl>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          {PRESET_PERCENT.map(pct => (
                            <Button
                              key={pct}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!selectedContract}
                              className="font-mono text-xs h-8 border-border"
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="slippagePercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Slippage (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="font-mono bg-background" {...field} disabled={!selectedContract} />
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
                              disabled={!selectedContract}
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
                    className="w-full h-12 mt-4 font-mono font-bold tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={executeTrade.isPending || !selectedContract}
                  >
                    {executeTrade.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                      <>
                        <TrendingDown className="mr-2 h-5 w-5" />
                        EXECUTE SELL
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
