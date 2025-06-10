
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useData } from '@/contexts/data-provider';
import { calculateMonthlyBillingForPanel } from '@/lib/billing-utils';
import type { BillingRecord, Panel } from '@/types/piv'; 
import { Eye, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('es-ES', { month: 'long' }) }));

export default function BillingPage() {
  const { panels, panelEvents } = useData();
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [isExporting, setIsExporting] = useState(false);

  const billingData = useMemo(() => {
    return panels
      .map(panel => {
         return calculateMonthlyBillingForPanel(panel.codigoParada, selectedYear, selectedMonth, panelEvents, panels);
      })
      .filter(record => record.billedDays > 0 || record.panelDetails?.status === 'installed'); 
  }, [panels, panelEvents, selectedYear, selectedMonth]);

  const totalBilledForMonth = useMemo(() => {
    return billingData.reduce((sum, record) => sum + record.amount, 0);
  }, [billingData]);

  const currentMonthLabel = months.find(m=>m.value === selectedMonth)?.label;
  const capitalizedMonthLabel = currentMonthLabel ? currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1) : '';

  const handleExport = () => {
    if (billingData.length === 0) {
      toast({ title: "Sin Datos", description: "No hay datos de facturación para exportar para el período seleccionado."});
      return;
    }
    setIsExporting(true);
    toast({ title: "Iniciando Exportación...", description: `Preparando datos de facturación para ${capitalizedMonthLabel} ${selectedYear}.`});

    try {
      const exportData = billingData.map(record => ({
        'ID Panel': record.panelId,
        'Cliente': record.panelDetails?.cliente || 'N/A', 
        'Municipio': record.panelDetails?.municipioMarquesina || 'N/A', 
        'Días Facturados (Base 30)': record.billedDays,
        'Importe (€)': record.amount.toFixed(2),
        'Estado': record.panelDetails?.status ? record.panelDetails.status.replace(/_/g, ' ') : 'N/A',
        'Dirección': record.panelDetails?.direccion || 'N/A', 
        'Fecha Instalación PIV': record.panelDetails?.fechaInstalacion || 'N/A' 
      }));

      exportData.push({
        'ID Panel': 'TOTAL',
        'Cliente': '',
        'Municipio': '',
        'Días Facturados (Base 30)': billingData.reduce((sum, r) => sum + r.billedDays, 0),
        'Importe (€)': totalBilledForMonth.toFixed(2),
        'Estado': '',
        'Dirección': '',
        'Fecha Instalación PIV': ''
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      
      const colWidths = [
        { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 25 },
        { wch: 15 }, { wch: 20 }, { wch: 35 }, { wch: 20 }
      ];
      ws['!cols'] = colWidths;

      const sheetName = `Facturación ${capitalizedMonthLabel} ${selectedYear}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const fileName = `Facturacion_${capitalizedMonthLabel}_${selectedYear}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({ title: "Exportación Completada", description: `Archivo exportado: ${fileName}`});
      
    } catch (error: any) {
      console.error('Error exportando facturación:', error);
      toast({ title: "Error al Exportar", description: `No se pudo generar el archivo de facturación. ${error.message || ''}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  return (
    <div className="space-y-6">
      <PageHeader 
        title="Facturación Mensual"
        description={`Ver y gestionar la facturación para ${capitalizedMonthLabel} ${selectedYear}.`}
        actions={
          <Button onClick={handleExport} variant="outline" disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {isExporting ? "Exportando..." : "Exportar a Excel"}
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
            <SelectTrigger><SelectValue placeholder="Seleccionar Año" /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
            <SelectTrigger><SelectValue placeholder="Seleccionar Mes" /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="sm:text-right">
            <p className="text-sm text-muted-foreground">Total Facturado:</p>
            <p className="text-2xl font-bold font-headline">€{totalBilledForMonth.toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID Panel</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Municipio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-center">Días Fact. (Base 30)</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billingData.map((record) => (
              <TableRow key={record.panelId}>
                <TableCell className="font-medium">{record.panelId}</TableCell>
                <TableCell>{record.panelDetails?.cliente || 'N/A'}</TableCell>
                <TableCell>{record.panelDetails?.municipioMarquesina || 'N/A'}</TableCell>
                <TableCell><Badge variant={record.panelDetails?.status === 'installed' ? 'default' : (record.panelDetails?.status === 'removed' ? 'destructive' : 'secondary') }>{record.panelDetails?.status?.replace(/_/g, ' ') || 'N/A'}</Badge></TableCell>
                <TableCell className="text-center">
                  {record.billedDays} / 30
                  <span className="text-xs text-muted-foreground block">(base estándar)</span>
                </TableCell>
                <TableCell className="text-right font-semibold">€{record.amount.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/billing/details?panelId=${record.panelId}&year=${selectedYear}&month=${selectedMonth}`} title="Ver Detalles de Facturación">
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {billingData.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay datos de facturación para el período seleccionado o no hay paneles activos con importe.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
