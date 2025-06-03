"use client";
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useData } from '@/contexts/data-provider';
import { getPanelHistoryForBillingMonth, calculateMonthlyBillingForPanel } from '@/lib/billing-utils';
import type { DayStatus, BillingRecord, PanelStatus as PanelStatusType } from '@/lib/billing-utils';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

function BillingDetailsContent() {
  const searchParams = useSearchParams();
  const { panels, panelEvents } = useData();

  const panelId = searchParams.get('panelId');
  const year = searchParams.get('year') ? parseInt(searchParams.get('year') as string) : null;
  const month = searchParams.get('month') ? parseInt(searchParams.get('month') as string) : null;

  const [dailyHistory, setDailyHistory] = useState<DayStatus[]>([]);
  const [billingSummary, setBillingSummary] = useState<BillingRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (panelId && year && month) {
      setIsLoading(true);
      const history = getPanelHistoryForBillingMonth(panelId, year, month, panelEvents, panels);
      const summary = calculateMonthlyBillingForPanel(panelId, year, month, panelEvents, panels);
      setDailyHistory(history);
      setBillingSummary(summary);
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [panelId, year, month, panelEvents, panels]);
  
  const formatStatus = (status: PanelStatusType) => {
    const statusMap: { [key in PanelStatusType]: string } = {
        'installed': 'Instalado',
        'removed': 'Eliminado',
        'maintenance': 'Mantenimiento',
        'pending_installation': 'Pendiente Instalación',
        'pending_removal': 'Pendiente Eliminación',
        'unknown': 'Desconocido'
    };
    return statusMap[status] || status.toString().replace(/_/g, ' ');
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cargando Detalles de Facturación..." />
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!panelId || !year || !month || !billingSummary || !billingSummary.panelDetails) {
    return (
      <div>
        <PageHeader title="Solicitud de Detalles de Facturación Inválida" />
        <p>Por favor, proporcione un ID de panel, año y mes válidos.</p>
         <Button variant="outline" asChild className="mt-4">
            <Link href="/billing"><ArrowLeft className="mr-2 h-4 w-4" />Volver a Resumen de Facturación</Link>
          </Button>
      </div>
    );
  }
  
  const monthName = format(new Date(year, month - 1, 1), 'MMMM', { locale: es });
  const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);


  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Detalles de Facturación: ${billingSummary.panelDetails.codigo_parada}`}
        description={`Mostrando actividad diaria para ${capitalizedMonthName} ${year}. Cliente: ${billingSummary.panelDetails.client}`}
        actions={
           <Button variant="outline" asChild>
            <Link href="/billing"><ArrowLeft className="mr-2 h-4 w-4" />Volver a Resumen</Link>
          </Button>
        }
      />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Resumen de Facturación</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><strong>ID Panel:</strong> {billingSummary.panelId}</div>
          <div><strong>Dirección:</strong> {billingSummary.panelDetails.address}</div>
          <div><strong>Días Facturados:</strong> {billingSummary.billedDays} / {billingSummary.totalDaysInMonth}</div>
          <div className="font-semibold"><strong>Importe:</strong> €{billingSummary.amount.toFixed(2)}</div>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Registro Diario de Eventos para {capitalizedMonthName} {year}</CardTitle>
          <CardDescription>Desglose del estado del panel y días facturables.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Día</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>¿Facturable?</TableHead>
                  <TableHead>Notas / Evento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyHistory.map((dayEntry) => (
                  <TableRow key={dayEntry.date}>
                    <TableCell>{format(parse(dayEntry.date, 'yyyy-MM-dd', new Date()), 'dd MMM, yyyy', { locale: es })}</TableCell>
                    <TableCell>{format(parse(dayEntry.date, 'yyyy-MM-dd', new Date()), 'EEEE', { locale: es }).replace(/^\w/, c => c.toUpperCase())}</TableCell>
                    <TableCell><Badge variant={dayEntry.status === 'installed' ? 'default' : (dayEntry.status === 'removed' ? 'destructive' : 'secondary')}>{formatStatus(dayEntry.status)}</Badge></TableCell>
                    <TableCell className="text-center">
                      {dayEntry.isBillable ? <CheckCircle className="h-5 w-5 text-green-600 mx-auto" /> : <XCircle className="h-5 w-5 text-red-600 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">{dayEntry.eventNotes}</TableCell>
                  </TableRow>
                ))}
                 {dailyHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No se encontró historial diario para este período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


export default function BillingDetailsPage() {
  return (
    <Suspense fallback={<PageHeader title="Cargando..." />}>
      <BillingDetailsContent />
    </Suspense>
  );
}
