
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
  
  return cleanedData as any[];
}

// Clave: Nombre de campo que espera DataProvider (coincide con interface Panel donde sea práctico)
// Valor: Array de posibles nombres de cabecera en el archivo Excel
const providerToExcelMap: { [providerKey: string]: string[] } = {
  // --- Campos Críticos / Identificadores ---
  'codigo_parada': ['Código parada', 'Codigo parada', 'Código Parada', 'codigoParada', 'idPanel', 'panelId'],
  // --- Fechas Principales PIV ---
  'piv_instalado': ['PIV Instalado', 'Fecha Instalación', 'fechaInstalacion', 'Instalacion', 'Fecha_Instalacion'],
  'piv_desinstalado': ['PIV Desinstalado', 'Fecha Desinstalación', 'fechaDesinstalacion', 'Desinstalacion', 'Fecha_Desinstalacion'],
  'piv_reinstalado': ['PIV Reinstalado', 'Fecha Reinstalación', 'fechaReinstalacion', 'Reinstalacion', 'Fecha_Reinstalacion'],
  // --- Información de Facturación ---
  'importe_mensual': ['Importe Mensual', 'importeMensual', 'Tarifa', 'Facturacion'],
  // --- Detalles de Ubicación y Estructura ---
  'municipio_marquesina': ['Municipio Marquesina', 'Municipio', 'municipioMarquesina'],
  'codigo_marquesina': ['Código Marquesina', 'Codigo Marquesina', 'codigoMarquesina'],
  'marquesina_cce': ['Marquesina CCE (Clear Channel)', 'Marquesina CCE', 'marquesinaCce'], // Campo específico para CCE
  'direccion_cce': ['Direccion CCE (Clear Channel)', 'Dirección CCE', 'Direccion CCE', 'direccionCce', 'Direccion', 'Address'],
  'marquesina': ['Marquesina', 'marquesina'], // Campo genérico de marquesina si es diferente de CCE
  'cce': ['CCE', 'Cce', 'cce'], // Campo genérico CCE si es diferente
  // --- Detalles Técnicos y Administrativos del PIV ---
  'vigencia': ['Vigencia', 'vigencia'],
  'tipo_piv': ['Tipo PIV', 'Tipo', 'tipoPiv'],
  'industrial': ['Industrial', 'industrial'],
  'codigo_piv_asignado': ['Código PIV Asignado', 'PIV Asignado', 'Codigo PIV', 'codigoPivAsignado'],
  // --- Información Adicional y de Contrato ---
  'empresa_concesionaria': ['Empresas concesionarias', 'Empresa', 'Concesionaria', 'empresaConcesionaria', 'Cliente'],
  'ultima_instalacion_reinstalacion': ['Última instalación/reinstalación', 'Ultima instalacion', 'ultimaInstalacionOReinstalacion', 'Fecha Ultima Mod'],
  'observaciones': ['Observaciones', 'Obs', 'Notas', 'observaciones', 'Observaciones PIV'], // Priorizar este para notas generales
  'descripcion_corta': ['Descripción corta', 'Descripcion corta', 'Descripción', 'descripcionCorta'],
  'op1': ['Op 1', 'Operador 1', 'op1'],
  'op2': ['Op 2', 'Operador 2', 'op2'],
  'cambio_ubicacion_reinstalaciones': ['Cambio de Ubicación / Reinstalaciones contrato sep 2024-ago2025', 'Cambio Ubicación', 'cambioUbicacionReinstalaciones'],
  'reinstalacion_vandalizados': ['Reinstalación Vandalizados', 'Reinstalacion Vandalizados', 'reinstalacionVandalizados'],
  'garantia_caducada': ['Garantía caducada', 'Garantia caducada', 'garantiaCaducada'],
  // Mantener los mapeos originales si eran distintos y tenían un propósito específico
  'Notas': ['notas', 'Notas', 'Observaciones PIV'], // Mantenido por si DataProvider lo usa específicamente
};


