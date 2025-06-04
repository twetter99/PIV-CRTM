
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useData } from '@/contexts/data-provider';
import { calculateMonthlyBillingForPanel } from '@/lib/billing-utils';
import type { BillingRecord, Panel } from '@/types/piv';
import { Eye, Download } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as XLSX from 'xlsx';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('es-ES', { month: 'long' }) }));

export default function BillingPage() {
  const { panels, panelEvents } = useData();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const billingData = useMemo(() => {
    return panels
      .filter(panel => panel.status === 'installed' && panel.importe_mensual && panel.importe_mensual > 0)
      .map(panel => {
        // Para la vista de resumen, mostramos el importe mensual fijo si está instalado.
        // El cálculo prorrateado detallado se usa en la vista de detalles.
        // O, si queremos que la tabla principal también muestre prorrateo, usamos calculateMonthlyBillingForPanel
        // Por ahora, mantendremos el importe_mensual si está instalado todo el mes conceptualmente.
        // La función calculateMonthlyBillingForPanel es más para el desglose detallado.
        // Vamos a usar calculateMonthlyBillingForPanel para consistencia y prorrateo en la tabla principal también.
         return calculateMonthlyBillingForPanel(panel.codigo_parada, selectedYear, selectedMonth, panelEvents, panels);
      })
      .filter(record => record.billedDays > 0 || record.panelDetails?.status === 'installed'); // Mostrar aunque los días facturados sean 0 si está instalado
  }, [panels, panelEvents, selectedYear, selectedMonth]);

  const totalBilledForMonth = useMemo(() => {
    return billingData.reduce((sum, record) => sum + record.amount, 0);
  }, [billingData]);

  const currentMonthLabel = months.find(m=>m.value === selectedMonth)?.label;
  const capitalizedMonthLabel = currentMonthLabel ? currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1) : '';

  const handleExport = () => {
    try {
      // Preparar datos para exportación
      const exportData = billingData.map(record => ({
        'ID Panel': record.panelId,
        'Cliente': record.panelDetails?.client || 'N/A',
        'Municipio': record.panelDetails?.municipality || 'N/A',
        'Días Facturados': record.billedDays,
        'Total Días Mes': record.totalDaysInMonth,
        'Importe (€)': record.amount.toFixed(2),
        'Estado': record.panelDetails?.status ? record.panelDetails.status.replace(/_/g, ' ') : 'N/A',
        'Dirección': record.panelDetails?.address || 'N/A',
        'Fecha Instalación': record.panelDetails?.installationDate || 'N/A'
      }));

      // Agregar fila de totales
      exportData.push({
        'ID Panel': 'TOTAL',
        'Cliente': '',
        'Municipio': '',
        'Días Facturados': billingData.reduce((sum, r) => sum + r.billedDays, 0),
        'Total Días Mes': '',
        'Importe (€)': totalBilledForMonth.toFixed(2),
        'Estado': '',
        'Dirección': '',
        'Fecha Instalación': ''
      });

      // Crear workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      
      // Configurar ancho de columnas
      const colWidths = [
        { wch: 12 }, // ID Panel
        { wch: 25 }, // Cliente
        { wch: 20 }, // Municipio
        { wch: 15 }, // Días Facturados
        { wch: 15 }, // Total Días Mes
        { wch: 12 }, // Importe (€)
        { wch: 20 }, // Estado
        { wch: 30 }, // Dirección
        { wch: 15 }  // Fecha Instalación
      ];
      ws['!cols'] = colWidths;

      // Agregar hoja al workbook
      const sheetName = `Facturación ${capitalizedMonthLabel} ${selectedYear}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      // Descargar archivo
      const fileName = `Facturacion_${capitalizedMonthLabel}_${selectedYear}.xlsx`;
      XLSX.writeFile(wb, fileName);

      // Mostrar confirmación
      alert(`Archivo exportado: ${fileName}`);
      
    } catch (error) {
      console.error('Error exportando:', error);
      alert('Error al exportar el archivo. Revise la consola para más detalles.');
    }
  };


  return (
    <div className="space-y-6">
      <PageHeader 
        title="Facturación Mensual"
        description={`Ver y gestionar la facturación para ${capitalizedMonthLabel} ${selectedYear}.`}
        actions={
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Exportar a Excel
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
              <TableHead className="text-center">Días Fact.</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billingData.map((record) => (
              <TableRow key={record.panelId}>
                <TableCell className="font-medium">{record.panelId}</TableCell>
                <TableCell>{record.panelDetails?.client || 'N/A'}</TableCell>
                <TableCell>{record.panelDetails?.municipality || 'N/A'}</TableCell>
                <TableCell><Badge variant={record.panelDetails?.status === 'installed' ? 'default' : (record.panelDetails?.status === 'removed' ? 'destructive' : 'secondary') }>{record.panelDetails?.status?.replace(/_/g, ' ') || 'N/A'}</Badge></TableCell>
                <TableCell className="text-center">{record.billedDays} / {record.totalDaysInMonth}</TableCell>
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
