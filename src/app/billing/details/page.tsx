"use client";
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useData } from '@/contexts/data-provider';
import { getPanelHistoryForBillingMonth, calculateMonthlyBillingForPanel } from '@/lib/billing-utils';
import type { DayStatus, BillingRecord } from '@/lib/billing-utils'; // Assuming DayStatus is exported
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parse } from 'date-fns';
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading Billing Details..." />
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!panelId || !year || !month || !billingSummary || !billingSummary.panelDetails) {
    return (
      <div>
        <PageHeader title="Invalid Billing Details Request" />
        <p>Please provide valid panel ID, year, and month.</p>
         <Button variant="outline" asChild className="mt-4">
            <Link href="/billing"><ArrowLeft className="mr-2 h-4 w-4" />Back to Billing Overview</Link>
          </Button>
      </div>
    );
  }
  
  const monthName = format(new Date(year, month - 1, 1), 'MMMM');

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Billing Details: ${billingSummary.panelDetails.codigo_parada}`}
        description={`Showing daily activity for ${monthName} ${year}. Client: ${billingSummary.panelDetails.client}`}
        actions={
           <Button variant="outline" asChild>
            <Link href="/billing"><ArrowLeft className="mr-2 h-4 w-4" />Back to Overview</Link>
          </Button>
        }
      />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Billing Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><strong>Panel ID:</strong> {billingSummary.panelId}</div>
          <div><strong>Address:</strong> {billingSummary.panelDetails.address}</div>
          <div><strong>Billed Days:</strong> {billingSummary.billedDays} / {billingSummary.totalDaysInMonth}</div>
          <div className="font-semibold"><strong>Amount:</strong> ${billingSummary.amount.toFixed(2)}</div>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Daily Event Log for {monthName} {year}</CardTitle>
          <CardDescription>Breakdown of panel status and billable days.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Billable?</TableHead>
                  <TableHead>Notes / Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyHistory.map((dayEntry) => (
                  <TableRow key={dayEntry.date}>
                    <TableCell>{format(parse(dayEntry.date, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(parse(dayEntry.date, 'yyyy-MM-dd', new Date()), 'EEEE')}</TableCell>
                    <TableCell><Badge variant={dayEntry.status === 'installed' ? 'default' : (dayEntry.status === 'removed' ? 'destructive' : 'secondary')}>{dayEntry.status.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="text-center">
                      {dayEntry.isBillable ? <CheckCircle className="h-5 w-5 text-green-600 mx-auto" /> : <XCircle className="h-5 w-5 text-red-600 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">{dayEntry.eventNotes}</TableCell>
                  </TableRow>
                ))}
                 {dailyHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No daily history found for this period.
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
    <Suspense fallback={<PageHeader title="Loading..." />}>
      <BillingDetailsContent />
    </Suspense>
  );
}
