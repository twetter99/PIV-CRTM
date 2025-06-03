
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, History, ListChecks, Download } from 'lucide-react'; // Iconos importados aquí
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ChangeEvent } from 'react';
import type { Panel, PanelEvent } from '@/types/piv'; 
import { useData } from '@/contexts/data-provider';


export default function ImportExportPage() {
  const { toast } = useToast();
  const { importInitialData, importMonthlyEvents } = useData();

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, type: 'initial' | 'monthly') => {
    const file = event.target.files?.[0];
    if (!file) {
      toast({ title: "Ningún archivo seleccionado", variant: "destructive" });
      return;
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
       toast({ title: "Tipo de Archivo Inválido", description: "Por favor, sube un archivo Excel (.xlsx, .xls) o CSV.", variant: "destructive" });
       return;
    }
    
    toast({ title: "Archivo Subido (Simulación)", description: `${file.name} listo para procesar. La importación real no está implementada en este prototipo.` });

    try {
      if (type === 'initial') {
        const mockPanels: Panel[] = [{ codigo_parada: 'IMP001', municipality: 'Ciudad Importada', client: 'Cliente Importado', address: 'C/ Falsa 123', status: 'pending_installation' }];
        const result = await importInitialData(mockPanels);
        if (result.success) {
          toast({ title: "Importación de Datos Iniciales Exitosa (Simulación)", description: "Datos de paneles importados." });
        } else {
          toast({ title: "Falló la Importación de Datos Iniciales (Simulación)", description: result.errors.join(', '), variant: "destructive" });
        }
      } else if (type === 'monthly') {
        const mockEvents: PanelEvent[] = [{id: crypto.randomUUID(), panelId: 'P001', date: new Date().toISOString().split('T')[0], oldStatus: 'installed', newStatus: 'maintenance', notes: 'Evento importado'}];
        const result = await importMonthlyEvents(mockEvents);
        if (result.success) {
          toast({ title: "Importación de Eventos Mensuales Exitosa (Simulación)", description: "Datos de eventos importados." });
        } else {
          toast({ title: "Falló la Importación de Eventos Mensuales (Simulación)", description: result.errors.join(', '), variant: "destructive" });
        }
      }
    } catch (error: any) {
        toast({ title: "Error de Importación", description: error.message || "Falló el procesamiento del archivo.", variant: "destructive" });
    } finally {
        event.target.value = '';
    }
  };

  const handleExport = (dataType: 'panels' | 'events' | 'billing') => {
    alert(`Exportando datos de ${dataType === 'panels' ? 'paneles' : dataType === 'events' ? 'eventos' : 'facturación'}... (No implementado)`);
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
              <Input id="initial-data-file" type="file" accept=".xlsx, .xls, .csv" className="mt-1" onChange={(e) => handleFileUpload(e, 'initial')} />
              <p className="text-xs text-muted-foreground mt-1">Configuración única para todos los datos maestros de paneles. 'codigo_parada' es el ID.</p>
            </div>
            <hr/>
            <div>
              <Label htmlFor="monthly-events-file" className="text-sm font-medium">Importar Eventos Mensuales</Label>
              <Input id="monthly-events-file" type="file" accept=".xlsx, .xls, .csv" className="mt-1" onChange={(e) => handleFileUpload(e, 'monthly')} />
              <p className="text-xs text-muted-foreground mt-1">Registra todos los cambios de estado de los paneles para un mes específico.</p>
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
            <CardTitle className="font-headline">Notas de Validación de Datos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Comprobación de Errores:</strong> El sistema realizará una robusta comprobación de errores durante las importaciones. Esto incluye validación de campos obligatorios, tipos de datos correctos y prevención de 'codigo_parada' duplicados para importaciones iniciales de paneles.</p>
            <p><strong>Prevención de Duplicados:</strong> Para importaciones de eventos mensuales, el sistema intentará prevenir eventos duplicados exactos (mismo panel, fecha y transición de estado) si ya están registrados.</p>
            <p><strong>Prevención de Sobrescritura:</strong> La importación inicial de datos de paneles no sobrescribirá paneles existentes con el mismo ID por defecto; los reportará como errores. Mecanismos específicos de actualización requerirían una funcionalidad separada.</p>
        </CardContent>
      </Card>
    </div>
  );
}

