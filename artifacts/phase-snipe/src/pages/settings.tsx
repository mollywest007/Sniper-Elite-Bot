import { 
  useGetSettings, 
  getGetSettingsQueryKey, 
  useUpdateSettings 
} from "@workspace/api-client-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Loader2, Shield, Bell, Zap } from "lucide-react";
import { SettingsUpdateDefaultPriorityFee } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  defaultBuyAmountSol: z.coerce.number().positive(),
  defaultSlippagePercent: z.coerce.number().min(0.1).max(100),
  defaultPriorityFee: z.nativeEnum(SettingsUpdateDefaultPriorityFee),
  autoApprove: z.boolean(),
  notifyBuy: z.boolean(),
  notifySell: z.boolean(),
  notifySniper: z.boolean(),
  notifyWallet: z.boolean(),
  pinLockEnabled: z.boolean(),
  sessionTimeoutMinutes: z.coerce.number().min(1).max(1440),
});

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaultBuyAmountSol: 0.1,
      defaultSlippagePercent: 1,
      defaultPriorityFee: "auto",
      autoApprove: false,
      notifyBuy: true,
      notifySell: true,
      notifySniper: true,
      notifyWallet: true,
      pinLockEnabled: false,
      sessionTimeoutMinutes: 60,
    },
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (settings && !initialized.current) {
      form.reset({
        defaultBuyAmountSol: settings.defaultBuyAmountSol,
        defaultSlippagePercent: settings.defaultSlippagePercent,
        defaultPriorityFee: settings.defaultPriorityFee as any,
        autoApprove: settings.autoApprove,
        notifyBuy: settings.notifyBuy,
        notifySell: settings.notifySell,
        notifySniper: settings.notifySniper,
        notifyWallet: settings.notifyWallet,
        pinLockEnabled: settings.pinLockEnabled,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      });
      initialized.current = true;
    }
  }, [settings, form]);

  function onSubmit(values: z.infer<typeof settingsSchema>) {
    updateSettings.mutate({
      data: {
        defaultBuyAmountSol: values.defaultBuyAmountSol,
        defaultSlippagePercent: values.defaultSlippagePercent,
        defaultPriorityFee: values.defaultPriorityFee,
        autoApprove: values.autoApprove,
        notifyBuy: values.notifyBuy,
        notifySell: values.notifySell,
        notifySniper: values.notifySniper,
        notifyWallet: values.notifyWallet,
        pinLockEnabled: values.pinLockEnabled,
        sessionTimeoutMinutes: values.sessionTimeoutMinutes,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Configuration Synced" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Sync failed", description: String(err), variant: "destructive" });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-primary" />
        System Config
      </h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="glass-panel">
            <CardHeader className="p-6 border-b border-border bg-card/40">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-foreground flex items-center gap-3">
                <Zap className="h-4 w-4 text-primary" /> Core Trading Directives
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="defaultBuyAmountSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Default Entry Size (SOL)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" className="font-mono bg-background/50 h-12 text-primary font-bold border-border focus:border-primary/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultSlippagePercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Default Tolerance (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" className="font-mono bg-background/50 h-12 border-border focus:border-primary/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultPriorityFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Network Tax Layer</FormLabel>
                    <FormControl>
                      <select 
                        className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-primary/50 font-mono transition-colors"
                        {...field}
                      >
                        <option value="auto">Auto (Dynamic)</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High (Maximum)</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="autoApprove"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 bg-background/30 mt-6">
                    <div className="space-y-1">
                      <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Zero-Click Exec</FormLabel>
                      <p className="text-[10px] font-mono text-muted-foreground">Bypass manual confirmations</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="p-6 border-b border-border bg-card/40">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-foreground flex items-center gap-3">
                <Bell className="h-4 w-4 text-primary" /> Telemetry routing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="notifyBuy"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background/30">
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Acquisition Logs</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifySell"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background/30">
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Liquidation Logs</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifySniper"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background/30">
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sniper Events</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifyWallet"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background/30">
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Wallet Ping</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" /></FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="p-6 border-b border-border bg-card/40">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-foreground flex items-center gap-3">
                <Shield className="h-4 w-4 text-primary" /> Sec-Protocol
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="sessionTimeoutMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Token TTL (Minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" className="font-mono bg-background/50 h-12 border-border focus:border-primary/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pinLockEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 bg-background/30 mt-6 h-12">
                    <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-foreground">Hardware Lock</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" /></FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4 pb-12">
            <Button 
              type="submit" 
              className="h-16 px-12 font-mono text-sm font-bold tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.4)] transition-all"
              disabled={updateSettings.isPending || !form.formState.isDirty}
            >
              {updateSettings.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Save className="mr-3 h-4 w-4" />
                  Flash Config
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
