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

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('es-ES', { month: 'long' }) }));

export default function BillingPage() {
  const { panels, panelEvents } = useData();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const billingData = useMemo(() => {
    return panels.map(panel => 
      calculateMonthlyBillingForPanel(panel.codigo_parada, selectedYear, selectedMonth, panelEvents, panels)
    ).filter(record => record.billedDays > 0 || record.panelDetails?.status === 'installed');
  }, [panels, panelEvents, selectedYear, selectedMonth]);

  const totalBilledForMonth = useMemo(() => {
    return billingData.reduce((sum, record) => sum + record.amount, 0);
  }, [billingData]);

  const handleExport = () => {
    alert(`Exportando datos de facturación para ${months.find(m=>m.value === selectedMonth)?.label} ${selectedYear}... (No implementado)`);
    console.log("Export Data:", billingData);
  };

  const currentMonthLabel = months.find(m => m.value === selectedMonth)?.label;
  const capitalizedMonthLabel = currentMonthLabel ? currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1) : '';


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
              <TableHead className="text-center">Días Facturados</TableHead>
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
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay datos de facturación para el período seleccionado o no hay paneles activos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
