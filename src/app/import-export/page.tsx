
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, History, ListChecks, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ChangeEvent, useState } from 'react';
import type { Panel, PanelEvent, PanelStatus } from '@/types/piv'; 
import { ALL_PANEL_STATUSES } from '@/types/piv';
import { useData } from '@/contexts/data-provider';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

// Mapeo de nombres de columnas de Excel a claves de la interfaz Panel
const panelHeaderMapping: { [key: string]: keyof Panel | string } = {
  'codigo_parada': 'codigo_parada',
  'municipio': 'municipality',
  'cliente': 'client',
  'direccion': 'address',
  'latitud': 'latitude',
  'longitud': 'longitude',
  'fecha instalacion': 'installationDate',
  'estado': 'status',
  'notas': 'notes',
};

// Mapeo de nombres de columnas de Excel a claves de la interfaz PanelEvent
const eventHeaderMapping: { [key: string]: keyof PanelEvent | string } = {
  'panelid': 'panelId',
  'fecha': 'date',
  'estado anterior': 'oldStatus',
  'estado nuevo': 'newStatus',
  'notas evento': 'notes',
};

// Mapeo de valores de estado de Excel a PanelStatus
const statusValueMapping: { [key: string]: PanelStatus } = {
  'instalado': 'installed',
  'eliminado': 'removed',
  'mantenimiento': 'maintenance',
  'pendiente instalacion': 'pending_installation',
  'pendiente eliminación': 'pending_removal',
  'desconocido': 'unknown',
};


