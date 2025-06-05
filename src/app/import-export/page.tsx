
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
  
  // console.log("Cleaned Excel Data:", cleanedData); // Optional: for debugging
  return cleanedData as any[];
}

// Helper function to map Excel column names to application-expected names and ensure "Facturacion"
function mapAndEnsureColumns(cleanedData: any[], type: 'initial' | 'monthly'): any[] {
  if (type === 'initial') {
    // Define the mapping from actual Excel headers (after trimming by cleanExcelData)
    // to the names your DataProvider and validateColumns expect.
    const columnMapping: { [key: string]: string } = {
      'codigoParada': 'Código parada',
      'municipioMarquesina': 'Municipio Marquesina',
      'vigencia': 'Vigencia',
      // Map other relevant columns that DataProvider uses if their names differ
      'codigoMarquesina': 'Código Marquesina',
      'fechaInstalacion': 'PIV Instalado', // Assuming 'fechaInstalacion' from Excel maps to 'PIV Instalado'
      'fechaDesinstalacion': 'PIV Desinstalado', // Assuming 'fechaDesinstalacion' from Excel maps to 'PIV Desinstalado'
      'fechaReinstalacion': 'PIV Reinstalado', // Assuming 'fechaReinstalacion' from Excel maps to 'PIV Reinstalado'
      'tipoPiv': 'Tipo PIV',
      'industrial': 'Industrial',
      'empresaConcesionaria': 'Empresas concesionarias',
      'direccionCce': 'Direccion CCE (Clear Channel)',
      'ultimaInstalacionOReinstalacion': 'Última instalación/reinstalación',
      // Add any other mappings if needed. For example, if Excel has 'observaciones', map it to 'Observaciones'.
    };

    return cleanedData.map(row => {
      const mappedRow: { [key: string]: any } = {};
      for (const rawKey in row) {
        if (Object.prototype.hasOwnProperty.call(row, rawKey)) {
          // Use the mapped key if available, otherwise keep the original key (trimmed by cleanExcelData)
          mappedRow[columnMapping[rawKey] || rawKey] = row[rawKey];
        }
      }
      // Ensure "Facturacion" column is present; DataProvider expects it.
      // It will be used for 'importe_mensual_original', while 'importe_mensual' is forced to 0.
      if (!Object.prototype.hasOwnProperty.call(mappedRow, 'Facturacion')) {
        mappedRow['Facturacion'] = null; 
      }
      return mappedRow;
    });
  }
  // For 'monthly' type, if column names are different, a similar mapping would be needed.
  // For now, assuming monthly columns match or are handled by DataProvider.
  return cleanedData;
}


// Helper function to validate columns
interface ColumnValidationResult {
  valid: boolean;
  missing: string[];
  available: string[];
}

