"use client";
import { useData } from "@/contexts/data-provider";
import MetricCard from "./metric-card";
import { AlertTriangle, DollarSign, PowerOff, Power, CalendarClock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { calculateMonthlyBillingForPanel } from "@/lib/billing-utils";
import type { Panel } from "@/types/piv";
import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";

// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export function KeyMetrics() {
  const { panels, panelEvents } = useData();
  const [monthlyBilledAmount, setMonthlyBilledAmount] = useState(0);

  const activePanels = useMemo(() => panels.filter(p => p.status === 'installed').length, [panels]);
  const inactivePanels = useMemo(() => panels.length - activePanels, [panels, activePanels]);

  useEffect(()  => {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    let totalBilled = 0;
    panels.forEach(panel => {
      const panelBilling = calculateMonthlyBillingForPanel(panel.codigo_parada, currentYear, currentMonth, panelEvents, panels);
      totalBilled += panelBilling.amount;
    });
    setMonthlyBilledAmount(totalBilled);
  }, [panels, panelEvents]);

  const warnings = useMemo(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
    
    return panels.filter(panel => {
      // Consider panels that are not 'pending_installation' or 'pending_removal' for this warning
      if (panel.status === 'pending_installation' || panel.status === 'pending_removal') {
        return false;
      }

      const lastKnownDate = panel.lastStatusUpdate ? parseDate(panel.lastStatusUpdate) : (panel.installationDate ? parseDate(panel.installationDate) : null);
      
      if (lastKnownDate) {
        return lastKnownDate < threeMonthsAgo;
      }
      // If no dates at all, maybe flag it, or not, depending on desired behavior. For now, only flag if we have a date.
      return false; 
    });
  }, [panels]);


  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Active Panels" value={activePanels} icon={Power} description="Currently installed & operational." />
        <MetricCard title="Inactive/Other" value={inactivePanels} icon={PowerOff} description="Removed, maintenance, pending." />
        <MetricCard title="Billed This Month" value={`$${monthlyBilledAmount.toFixed(2)}`} icon={DollarSign} description="Estimated total billing." />
        <MetricCard title="Needs Attention" value={warnings.length} icon={AlertTriangle} description="No status change in 3+ months." />
      </div>
      
      {warnings.length > 0 && (
        <Card className="mt-6 shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline text-destructive">
              <AlertTriangle/>Warnings
            </CardTitle>
            <CardDescription>Panels with no status changes in the last 3 months (excluding pending states).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Panel ID</TableHead>
                    <TableHead>Municipality</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"><CalendarClock className="inline-block mr-1 h-4 w-4" />Last Update</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warnings.map(panel => (
                    <TableRow key={panel.codigo_parada}>
                      <TableCell className="font-medium">
                        <Link href={`/panels/${panel.codigo_parada}`} className="text-primary hover:underline">
                          {panel.codigo_parada}
                        </Link>
                      </TableCell>
                      <TableCell>{panel.municipality}</TableCell>
                      <TableCell>{panel.client}</TableCell>
                      <TableCell><Badge variant={panel.status === 'installed' ? 'default' : 'secondary'}>{panel.status}</Badge></TableCell>
                      <TableCell className="text-right">{panel.lastStatusUpdate ? new Date(panel.lastStatusUpdate).toLocaleDateString() : 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
