
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUp, FileDown, History, ListChecks, Download, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
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

// Helper function to clean data from XLSX
function cleanExcelData(rawData: any[]): any[] {
  if (!rawData) return [];

  const cleanedData = rawData
    .map(row => {
      const cleanedRow: { [key: string]: any } = {};
      let hasData = false;
      for (const key in row) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          const trimmedKey = key.trim(); 
          if (!trimmedKey.startsWith("__EMPTY")) { 
            const value = row[key];
            cleanedRow[trimmedKey] = typeof value === 'string' ? value.trim() : value;
            const finalValue = cleanedRow[trimmedKey];
            if (finalValue !== null && finalValue !== undefined && String(finalValue).trim() !== "") {
              hasData = true;
            }
          }
        }
      }
      return hasData ? cleanedRow : null;
    })
    .filter(row => row !== null);
  
  return cleanedData as any[];
}

const providerToExcelMap: { [providerKey: string]: string[] } = {
  'codigoParada': ['codigoParada'],
  'fechaInstalacion': ['fechaInstalacion'],
  'fechaDesinstalacion': ['fechaDesinstalacion'],
  'fechaReinstalacion': ['fechaReinstalacion'],
  'importeMensual': ['importeMensual'],
  'municipioMarquesina': ['municipioMarquesina'],
  'cliente': ['cliente'],
  'direccion': ['direccion'],
  'observaciones': ['observaciones'],
  'codigoMarquesina': ['codigoMarquesina'],
  'vigencia': ['vigencia'],
  'tipoPiv': ['tipoPiv'],
  'industrial': ['industrial'],
  'empresaConcesionaria': ['empresaConcesionaria'],
  'op1': ['op1'],
  'op2': ['op2'],
  'marquesinaCce': ['marquesinaCce'],
  'direccionCce': ['direccionCce'],
  'ultimaInstalacionOReinstalacion': ['ultimaInstalacionOReinstalacion'],
  'cambioUbicacionReinstalacionesContrato2024_2025': ['cambioUbicacionReinstalacionesContrato2024_2025'],
  'reinstalacionVandalizados': ['reinstalacionVandalizados'],
  'garantiaCaducada': ['garantiaCaducada'],
  'descripcionCorta': ['descripcionCorta'],
  'codigoPivAsignado': ['codigoPivAsignado'],
};


function mapAndEnsureColumns(cleanedData: any[], type: 'initial' | 'monthly'): any[] {
  if (type === 'initial') {
    return cleanedData.map(rowFromExcel => {
      const mappedRowForProvider: { [key: string]: any } = {};
      for (const excelHeader in rowFromExcel) {
        if (Object.prototype.hasOwnProperty.call(rowFromExcel, excelHeader)) {
          mappedRowForProvider[excelHeader] = rowFromExcel[excelHeader];
        }
      }
      for (const providerKey in providerToExcelMap) {
        if (mappedRowForProvider[providerKey] === undefined) { 
            let valueFound = undefined;
            for (const excelHeaderCandidate of providerToExcelMap[providerKey]) {
              if (Object.prototype.hasOwnProperty.call(rowFromExcel, excelHeaderCandidate)) {
                valueFound = rowFromExcel[excelHeaderCandidate];
                break; 
              }
            }
            mappedRowForProvider[providerKey] = valueFound;
        }
      }
      return mappedRowForProvider;
    });
  }
  return cleanedData;
}


interface ColumnValidationResult {
  valid: boolean;
  missing: string[];
  available: string[];
}

function validateColumns(data: any[], type: 'initial' | 'monthly'): ColumnValidationResult {
  const availableKeys: string[] = (data && data.length > 0 && data[0]) ? Object.keys(data[0]) : [];

  let requiredHeaders: string[] = [];
  if (type === 'initial') {
    requiredHeaders = [
        "codigoParada", 
        "municipioMarquesina",
        "vigencia", 
        "fechaInstalacion",
        "importeMensual", 
        "empresaConcesionaria", 
        "direccion", 
    ]; 
  } else { 
    // Para eventos mensuales, las cabeceras requeridas en el archivo Excel (case-insensitive en la lógica de importación)
    requiredHeaders = ["panelid", "fecha", "tipo evento"]; // "estado anterior", "estado nuevo" son opcionales para la lógica de importación si se usa tipo de evento
  }

  if (data.length === 0 && requiredHeaders.length > 0) {
     return { valid: false, missing: requiredHeaders, available: [] };
  }
  
  const missing = requiredHeaders.filter(reqHeader => {
    // Para importación inicial, comparamos con las claves camelCase de DataProvider (que ya están en mappedData)
    // Para importación mensual, las claves en mappedData deberían ser las cabeceras del Excel en minúsculas
    const keyToFind = type === 'initial' ? reqHeader : reqHeader.toLowerCase();
    return !availableKeys.some(avKey => (type === 'initial' ? avKey === keyToFind : avKey.toLowerCase() === keyToFind));
  });

  return {
    valid: missing.length === 0,
    missing,
    available: availableKeys, 
  };
}


