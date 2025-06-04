
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, History, ListChecks, Download, Trash2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ChangeEvent, useState } from 'react';
import type { Panel, PanelEvent, PanelStatus } from '@/types/piv'; 
import { useData } from '@/contexts/data-provider';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export default function ImportExportPage() {
  const { toast } = useToast();
  const { importInitialData, clearAllPivData } = useData();
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);


  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, type: 'initial' | 'monthly') => {
    const file = event.target.files?.[0];
    if (!file) {
      toast({ title: "Ningún archivo seleccionado", variant: "destructive" });
      return;
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
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
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: type === 'monthly' }); // cellDates true for monthly as it has simpler structure
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        let jsonData;
        if (type === 'initial') {
          // Headers en fila 5 (índice 4), datos desde fila 6 (índice 5)
          jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, range: 4, defval: null }) as any[];
        } else { // monthly events
          jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null }) as any[];
        }
        
        const result = await importInitialData(jsonData, type);


        if (result.success) {
          toast({ 
            title: "Importación Procesada", 
            description: `${result.message} Registros en archivo: ${result.processedCount}. Añadidos: ${result.addedCount || 0}. Omitidos: ${result.skippedCount || 0}.`,
            duration: 9000
          });
        } else {
          const errorMessages = result.errors && result.errors.length > 0 
            ? `Errores: ${result.errors.join('; ')}` 
            : 'Revisa el formato del archivo y los datos.';
          toast({ 
            title: "Falló la Importación", 
            description: `${result.message || 'Error desconocido.'} ${errorMessages}`, 
            variant: "destructive",
            duration: (result.errors && result.errors.length > 5 ? 15000 : 9000) 
          });
        }

      } catch (error: any) {
          toast({ title: "Error de Importación", description: error.message || "Falló el procesamiento del archivo Excel.", variant: "destructive", duration: 9000 });
      } finally {
          setIsImporting(false);
          if (event.target) event.target.value = ''; 
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
  };

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      const result = await clearAllPivData();
      if (result.success) {
        toast({
          title: "Datos Eliminados",
          description: result.message || `Se eliminaron ${result.deletedCount} elementos.`,
        });
      } else {
        toast({
          title: "Error al Limpiar Datos",
          description: result.message || "No se pudieron eliminar los datos.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error Inesperado",
        description: error.message || "Ocurrió un error al limpiar los datos.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
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
              <Input id="initial-data-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'initial')} disabled={isImporting || isClearing} />
              <p className="text-xs text-muted-foreground mt-1">Importa datos de paneles. La fila 5 debe contener las cabeceras y los datos comenzar en la fila 6. Verifique las especificaciones de columnas exactas.</p>
            </div>
            <hr/>
            <div>
              <Label htmlFor="monthly-events-file" className="text-sm font-medium">Importar Eventos Mensuales</Label>
              <Input id="monthly-events-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'monthly')} disabled={isImporting || isClearing} />
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
            <Button onClick={() => handleExport('panels')} className="w-full justify-start" variant="outline" disabled={isImporting || isClearing}>
              <ListChecks className="mr-2 h-4 w-4" /> Exportar Todos los Datos de Paneles
            </Button>
            <Button onClick={() => handleExport('events')} className="w-full justify-start" variant="outline" disabled={isImporting || isClearing}>
              <History className="mr-2 h-4 w-4" /> Exportar Historial Completo de Eventos
            </Button>
            <Button onClick={() => handleExport('billing')} className="w-full justify-start" variant="outline" disabled={isImporting || isClearing}>
              <Download className="mr-2 h-4 w-4" /> Exportar Vista Actual de Facturación Mensual
            </Button>
          </CardContent>
        </Card>
      </div>

       <Card className="shadow-lg mt-6">
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Trash2 className="text-destructive"/>Acciones de Mantenimiento</CardTitle>
            <CardDescription>Operaciones para gestionar el estado general de los datos de la aplicación.</CardDescription>
        </CardHeader>
        <CardContent>
            <Button 
                variant="destructive" 
                onClick={() => setShowClearConfirm(true)} 
                disabled={isClearing || isImporting}
                className="w-full sm:w-auto"
            >
                <Trash2 className="mr-2 h-4 w-4" /> 
                {isClearing ? "Limpiando Datos..." : "Limpiar Todos los Datos PIV"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
                <AlertTriangle className="inline-block h-3 w-3 mr-1 text-destructive" />
                ¡Atención! Esta acción eliminará permanentemente todos los paneles y eventos. Úselo con precaución, por ejemplo, antes de una reimportación completa.
            </p>
        </CardContent>
      </Card>

      <Card className="shadow-lg mt-6">
        <CardHeader>
            <CardTitle className="font-headline">Notas de Validación de Datos Durante la Importación (Datos Iniciales)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Formato de Archivo:</strong> Cabeceras en Fila 5, datos desde Fila 6.</p>
            <p><strong>Campos Obligatorios (según cabeceras Excel):</strong> 'Código parada', 'Municipio Marquesina', 'Vigencia'.</p>
            <p><strong>Validación 'Código parada':</strong> No puede estar vacío. Debe ser único en el archivo y en la base de datos existente (se omitirán duplicados).</p>
            <p><strong>Validación 'Municipio Marquesina':</strong> Si está vacío, se usará "Sin especificar".</p>
            <p><strong>Validación 'Vigencia':</strong> Valores esperados: "OK", "En Rev.", "Mantenimiento", "Desinstalado", "Pendiente". Si está vacío o no coincide, se usará el estado por defecto "Pendiente Instalación".</p>
            <p><strong>Fechas:</strong> Se intentará convertir fechas de Excel (números de serie) y cadenas (formatos comunes como YYYY-MM-DD, DD/MM/YYYY) al formato YYYY-MM-DD. Fechas inválidas resultarán en campo vacío.</p>
            <p><strong>Filas Vacías:</strong> Las filas donde 'Código parada' esté completamente vacío serán omitidas.</p>
        </CardContent>
      </Card>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible y eliminará permanentemente todos los datos de paneles y eventos de la aplicación.
              No podrá recuperar estos datos. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowClearConfirm(false)} disabled={isClearing}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleClearData} disabled={isClearing}>
              {isClearing ? "Eliminando..." : "Sí, eliminar todos los datos"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

    