export default function ImportExportPage() {
  const { toast } = useToast();
  const { importInitialData, importMonthlyEvents } = useData();
  const [isImporting, setIsImporting] = useState(false);

  const normalizeHeader = (header: string) => header.toLowerCase().trim();

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, type: 'initial' | 'monthly') => {
    const file = event.target.files?.[0];
    if (!file) {
      toast({ title: "Ningún archivo seleccionado", variant: "destructive" });
      return;
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) { // CSV might need different parsing
       toast({ title: "Tipo de Archivo Inválido", description: "Por favor, sube un archivo Excel (.xlsx, .xls).", variant: "destructive" });
       return;
    }
    
    setIsImporting(true);
    toast({ title: "Procesando archivo...", description: `Importando ${file.name}. Por favor, espera.` });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result;
        if (!arrayBuffer) {
          throw new Error("No se pudo leer el archivo.");
        }
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as any[];

        let result;
        if (type === 'initial') {
          const panelsToImport: Partial<Panel>[] = jsonData.map(row => {
            const panel: Partial<Panel> = {};
            for (const excelHeader in row) {
              const normalizedExcelHeader = normalizeHeader(excelHeader);
              const panelKey = panelHeaderMapping[normalizedExcelHeader] as keyof Panel;
              if (panelKey) {
                if (panelKey === 'status') {
                  panel[panelKey] = statusValueMapping[normalizeHeader(String(row[excelHeader]))] || 'unknown';
                } else if (panelKey === 'installationDate' && row[excelHeader] instanceof Date) {
                   panel[panelKey] = format(row[excelHeader] as Date, 'yyyy-MM-dd');
                } else if ((panelKey === 'latitude' || panelKey === 'longitude') && row[excelHeader] !== undefined && row[excelHeader] !== null) {
                    panel[panelKey] = parseFloat(String(row[excelHeader]));
                } else {
                  panel[panelKey] = row[excelHeader];
                }
              }
            }
            return panel;
          });
          result = await importInitialData(panelsToImport);
        } else { // monthly
          const eventsToImport: Partial<PanelEvent>[] = jsonData.map(row => {
            const panelEvent: Partial<PanelEvent> = {};
             for (const excelHeader in row) {
              const normalizedExcelHeader = normalizeHeader(excelHeader);
              const eventKey = eventHeaderMapping[normalizedExcelHeader] as keyof PanelEvent;
              if (eventKey) {
                 if (eventKey === 'date' && row[excelHeader] instanceof Date) {
                   panelEvent[eventKey] = format(row[excelHeader] as Date, 'yyyy-MM-dd');
                } else if (eventKey === 'newStatus' || eventKey === 'oldStatus') {
                  panelEvent[eventKey] = statusValueMapping[normalizeHeader(String(row[excelHeader]))] || (eventKey === 'oldStatus' ? undefined : 'unknown');
                }
                else {
                  panelEvent[eventKey] = row[excelHeader];
                }
              }
            }
            return panelEvent;
          });
          result = await importMonthlyEvents(eventsToImport);
        }

        if (result.success) {
          toast({ 
            title: "Importación Exitosa", 
            description: `${result.message} Filas procesadas: ${jsonData.length}.`
          });
        } else {
          toast({ 
            title: "Falló la Importación", 
            description: `${result.message} ${result.errors && result.errors.length > 0 ? `Errores: ${result.errors.join('; ')}` : ''}`, 
            variant: "destructive",
            duration: result.errors && result.errors.length > 5 ? 15000 : 9000 // Longer duration for many errors
          });
        }

      } catch (error: any) {
          toast({ title: "Error de Importación", description: error.message || "Falló el procesamiento del archivo Excel.", variant: "destructive" });
      } finally {
          setIsImporting(false);
          if (event.target) event.target.value = ''; // Reset file input
      }
    };
    reader.onerror = () => {
        toast({ title: "Error de Lectura", description: "No se pudo leer el archivo seleccionado.", variant: "destructive"});
        setIsImporting(false);
        if (event.target) event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExport = (dataType: 'panels' | 'events' | 'billing') => {
    alert(`Exportando datos de ${dataType === 'panels' ? 'paneles' : dataType === 'events' ? 'eventos' : 'facturación'}... (No implementado)`);
    // TODO: Implement actual export functionality using SheetJS (XLSX.utils.json_to_sheet and XLSX.writeFile)
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Importar y Exportar Datos"
        description="Gestiona operaciones masivas de datos mediante archivos Excel."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><FileUp className="text-primary"/>Importar Datos</CardTitle>
            <CardDescription>Importa datos de paneles PIV o cambios de estado mensuales desde archivos Excel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="initial-data-file" className="text-sm font-medium">Importar Datos Iniciales de Paneles</Label>
              <Input id="initial-data-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'initial')} disabled={isImporting} />
              <p className="text-xs text-muted-foreground mt-1">Configuración única para todos los datos maestros de paneles. Columnas esperadas: codigo_parada, municipio, cliente, direccion, latitud, longitud, fecha instalacion (YYYY-MM-DD), estado, notas.</p>
            </div>
            <hr/>
            <div>
              <Label htmlFor="monthly-events-file" className="text-sm font-medium">Importar Eventos Mensuales</Label>
              <Input id="monthly-events-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'monthly')} disabled={isImporting} />
              <p className="text-xs text-muted-foreground mt-1">Registra todos los cambios de estado de los paneles. Columnas esperadas: panelid, fecha (YYYY-MM-DD), estado anterior, estado nuevo, notas evento.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><FileDown className="text-accent"/>Exportar Datos</CardTitle>
            <CardDescription>Exporta varios conjuntos de datos a Excel para análisis o copia de seguridad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => handleExport('panels')} className="w-full justify-start" variant="outline">
              <ListChecks className="mr-2 h-4 w-4" /> Exportar Todos los Datos de Paneles
            </Button>
            <Button onClick={() => handleExport('events')} className="w-full justify-start" variant="outline">
              <History className="mr-2 h-4 w-4" /> Exportar Historial Completo de Eventos
            </Button>
            <Button onClick={() => handleExport('billing')} className="w-full justify-start" variant="outline">
              <Download className="mr-2 h-4 w-4" /> Exportar Vista Actual de Facturación Mensual
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-lg mt-6">
        <CardHeader>
            <CardTitle className="font-headline">Notas de Validación de Datos Durante la Importación</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Campos Requeridos:</strong> Paneles (codigo_parada, municipio, cliente, direccion, estado), Eventos (panelid, fecha, estado nuevo).</p>
            <p><strong>Unicidad:</strong> 'codigo_parada' debe ser único para la importación inicial de paneles. No se sobrescribirán paneles existentes con el mismo ID; se reportarán como errores.</p>
            <p><strong>Existencia de Panel:</strong> Para eventos, el 'panelid' debe corresponder a un panel existente.</p>
            <p><strong>Tipos de Dato:</strong> Se intentará convertir fechas (esperadas como fechas de Excel o formato YYYY-MM-DD) y números. Los estados deben coincidir con los valores predefinidos (ej. "Instalado", "Mantenimiento").</p>
            <p><strong>Prevención de Duplicados de Eventos:</strong> Se omitirán eventos si ya existe uno idéntico (mismo panel, fecha, estado anterior y nuevo).</p>
        </CardContent>
      </Card>
    </div>
  );
}

