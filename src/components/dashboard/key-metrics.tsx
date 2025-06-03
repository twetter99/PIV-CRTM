
"use client";
import { useData } from "@/contexts/data-provider";
import MetricCard from "./metric-card";
import { AlertTriangle, Euro, PowerOff, Power, CalendarClock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { calculateMonthlyBillingForPanel } from "@/lib/billing-utils";
import type { Panel, PanelStatus } from "@/types/piv";
import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';


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
      if (panel.status === 'pending_installation' || panel.status === 'pending_removal') {
        return false;
      }

      const lastKnownDate = panel.lastStatusUpdate ? parseDate(panel.lastStatusUpdate) : (panel.installationDate ? parseDate(panel.installationDate) : null);
      
      if (lastKnownDate) {
        return lastKnownDate < threeMonthsAgo;
      }
      return false; 
    });
  }, [panels]);

  const formatStatusDisplay = (status: PanelStatus) => {
    const statusMap: { [key in PanelStatus]: string } = {
        'installed': 'Instalado',
        'removed': 'Eliminado',
        'maintenance': 'Mantenimiento',
        'pending_installation': 'Pendiente Instalación',
        'pending_removal': 'Pendiente Eliminación',
        'unknown': 'Desconocido'
    };
    return statusMap[status] || status.replace(/_/g, ' ');
  };


  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Paneles Activos" value={activePanels} icon={Power} description="Actualmente instalados y operativos." />
        <MetricCard title="Inactivos/Otros" value={inactivePanels} icon={PowerOff} description="Eliminados, mantenimiento, pendientes." />
        <MetricCard title="Facturado Este Mes" value={`€${monthlyBilledAmount.toFixed(2)}`} icon={Euro} description="Facturación total estimada." />
        <MetricCard title="Necesita Atención" value={warnings.length} icon={AlertTriangle} description="Sin cambio de estado en 3+ meses." />
      </div>
      
      {warnings.length > 0 && (
        <Card className="mt-6 shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline text-destructive">
              <AlertTriangle/>Advertencias
            </CardTitle>
            <CardDescription>Paneles sin cambios de estado en los últimos 3 meses (excluyendo estados pendientes).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Panel</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right"><CalendarClock className="inline-block mr-1 h-4 w-4" />Última Act.</TableHead>
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
                      <TableCell><Badge variant={panel.status === 'installed' ? 'default' : 'secondary'}>{formatStatusDisplay(panel.status)}</Badge></TableCell>
                      <TableCell className="text-right">{panel.lastStatusUpdate ? format(new Date(panel.lastStatusUpdate), 'dd/MM/yyyy', { locale: es }) : 'N/A'}</TableCell>
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