export default function ImportExportPage() {
  const { toast } = useToast();
  const { panels, panelEvents, importInitialData, clearAllPivData } = useData();
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const isOperationInProgress = isImporting || isExporting || isClearing;


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
          toast({ title: "Error de Lectura", description: "No se pudo leer el archivo.", variant: "destructive"});
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }

        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true }); 
        
        if (workbook.SheetNames.length === 0) {
          toast({ title: "Archivo Excel Vacío", description: "El archivo no contiene hojas.", variant: "destructive" });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawJsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, range: type === 'initial' ? 4 : 0, defval: null }) as any[];

        console.log(`[Import Raw Excel Data - Type: ${type}] First 2 rows:`, rawJsonData.slice(0,2));

        const cleanedData = cleanExcelData(rawJsonData);
        console.log(`[Import Cleaned Data - Type: ${type}] First 2 rows (keys: ${cleanedData.length > 0 ? Object.keys(cleanedData[0]).join(', ') : 'N/A'}):`, cleanedData.slice(0,2));
        
        const mappedData = mapAndEnsureColumns(cleanedData, type);
        console.log(`[Import Mapped Data for Provider - Type: ${type}] First 2 rows (keys: ${mappedData.length > 0 ? Object.keys(mappedData[0]).join(', ') : 'N/A'}):`, mappedData.slice(0,2));


        if (mappedData.length === 0 && type === 'initial') {
           toast({ 
            title: "Datos No Encontrados (Paneles)", 
            description: "No se encontraron datos procesables. Verifique formato (cabeceras fila 5, datos fila 6) y contenido.", 
            variant: "destructive",
            duration: 9000 
          });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        } else if (mappedData.length === 0 && type === 'monthly') {
          toast({ 
            title: "Datos No Encontrados (Eventos)", 
            description: "No se encontraron eventos procesables. Verifique formato (cabeceras fila 1) y contenido.", 
            variant: "destructive",
            duration: 9000 
          });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }
        
        const columnValidation = validateColumns(mappedData, type);
        if (!columnValidation.valid) {
          const availableColsString = columnValidation.available.length > 0 ? columnValidation.available.join(', ') : 'Ninguna';
          const requiredColsString = columnValidation.missing.join(', ');
          let descriptionMessage = `Faltan columnas requeridas: ${requiredColsString}. `;
          descriptionMessage += `Columnas disponibles: ${availableColsString}. Verifique que el Excel contenga las cabeceras esperadas (para paneles: camelCase en fila 5; para eventos: en fila 1).`;
          
          toast({
            title: `Error de Cabeceras Requeridas (${type === 'initial' ? 'Para DataProvider' : 'En Excel de Eventos'})`,
            description: descriptionMessage,
            variant: "destructive",
            duration: 15000 
          });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }
        
        const result = await importInitialData(mappedData, type);


        if (result.success) {
          toast({ 
            title: "Importación Procesada", 
            description: `${result.message} Filas en archivo (después de limpieza): ${cleanedData.length}. Filas mapeadas: ${mappedData.length}. ${type === 'initial' ? 'Paneles añadidos/actualizados' : 'Eventos añadidos'}: ${result.addedCount || 0}. Omitidos: ${result.skippedCount || 0}.`,
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
          console.error(`Error en handleFileUpload (type: ${type}):`, error); 
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

  const handleExport = async (dataType: 'panels' | 'events' | 'billing') => {
    setIsExporting(true);
    toast({ title: "Iniciando Exportación...", description: `Preparando datos para ${dataType}.`});

    try {
      if (dataType === 'panels') {
        if (!panels || panels.length === 0) {
          toast({ title: "Sin Datos", description: "No hay datos de paneles para exportar.", variant: "default" });
          setIsExporting(false);
          return;
        }

        // Determinar todas las claves únicas de todos los paneles para las cabeceras
        const allKeys = new Set<string>();
        panels.forEach(panel => {
          Object.keys(panel).forEach(key => allKeys.add(key));
        });
        
        // Ordenar las claves: primero las de providerToExcelMap, luego el resto alfabéticamente
        const orderedProviderKeys = Object.keys(providerToExcelMap);
        const remainingKeys = Array.from(allKeys).filter(key => !orderedProviderKeys.includes(key)).sort();
        const finalHeaders = [...orderedProviderKeys, ...remainingKeys];

        // Mapear los nombres de las claves a las etiquetas del Excel (si es necesario y se define un mapa)
        // Por ahora, usaremos las claves directamente como cabeceras, ya que son camelCase y descriptivas
        const dataToExport = panels.map(panel => {
          const row: {[key: string]: any} = {};
          finalHeaders.forEach(header => {
            row[header] = panel[header as keyof Panel] !== undefined && panel[header as keyof Panel] !== null ? panel[header as keyof Panel] : '';
          });
          return row;
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport, { header: finalHeaders });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Todos los Paneles");
        const dateSuffix = format(new Date(), 'yyyy-MM-dd');
        XLSX.writeFile(wb, `Todos_Paneles_PIM_${dateSuffix}.xlsx`);
        toast({ title: "Exportación Completada", description: `Se exportaron ${panels.length} paneles.` });

      } else if (dataType === 'events') {
        if (!panelEvents || panelEvents.length === 0) {
          toast({ title: "Sin Datos", description: "No hay eventos para exportar.", variant: "default" });
          setIsExporting(false);
          return;
        }
        const dataToExport = panelEvents.map(event => ({
          'ID Evento': event.id,
          'ID Panel': event.panelId,
          'Tipo': event.tipo,
          'Fecha': event.fecha, // Ya está en YYYY-MM-DD
          'Notas': event.notes || '',
          // Los campos oldStatus y newStatus no son parte del modelo PanelEvent final, se usan internamente.
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Historial de Eventos");
        const dateSuffix = format(new Date(), 'yyyy-MM-dd');
        XLSX.writeFile(wb, `Historial_Eventos_PIM_${dateSuffix}.xlsx`);
        toast({ title: "Exportación Completada", description: `Se exportaron ${panelEvents.length} eventos.` });
      
      } else if (dataType === 'billing') {
        toast({ 
            title: "Exportar Facturación", 
            description: "Para exportar la vista actual de facturación, por favor usa el botón 'Exportar a Excel' en la página de Facturación Mensual.",
            duration: 7000
        });
      }
    } catch (error: any) {
      console.error(`Error exportando ${dataType}:`, error);
      toast({ title: "Error de Exportación", description: `No se pudo exportar ${dataType}. ${error.message || ''}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
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
              <Label htmlFor="initial-data-file" className="text-sm font-medium">Importar Datos Iniciales de Paneles (Excel)</Label>
              <Input id="initial-data-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'initial')} disabled={isOperationInProgress} />
              <p className="text-xs text-muted-foreground mt-1">Cabeceras (camelCase) en Fila 5, datos desde Fila 6. Requeridas: "codigoParada", "fechaInstalacion", etc.</p>
            </div>
            <hr/>
            <div>
              <Label htmlFor="monthly-events-file" className="text-sm font-medium">Importar Eventos Mensuales (Excel)</Label>
              <Input id="monthly-events-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'monthly')} disabled={isOperationInProgress} />
              <p className="text-xs text-muted-foreground mt-1">Cabeceras en Fila 1. Requeridas (case-insensitive): "panelid", "fecha", "tipo evento".</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline"><FileDown className="text-accent"/>Exportar Datos</CardTitle>
            <CardDescription>Exporta varios conjuntos de datos a Excel para análisis o copia de seguridad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => handleExport('panels')} className="w-full justify-start" variant="outline" disabled={isOperationInProgress}>
              {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ListChecks className="mr-2 h-4 w-4" /> Exportar Todos los Datos de Paneles
            </Button>
            <Button onClick={() => handleExport('events')} className="w-full justify-start" variant="outline" disabled={isOperationInProgress}>
              {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <History className="mr-2 h-4 w-4" /> Exportar Historial Completo de Eventos
            </Button>
            <Button onClick={() => handleExport('billing')} className="w-full justify-start" variant="outline" disabled={isOperationInProgress}>
              {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                disabled={isOperationInProgress}
                className="w-full sm:w-auto"
            >
                {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                {isClearing ? "Limpiando Datos..." : "Limpiar Todos los Datos PIV"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
                <AlertTriangle className="inline-block h-3 w-3 mr-1 text-destructive" />
                ¡Atención! Esta acción eliminará permanentemente todos los paneles y eventos.
            </p>
        </CardContent>
      </Card>

      <Card className="shadow-lg mt-6">
        <CardHeader>
            <CardTitle className="font-headline">Notas de Validación (Importación Inicial)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Formato Excel (Paneles):</strong> Cabeceras (camelCase) en Fila 5, datos desde Fila 6.</p>
            <p><strong>Formato Excel (Eventos):</strong> Cabeceras (case-insensitive) en Fila 1, datos desde Fila 2. Columnas "panelid", "fecha", "tipo evento" requeridas.</p>
            <p><strong>Fechas:</strong> Se intentan convertir a `YYYY-MM-DD` para uso interno. Formatos como DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD son comúnmente aceptados.</p>
            <p><strong>Mapeo Columnas (Paneles):</strong> Las cabeceras del Excel (ej. `codigoParada`) se usan como claves.</p>
            <p><strong>Columnas Requeridas (Paneles):</strong> `codigoParada`, `municipioMarquesina`, `vigencia`, `fechaInstalacion`, `importeMensual`, `empresaConcesionaria`, `direccion`. Si faltan, la importación puede fallar.</p>
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
              {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isClearing ? "Eliminando..." : "Sí, eliminar todos los datos"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
