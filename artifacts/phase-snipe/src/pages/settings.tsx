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
import { Settings as SettingsIcon, Save, Loader2, Shield, Bell } from "lucide-react";
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
        toast({ title: "Settings updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to update settings", description: String(err), variant: "destructive" });
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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Settings</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="bg-card/30 border-border">
            <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-foreground">Trading Defaults</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="defaultBuyAmountSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Default Buy Amount (SOL)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" className="font-mono bg-background" {...field} />
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
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Default Slippage (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" className="font-mono bg-background" {...field} />
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
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Priority Fee</FormLabel>
                    <FormControl>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background font-mono"
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

              <FormField
                control={form.control}
                name="autoApprove"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 bg-background/50">
                    <div className="space-y-0.5">
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Auto Approve TXs</FormLabel>
                      <p className="text-[10px] font-mono text-muted-foreground">Skip confirmation modals for faster execution</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="bg-card/30 border-border">
            <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-foreground">Notifications</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="notifyBuy"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 bg-background/50">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Buy Alerts</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifySell"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 bg-background/50">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Sell Alerts</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifySniper"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 bg-background/50">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Sniper Triggers</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifyWallet"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 bg-background/50">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Wallet Alerts</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="bg-card/30 border-border">
            <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-foreground">Security</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="sessionTimeoutMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Session Timeout (Minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" className="font-mono bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pinLockEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 bg-background/50 h-[68px]">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Require PIN</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              className="h-12 px-8 font-mono font-bold tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={updateSettings.isPending || !form.formState.isDirty}
            >
              {updateSettings.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Save className="mr-2 h-5 w-5" />
                  SAVE CONFIG
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