function mapAndEnsureColumns(cleanedData: any[], type: 'initial' | 'monthly'): any[] {
  if (type === 'initial') {
    return cleanedData.map(rowFromExcel => {
      const mappedRowForProvider: { [key: string]: any } = {};
      
      for (const providerKey in providerToExcelMap) {
        let valueFound = undefined;
        for (const excelHeaderCandidate of providerToExcelMap[providerKey]) {
          if (Object.prototype.hasOwnProperty.call(rowFromExcel, excelHeaderCandidate)) {
            valueFound = rowFromExcel[excelHeaderCandidate];
            break; 
          }
        }
        mappedRowForProvider[providerKey] = valueFound; 
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
  let caseSensitiveComparison = true; // Claves de providerToExcelMap son ahora las de referencia

  if (type === 'initial') {
    requiredHeaders = [
        "codigo_parada", 
        "municipio_marquesina", // o el campo que consideres obligatorio para municipio
        "vigencia", 
        "piv_instalado",
        "importe_mensual",
        "empresa_concesionaria", // Ejemplo de otro campo que podría ser requerido
    ]; 
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

        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true }); // cellDates: true para todos
        
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
          rawJsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, range: 4, defval: null }) as any[];
        } else { 
          rawJsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null }) as any[];
        }

        const cleanedData = cleanExcelData(rawJsonData);
        // console.log(`[${type.toUpperCase()} Import] Cleaned Data (first row):`, cleanedData.length > 0 ? cleanedData[0] : 'No data');

        const mappedData = mapAndEnsureColumns(cleanedData, type);
        // console.log(`[${type.toUpperCase()} Import] Mapped Data for DataProvider (first row):`, mappedData.length > 0 ? mappedData[0] : 'No mapped data');


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
        
        const columnValidation = validateColumns(mappedData, type);
        // console.log(`[${type.toUpperCase()} Import] Column Validation Result (based on DataProvider keys):`, columnValidation);

        if (!columnValidation.valid) {
          const availableColsString = columnValidation.available.length > 0 ? columnValidation.available.join(', ') : 'Ninguna';
          toast({
            title: "Error de Cabeceras Requeridas por DataProvider",
            description: `Faltan columnas requeridas para DataProvider: ${columnValidation.missing.join(', ')}. Columnas disponibles (después de mapeo): ${availableColsString}. Verifique que el Excel contenga las cabeceras candidatas definidas en 'providerToExcelMap' y que estas se mapeen a las claves esperadas.`,
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
            description: `${result.message} Registros en archivo (después de limpieza): ${cleanedData.length}. Filas mapeadas para DataProvider: ${mappedData.length}. Paneles añadidos: ${result.addedCount || 0}. Eventos generados/añadidos: ${result.updatedCount || 0}. Omitidos: ${result.skippedCount || 0}.`,
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
              <p className="text-xs text-muted-foreground mt-1">Importa datos de paneles. La fila 5 debe contener las cabeceras y los datos comenzar en la fila 6. Columnas requeridas post-mapeo (ver `providerToExcelMap` y `validateColumns`): "codigo_parada", "piv_instalado", etc.</p>
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
            <p><strong>Formato de Archivo Excel:</strong> Cabeceras en Fila 5, datos desde Fila 6.</p>
            <p><strong>Lectura de Fechas:</strong> Se usa `cellDates:true` para que Excel intente convertir fechas a objetos `Date` de JavaScript. La aplicación luego las formatea a `YYYY-MM-DD`.</p>
            <p><strong>Mapeo de Columnas:</strong> Las columnas del Excel son mapeadas a nombres internos (ej. de `fechaInstalacion` a `piv_instalado`) antes de ser procesadas por `DataProvider`. Consultar `mapAndEnsureColumns` y `providerToExcelMap` en `import-export/page.tsx` para el mapeo exacto.</p>
            <p><strong>Columnas Requeridas por DataProvider (post-mapeo):</strong> `codigo_parada`, `municipio_marquesina`, `vigencia`, `piv_instalado`, `importe_mensual`. Si faltan, la importación puede fallar.</p>
            <p><strong>Validación 'codigo_parada':</strong> No puede estar vacío. Debe ser único.</p>
            <p><strong>Columna 'importe_mensual' (o mapeada):</strong> Si no existe o es inválida, se usa un valor por defecto (ej. 37.7).</p>
            <p><strong>Fechas PIV:</strong> `piv_instalado`, `piv_desinstalado`, `piv_reinstalado` son cruciales. Si `piv_instalado` falta o es inválida después del mapeo y conversión, el panel podría no ser facturable. Errores de formato en estas fechas se reportarán.</p>
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
    

    

    