function validateColumns(data: any[], type: 'initial' | 'monthly'): ColumnValidationResult {
  const availableKeys: string[] = (data && data.length > 0 && data[0]) ? Object.keys(data[0]) : [];

  let requiredHeaders: string[] = [];
  let caseSensitiveComparison = true;

  if (type === 'initial') {
    // These are the names AFTER mapping by mapAndEnsureColumns
    requiredHeaders = ["Código parada", "Municipio Marquesina", "Vigencia", "Facturacion"]; 
    caseSensitiveComparison = true;
  } else { // monthly
    requiredHeaders = ["panelid", "fecha", "estado anterior", "estado nuevo"];
    caseSensitiveComparison = false; 
  }

  if (data.length === 0 && requiredHeaders.length > 0) {
     return { valid: false, missing: requiredHeaders, available: [] };
  }
  
  const comparableAvailableKeys = caseSensitiveComparison ? availableKeys : availableKeys.map(h => h.toLowerCase());

  const missing = requiredHeaders.filter(reqHeader => {
    const comparableReqHeader = caseSensitiveComparison ? reqHeader : reqHeader.toLowerCase();
    return !comparableAvailableKeys.includes(comparableReqHeader);
  });

  return {
    valid: missing.length === 0,
    missing,
    available: availableKeys, 
  };
}


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
          toast({ title: "Error de Lectura", description: "No se pudo leer el archivo.", variant: "destructive"});
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }

        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: type === 'monthly' });
        
        if (workbook.SheetNames.length === 0) {
          toast({ title: "Archivo Excel Vacío", description: "El archivo no contiene hojas.", variant: "destructive" });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        let rawJsonData;
        if (type === 'initial') {
          // Headers en fila 5 (índice 4), datos desde fila 6 (índice 5)
          rawJsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, range: 4, defval: null }) as any[];
        } else { // monthly events
          rawJsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null }) as any[];
        }

        const cleanedData = cleanExcelData(rawJsonData);
        // console.log(`[${type.toUpperCase()} Import] Cleaned Data (after cleanExcelData):`, cleanedData);

        const mappedData = mapAndEnsureColumns(cleanedData, type);
        // console.log(`[${type.toUpperCase()} Import] Mapped Data (after mapAndEnsureColumns):`, mappedData);


        if (mappedData.length === 0 && type === 'initial') {
           toast({ 
            title: "Datos No Encontrados", 
            description: "No se encontraron datos procesables después de la limpieza y mapeo. Verifique el formato del archivo (cabeceras en fila 5, datos desde fila 6) y que contenga información válida.", 
            variant: "destructive",
            duration: 9000 
          });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        } else if (mappedData.length === 0 && type === 'monthly') {
          toast({ 
            title: "Datos No Encontrados", 
            description: "No se encontraron eventos procesables después de la limpieza y mapeo. Verifique el formato del archivo y que contenga información válida.", 
            variant: "destructive",
            duration: 9000 
          });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }
        
        // Validate columns on the mapped data
        const columnValidation = validateColumns(mappedData, type);
        // console.log(`[${type.toUpperCase()} Import] Column Validation Result:`, columnValidation);

        if (!columnValidation.valid) {
          const availableColsString = columnValidation.available.length > 0 ? columnValidation.available.join(', ') : 'Ninguna';
          toast({
            title: "Error de Cabeceras",
            description: `Faltan columnas requeridas: ${columnValidation.missing.join(', ')}. Columnas disponibles (después de mapeo): ${availableColsString}. Revisa el archivo Excel y el mapeo de columnas.`,
            variant: "destructive",
            duration: 12000
          });
          setIsImporting(false);
          if (event.target) event.target.value = '';
          return;
        }
        
        // Pass mappedData to importInitialData
        const result = await importInitialData(mappedData, type);


        if (result.success) {
          toast({ 
            title: "Importación Procesada", 
            description: `${result.message} Registros en archivo (después de limpieza y mapeo): ${mappedData.length}. Añadidos: ${result.addedCount || 0}. Omitidos: ${result.skippedCount || 0}.`,
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
          console.error("Error en handleFileUpload:", error); 
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
    if (dataType === 'panels') {
       alert(`Exportando todos los datos de paneles... (No implementado completamente)`);
    } else if (dataType === 'events') {
       alert(`Exportando historial completo de eventos... (No implementado completamente)`);
    } else if (dataType === 'billing') {
        alert(`Para exportar la vista actual de facturación, por favor usa el botón 'Exportar a Excel' en la página de Facturación Mensual.`);
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
              <Label htmlFor="initial-data-file" className="text-sm font-medium">Importar Datos Iniciales de Paneles</Label>
              <Input id="initial-data-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'initial')} disabled={isImporting || isClearing} />
              <p className="text-xs text-muted-foreground mt-1">Importa datos de paneles. La fila 5 debe contener las cabeceras y los datos comenzar en la fila 6. Columnas requeridas (después de mapeo interno): "Código parada", "Municipio Marquesina", "Vigencia", "Facturacion".</p>
            </div>
            <hr/>
            <div>
              <Label htmlFor="monthly-events-file" className="text-sm font-medium">Importar Eventos Mensuales</Label>
              <Input id="monthly-events-file" type="file" accept=".xlsx, .xls" className="mt-1" onChange={(e) => handleFileUpload(e, 'monthly')} disabled={isImporting || isClearing} />
              <p className="text-xs text-muted-foreground mt-1">Registra todos los cambios de estado de los paneles. Columnas requeridas (case-insensitive): "panelid", "fecha", "estado anterior", "estado nuevo".</p>
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
            <p><strong>Columnas Críticas del Excel (ejemplos de nombres originales):</strong> 'codigoParada', 'municipioMarquesina', 'vigencia', 'fechaInstalacion', 'fechaDesinstalacion', 'fechaReinstalacion', 'ultimaInstalacionOReinstalacion', 'empresaConcesionaria', etc. La aplicación mapea estos a nombres internos.</p>
            <p><strong>Columnas Requeridas (después de mapeo interno para validación):</strong> 'Código parada', 'Municipio Marquesina', 'Vigencia', 'Facturacion'.</p>
            <p><strong>Validación 'Código parada':</strong> No puede estar vacío. Debe ser único en el archivo y en la base de datos existente (se omitirán duplicados).</p>
            <p><strong>Columna 'Facturacion':</strong> Si no existe en el Excel, se añade con valor nulo. Su valor original se guarda como referencia, pero el cálculo de facturación se basa en días operativos y tarifa estándar.</p>
            <p><strong>Fechas:</strong> Se intentará convertir fechas de Excel (números de serie) y cadenas (formatos comunes como YYYY-MM-DD, DD/MM/YYYY, DD-MM-YY) al formato YYYY-MM-DD. Fechas inválidas resultarán en campo vacío o `null` y pueden generar advertencias.</p>
            <p><strong>Filas Vacías:</strong> Las filas donde todos los valores estén vacíos (después de limpiar columnas `__EMPTY`) serán omitidas.</p>
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
    
