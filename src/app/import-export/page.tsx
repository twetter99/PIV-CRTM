"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, History, ListChecks } from 'lucide-react';
import { Input } from '@/components/ui/input'; // For file input
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ChangeEvent } from 'react';
// Mock import for types
import type { Panel, PanelEvent } from '@/types/piv'; 
import { useData } from '@/contexts/data-provider';


export default function ImportExportPage() {
  const { toast } = useToast();
  const { importInitialData, importMonthlyEvents } = useData(); // Get import functions

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, type: 'initial' | 'monthly') => {
    const file = event.target.files?.[0];
    if (!file) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }

    // Basic client-side validation for file type (example)
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
       toast({ title: "Invalid File Type", description: "Please upload an Excel (.xlsx, .xls) or CSV file.", variant: "destructive" });
       return;
    }
    
    toast({ title: "File Uploaded (Mock)", description: `${file.name} ready for processing. Actual import not implemented in this scaffold.` });

    // Placeholder for actual file parsing and data import logic
    // For now, we'll simulate an import with mock data or just show a message.
    try {
      if (type === 'initial') {
        // const parsedData: Panel[] = await parseExcelFileForPanels(file); // You'd need a parsing library
        // const result = await importInitialData(parsedData);
        const mockPanels: Panel[] = [{ codigo_parada: 'IMP001', municipality: 'Import City', client: 'Import Client', address: '1 Test St', status: 'pending_installation' }];
        const result = await importInitialData(mockPanels); // Using mock data
        if (result.success) {
          toast({ title: "Initial Data Import Successful (Mock)", description: "Panel data imported." });
        } else {
          toast({ title: "Initial Data Import Failed (Mock)", description: result.errors.join(', '), variant: "destructive" });
        }
      } else if (type === 'monthly') {
        // const parsedEvents: PanelEvent[] = await parseExcelFileForEvents(file);
        // const result = await importMonthlyEvents(parsedEvents);
        const mockEvents: PanelEvent[] = [{id: crypto.randomUUID(), panelId: 'P001', date: new Date().toISOString().split('T')[0], oldStatus: 'installed', newStatus: 'maintenance', notes: 'Imported event'}];
        const result = await importMonthlyEvents(mockEvents); // Using mock data
        if (result.success) {
          toast({ title: "Monthly Events Import Successful (Mock)", description: "Event data imported." });
        } else {
          toast({ title: "Monthly Events Import Failed (Mock)", description: result.errors.join(', '), variant: "destructive" });
        }
      }
    } catch (error: any) {
        toast({ title: "Import Error", description: error.message || "Failed to process file.", variant: "destructive" });
    } finally {
        // Reset file input
        event.target.value = '';
    }
  };

  const handleExport = (dataType: 'panels' | 'events' | 'billing') => {
    // Placeholder for Excel export functionality
    alert(`Exporting ${dataType} data... (Not implemented)`);
    // Example: console.log("Export Data:", panels);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Import & Export Data"
        description="Manage bulk data operations via Excel files."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><FileUp className="text-primary"/>Import Data</CardTitle>
            <CardDescription>Import PIV panel data or monthly status changes from Excel files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="initial-data-file" className="text-sm font-medium">Import Initial Panel Data</Label>
              <Input id="initial-data-file" type="file" accept=".xlsx, .xls, .csv" className="mt-1" onChange={(e) => handleFileUpload(e, 'initial')} />
              <p className="text-xs text-muted-foreground mt-1">One-time setup for all panel master data. 'codigo_parada' is the ID.</p>
            </div>
            <hr/>
            <div>
              <Label htmlFor="monthly-events-file" className="text-sm font-medium">Import Monthly Events</Label>
              <Input id="monthly-events-file" type="file" accept=".xlsx, .xls, .csv" className="mt-1" onChange={(e) => handleFileUpload(e, 'monthly')} />
              <p className="text-xs text-muted-foreground mt-1">Register all status changes for panels for a specific month.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><FileDown className="text-accent"/>Export Data</CardTitle>
            <CardDescription>Export various data sets to Excel for analysis or backup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => handleExport('panels')} className="w-full justify-start" variant="outline">
              <ListChecks className="mr-2 h-4 w-4" /> Export All Panel Data
            </Button>
            <Button onClick={() => handleExport('events')} className="w-full justify-start" variant="outline">
              <History className="mr-2 h-4 w-4" /> Export All Event History
            </Button>
            <Button onClick={() => handleExport('billing')} className="w-full justify-start" variant="outline">
              <Download className="mr-2 h-4 w-4" /> Export Current Monthly Billing View
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-lg mt-6">
        <CardHeader>
            <CardTitle className="font-headline">Data Validation Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Error Checking:</strong> The system will perform robust error checking during imports. This includes validation for required fields, correct data types, and preventing duplicate 'codigo_parada' for initial panel imports.</p>
            <p><strong>Duplicate Prevention:</strong> For monthly event imports, the system will aim to prevent exact duplicate events (same panel, date, and status transition) if already registered.</p>
            <p><strong>Overwrite Prevention:</strong> Initial panel data import will not overwrite existing panels with the same ID by default; it will report them as errors. Specific update mechanisms would require a separate feature.</p>
        </CardContent>
      </Card>
    </div>
  );
}
