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
const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('default', { month: 'long' }) }));

export default function BillingPage() {
  const { panels, panelEvents } = useData();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const billingData = useMemo(() => {
    return panels.map(panel => 
      calculateMonthlyBillingForPanel(panel.codigo_parada, selectedYear, selectedMonth, panelEvents, panels)
    ).filter(record => record.billedDays > 0 || record.panelDetails?.status === 'installed'); // Show if billable or currently installed
  }, [panels, panelEvents, selectedYear, selectedMonth]);

  const totalBilledForMonth = useMemo(() => {
    return billingData.reduce((sum, record) => sum + record.amount, 0);
  }, [billingData]);

  const handleExport = () => {
    // Placeholder for Excel export functionality
    alert(`Exporting billing data for ${months.find(m=>m.value === selectedMonth)?.label} ${selectedYear}... (Not implemented)`);
    console.log("Export Data:", billingData);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Monthly Billing"
        description={`View and manage billing for ${months.find(m=>m.value === selectedMonth)?.label} ${selectedYear}.`}
        actions={
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Export to Excel
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
            <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
            <SelectTrigger><SelectValue placeholder="Select Month" /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="sm:text-right">
            <p className="text-sm text-muted-foreground">Total Billed:</p>
            <p className="text-2xl font-bold font-headline">${totalBilledForMonth.toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Panel ID</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Municipality</TableHead>
              <TableHead className="text-center">Billed Days</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billingData.map((record) => (
              <TableRow key={record.panelId}>
                <TableCell className="font-medium">{record.panelId}</TableCell>
                <TableCell>{record.panelDetails?.client || 'N/A'}</TableCell>
                <TableCell>{record.panelDetails?.municipality || 'N/A'}</TableCell>
                <TableCell className="text-center">{record.billedDays} / {record.totalDaysInMonth}</TableCell>
                <TableCell className="text-right font-semibold">${record.amount.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/billing/details?panelId=${record.panelId}&year=${selectedYear}&month=${selectedMonth}`} title="View Billing Details">
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {billingData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No billing data for the selected period or no active panels.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
