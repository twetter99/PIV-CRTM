
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
// import { MOCK_PANELS, MOCK_PANEL_EVENTS } from '@/lib/mock-data'; // COMENTADO
import { format, parseISO, isValid, getDaysInMonth } from 'date-fns';
import * as XLSX from 'xlsx';

interface DataOperationResult {
  success: boolean;
  message?: string;
  errors?: string[];
  addedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  processedCount?: number; // Total rows attempted from file
  deletedCount?: number; // For clear operation
  billingStats?: BillingStats;
}

interface BillingStats {
  totalPanels: number;
  panelesConImporte: number;
  panelesSinImporte: number;
  importeTotalMensual: number;
  importeMinimo: number;
  importeMaximo: number;
  erroresFormatoImporte: { codigo_parada: string; valor_original: string; fila: number }[];
}


interface DataContextType {
  panels: Panel[];
  panelEvents: PanelEvent[];
  addPanel: (panel: Panel) => Promise<DataOperationResult>;
  updatePanel: (panelId: string, updates: Partial<Panel>) => Promise<DataOperationResult>;
  getPanelById: (panelId: string) => Panel | undefined;
  getEventsForPanel: (panelId: string) => PanelEvent[];
  addPanelEvent: (event: Partial<PanelEvent>) => Promise<DataOperationResult>;
  updatePanelEvent: (eventId: string, updates: Partial<PanelEvent>) => Promise<DataOperationResult>;
  importInitialData: (jsonData: any[], fileType: 'initial' | 'monthly') => Promise<DataOperationResult>;
  deletePanel: (panelId: string) => Promise<DataOperationResult>;
  deletePanelEvent: (eventId: string) => Promise<DataOperationResult>;
  clearAllPivData: () => Promise<DataOperationResult>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  }
  const date = parseISO(dateStr);
  return isValid(date);
};

const isValidExcelDate = (serial: number): boolean => {
    return typeof serial === 'number' && serial > 0;
};

const convertExcelDate = (serial: number): string | undefined => {
    if (!isValidExcelDate(serial)) return undefined;
    const excelEpochDiff = 25569; // Days between 1900-01-01 and 1970-01-01 (Excel epoch vs Unix epoch)
    const date = new Date((serial - excelEpochDiff) * 86400000); // Convert days to milliseconds
    if (isValid(date)) {
        // Ensure we are outputting UTC date parts to avoid timezone shifts
        const year = date.getUTCFullYear();
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return undefined;
};


const convertToYYYYMMDD = (dateInput: any): string | undefined => {
  if (dateInput === null || dateInput === undefined || dateInput === "") {
    return undefined;
  }
  let date: Date;
  if (typeof dateInput === 'number') { 
    return convertExcelDate(dateInput);
  } else if (dateInput instanceof Date) {
    if (isValid(dateInput)) {
      date = dateInput;
    } else {
      return undefined;
    }
  } else if (typeof dateInput === 'string') {
    // Try parsing as ISO date first (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
    const parsedDate = parseISO(dateInput); 
    if (isValid(parsedDate)) {
      date = parsedDate;
    } else {
      // Try parsing common European/US date formats (DD/MM/YYYY or MM/DD/YYYY)
      const parts = dateInput.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (parts) {
        let day, month, year;
        const part1 = parseInt(parts[1], 10);
        const part2 = parseInt(parts[2], 10);
        const part3 = parseInt(parts[3], 10);

        // Basic year disambiguation (e.g., 24 -> 2024)
        if (part3 > 1900) { // Likely YYYY
            year = part3;
            if (part1 > 12) { // DD/MM/YYYY (part1 is day)
                day = part1; month = part2;
            } else if (part2 > 12) { // MM/DD/YYYY (part2 is day) - less common in Spain
                 month = part1; day = part2;
            } else { // Ambiguous, assume DD/MM/YYYY as per Spanish locale preference
                 day = part1; month = part2;
            }
        } else { // Likely YY
            year = part3 + 2000;
             if (part1 > 12) { // DD/MM/YY
                day = part1; month = part2;
            } else if (part2 > 12) { // MM/DD/YY
                 month = part1; day = part2;
            } else { // Ambiguous DD/MM/YY or MM/DD/YY, assume DD/MM/YY
                 day = part1; month = part2;
            }
        }
        if (year && month && day) {
            date = new Date(Date.UTC(year, month - 1, day)); // Use UTC to prevent timezone offset issues
            if (!isValid(date)) return undefined;
        } else {
            return undefined;
        }
      } else {
        return undefined;
      }
    }
  } else {
    return undefined;
  }
  // Format to YYYY-MM-DD using UTC date parts
  const year = date.getUTCFullYear();
  const monthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dayStr = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
};

// Mapeo de Vigencia a PanelStatus
const vigenciaStatusMapping: { [key: string]: PanelStatus } = {
  'ok': 'installed',
  'en rev.': 'maintenance',
  'mantenimiento': 'maintenance',
  'desinstalado': 'removed',
  'pendiente': 'pending_installation',
};

// Mapeo de estados de eventos (más amplio, incluye vigencia)
const eventStatusValueMapping: { [key: string]: PanelStatus } = {
  'instalado': 'installed',
  'eliminado': 'removed',
  'mantenimiento': 'maintenance',
  'pendiente instalacion': 'pending_installation',
  'pendiente eliminación': 'pending_removal',
  'desconocido': 'unknown',
  ...vigenciaStatusMapping // Incluye los mapeos de vigencia
};

const procesarImporteFacturacion = (valorExcel: any): number => {
  try {
    if (valorExcel === null || valorExcel === undefined || String(valorExcel).trim() === '') {
      return 0;
    }
    
    let valor = String(valorExcel).trim();
    
    valor = valor
      .replace(/[€$£¥]/g, '')        
      .replace(/\s+/g, '')           
      .trim();
    
    // Handle European (comma as decimal) vs US (dot as decimal)
    // If both comma and dot exist, assume dot is decimal and comma is thousands
    if (valor.includes(',') && valor.includes('.')) {
        // If dot is after comma, assume dot is decimal: 1,250.50 -> 1250.50
        if (valor.indexOf('.') > valor.indexOf(',')) {
            valor = valor.replace(/,/g, '');
        } else { // If comma is after dot, assume comma is decimal: 1.250,50 -> 1250.50
            valor = valor.replace(/\./g, '').replace(',', '.');
        }
    } else if (valor.includes(',')) { // Only comma, assume it's a decimal separator (European style)
      valor = valor.replace(',', '.');
    }
    // At this point, 'valor' should use '.' as a decimal separator if it has decimals
    
    const numero = parseFloat(valor);
    
    if (isNaN(numero) || numero < 0) {
      console.warn(`Importe inválido encontrado: "${valorExcel}" (procesado como "${valor}"). Usando 0.`);
      return 0;
    }
    
    return Math.round(numero * 100) / 100;
    
  } catch (error) {
    console.error(`Error procesando importe "${valorExcel}":`, error);
    return 0; // Default to 0 in case of any processing error
  }
};


export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelEvents, setPanelEvents] = useState<PanelEvent[]>([]);

  const refreshPanelStatus = useCallback((panelId: string, eventsForPanel: PanelEvent[]) => {
    setPanels(prevPanels => {
      const panelIndex = prevPanels.findIndex(p => p.codigo_parada === panelId);
      if (panelIndex === -1) return prevPanels;

      const panelToUpdate = { ...prevPanels[panelIndex] };
      
      const sortedEvents = [...eventsForPanel]
        .sort((a, b) => {
            const dateA = parseISO(a.date).getTime();
            const dateB = parseISO(b.date).getTime();
            if (isNaN(dateA) || isNaN(dateB)) return 0; // Should not happen if dates are valid
            return dateB - dateA; // Sort descending by date
        });

      let newStatus = panelToUpdate.status;
      let newLastStatusUpdate = panelToUpdate.lastStatusUpdate;
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      if (sortedEvents.length > 0) {
        const latestEvent = sortedEvents[0];
        newStatus = latestEvent.newStatus;
        newLastStatusUpdate = latestEvent.date;
      } else if (panelToUpdate.installationDate && isValidDateString(panelToUpdate.installationDate)) {
        // No events, rely on installation date and original status
        newStatus = panelToUpdate.status; // Keep original status if no events
        newLastStatusUpdate = panelToUpdate.installationDate;
        // Auto-update to 'installed' if pending and installation date is past/today
        if (newStatus === 'pending_installation' && parseISO(panelToUpdate.installationDate) <= parseISO(todayStr)) {
          newStatus = 'installed';
        }
      } else {
        // No events and no installation date, keep current or default
        newStatus = panelToUpdate.status || 'unknown'; // Fallback to unknown if no status
        newLastStatusUpdate = panelToUpdate.lastStatusUpdate || undefined; // Keep if exists
      }

      // Only update if status or lastStatusUpdate actually changed
      if (panelToUpdate.status !== newStatus || panelToUpdate.lastStatusUpdate !== newLastStatusUpdate) {
        const updatedPanels = [...prevPanels];
        updatedPanels[panelIndex] = { ...panelToUpdate, status: newStatus, lastStatusUpdate: newLastStatusUpdate };
        return updatedPanels.sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));
      }
      return prevPanels;
    });
  }, []); // Empty dependency array as setPanels functional update is used

  useEffect(() => {
    // const initialPanelsData = MOCK_PANELS.map(p => ({ ...p })); // COMENTADO
    // const initialEventsData = MOCK_PANEL_EVENTS.map(e => ({ ...e, id: e.id || crypto.randomUUID() })); // COMENTADO
    const initialPanelsData: Panel[] = []; // EMPIEZA VACÍO
    const initialEventsData: PanelEvent[] = []; // EMPIEZA VACÍO
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Initialize panels with status derived from their events or installation date
    const panelsWithInitialStatus = initialPanelsData.map(panel => {
      const relevantEvents = initialEventsData
        .filter(e => e.panelId === panel.codigo_parada)
        .sort((a, b) => { // Sort descending by date
            const dateA = parseISO(a.date).getTime();
            const dateB = parseISO(b.date).getTime();
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return dateB - dateA;
        });

      let currentStatus = panel.status;
      let currentLastStatusUpdate = panel.lastStatusUpdate || (panel.installationDate && isValidDateString(panel.installationDate) ? panel.installationDate : undefined);
      
      if (relevantEvents.length > 0) {
        currentStatus = relevantEvents[0].newStatus;
        currentLastStatusUpdate = relevantEvents[0].date;
      } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
        // If status is 'pending_installation' and installation date is past or today, set to 'installed'
        if (currentStatus === 'pending_installation' && parseISO(panel.installationDate) <= parseISO(todayStr)) {
          currentStatus = 'installed';
        }
        // currentLastStatusUpdate is already set to installationDate if no lastStatusUpdate was provided
      }
      return { ...panel, status: currentStatus, lastStatusUpdate: currentLastStatusUpdate };
    }).sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));

    setPanels(panelsWithInitialStatus);
    setPanelEvents(initialEventsData);
  }, []); // refreshPanelStatus fue eliminado de las dependencias ya que es estable con useCallback([])

  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const newPanel = { 
        ...panel, 
        lastStatusUpdate: panel.installationDate || panel.lastStatusUpdate || format(new Date(), 'yyyy-MM-dd') 
    };
    setPanels(prev => [...prev, newPanel].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
    return { success: true, message: `Panel ${panel.codigo_parada} añadido.` };
  }, [panels, setPanels]);

  const updatePanel = useCallback(async (panelId: string, updates: Partial<Panel>): Promise<DataOperationResult> => {
    let panelExists = false;
    setPanels(prev => {
        const panelIndex = prev.findIndex(p => p.codigo_parada === panelId);
        if (panelIndex !== -1) panelExists = true;
        return prev.map(p => {
            if (p.codigo_parada === panelId) {
                return { ...p, ...updates };
            }
            return p;
        }).sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada))
    });

    if (!panelExists) return { success: false, message: `Panel ${panelId} no encontrado.`};
    
    // After updating a panel, its status might need re-evaluation based on events
    // This needs careful handling, as updating a panel (e.g. installationDate)
    // could implicitly change its derived status.
    const currentEventsForPanel = panelEvents.filter(e => e.panelId === panelId);
    refreshPanelStatus(panelId, currentEventsForPanel); // Refresh status based on current events
    return { success: true, message: `Panel ${panelId} actualizado.` };
  }, [panels, panelEvents, setPanels, refreshPanelStatus]);

  const getPanelById = useCallback((panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
  }, [panels]);

  const getEventsForPanel = useCallback((panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => {
        const dateA = parseISO(a.date).getTime();
        const dateB = parseISO(b.date).getTime();
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB; // Ascending sort for chronological display
    });
  }, [panelEvents]);
  
  const addPanelEvent = useCallback(async (event: Partial<PanelEvent>): Promise<DataOperationResult> => {
    if (!event.panelId) return { success: false, message: "Panel ID es obligatorio para el evento." };
    const newEventWithId = { ...event, id: event.id || crypto.randomUUID() } as PanelEvent;
    
    let latestEventsForPanel: PanelEvent[]; // To be used by refreshPanelStatus
    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      latestEventsForPanel = updatedEvents.filter(e => e.panelId === newEventWithId.panelId);
      return updatedEvents;
    });
    
    // @ts-ignore - latestEventsForPanel will be assigned if panelId exists
    if (latestEventsForPanel) {
        refreshPanelStatus(newEventWithId.panelId, latestEventsForPanel);
    }

    return { success: true, message: `Evento para ${newEventWithId.panelId} añadido.` };
  }, [setPanelEvents, refreshPanelStatus]); // panelEvents removed due to functional update pattern
  
  const updatePanelEvent = useCallback(async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId: string | undefined;
    let originalPanelIdForRefresh: string | undefined;
    let eventExists = false;
    let latestEventsList: PanelEvent[] = []; // To capture the final state of events

    setPanelEvents(prevEvents => {
      const eventIndex = prevEvents.findIndex(e => e.id === eventId);
      if (eventIndex === -1) {
        latestEventsList = [...prevEvents]; // No change
        return prevEvents; // Event not found
      }
      eventExists = true;

      const updatedEvents = [...prevEvents];
      const originalEvent = updatedEvents[eventIndex];
      originalPanelIdForRefresh = originalEvent.panelId; // Store original panelId
      affectedPanelId = updates.panelId || originalEvent.panelId; // Determine the panelId after update
      updatedEvents[eventIndex] = { ...originalEvent, ...updates };
      latestEventsList = updatedEvents; // Store the full updated list
      return updatedEvents;
    });
    
    if (!eventExists) return { success: false, message: `Evento con ID ${eventId} no encontrado.`};

    // If panelId changed, refresh status for old panel
    if (originalPanelIdForRefresh && originalPanelIdForRefresh !== affectedPanelId) {
      const eventsForOldPanel = latestEventsList.filter(e => e.panelId === originalPanelIdForRefresh);
      refreshPanelStatus(originalPanelIdForRefresh, eventsForOldPanel);
    }
    // Refresh status for the (new or same) affected panel
    if (affectedPanelId) {
      const eventsForAffectedPanel = latestEventsList.filter(e => e.panelId === affectedPanelId);
      refreshPanelStatus(affectedPanelId, eventsForAffectedPanel);
    }
    return { success: true, message: `Evento ${eventId} actualizado.` };
  }, [setPanelEvents, refreshPanelStatus]); // panelEvents removed


  const importInitialData = useCallback(async (jsonData: any[], fileType: 'initial' | 'monthly'): Promise<DataOperationResult> => {
    const errors: string[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    
    const billingStats: BillingStats = {
      totalPanels: 0,
      panelesConImporte: 0,
      panelesSinImporte: 0,
      importeTotalMensual: 0,
      importeMinimo: Infinity,
      importeMaximo: 0,
      erroresFormatoImporte: []
    };
    
    // Filter out rows that appear entirely empty before detailed processing
    const initialFilteredData = jsonData.filter(row => 
        Object.values(row).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );
    const processedCountFromFile = initialFilteredData.length;

    if (processedCountFromFile === 0 && fileType === 'initial') {
         return {
            success: false,
            message: "No se encontraron datos procesables en el archivo. Verifique que las cabeceras estén en la fila 5 y los datos en la fila 6.",
            errors: ["No se encontraron datos para importar."],
            processedCount: jsonData.length, addedCount, skippedCount
         }
    } else if (processedCountFromFile === 0 && fileType === 'monthly') {
         return {
            success: false,
            message: "No se encontraron eventos procesables en el archivo.",
            errors: ["No se encontraron eventos para importar."],
            processedCount: jsonData.length, addedCount, skippedCount
         }
    }


    if (fileType === 'initial') {
        const newPanelsToImport: Panel[] = [];
        const importedPanelIdsInFile = new Set<string>();
        const currentPanelIds = new Set(panels.map(p => p.codigo_parada));
        
        // Validate headers from the first actual data row (if any)
        if (processedCountFromFile > 0) {
            const firstRowKeys = Object.keys(initialFilteredData[0]);
            const requiredHeaders = ['Código parada', 'Municipio Marquesina', 'Vigencia', 'Facturacion']; // SIN TILDE
            const missingHeaders = requiredHeaders.filter(h => !firstRowKeys.includes(h));

            if (missingHeaders.length > 0) {
                return {
                    success: false,
                    message: `Error: Faltan cabeceras requeridas en la fila 5: ${missingHeaders.join(', ')}. Asegúrese de que el archivo Excel contiene estas columnas. Cabeceras encontradas: ${firstRowKeys.join(', ')}`,
                    errors: [`Cabeceras faltantes: ${missingHeaders.join(', ')}`],
                    processedCount: jsonData.length, addedCount, skippedCount
                };
            }
        }
        

        initialFilteredData.forEach((row, index) => {
          const rowIndexForError = index + 6; // Assuming data starts at Excel row 6 (after 4 ignored + 1 header)
    
          const codigo_parada_raw = row['Código parada'];
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";
    
          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'Código parada' es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return; // Skip this row
          }
    
          if (currentPanelIds.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe en la base de datos o está duplicado en este archivo. Omitido.`);
            skippedCount++;
            return; // Skip this row
          }
    
          const municipio_raw = row['Municipio Marquesina'];
          const municipio = (municipio_raw !== undefined && municipio_raw !== null && String(municipio_raw).trim() !== "") ? String(municipio_raw).trim() : "Sin especificar";
    
          const vigencia_raw = row['Vigencia'];
          const vigencia_cleaned = (vigencia_raw !== undefined && vigencia_raw !== null) ? String(vigencia_raw).trim().toLowerCase() : "";
          const panelStatus = vigenciaStatusMapping[vigencia_cleaned] || 'pending_installation'; // Default if mapping fails
    
          const installationDateExcel = row['Última instalación/reinstalación'];
          const installationDate = convertToYYYYMMDD(installationDateExcel);
    
          const cliente_raw = row['Empresas concesionarias'];
          const cliente = (cliente_raw !== undefined && cliente_raw !== null && String(cliente_raw).trim() !== "") ? String(cliente_raw).trim() : "Sin asignar";

          const direccion_raw = row['Direccion CCE (Clear Channel)'];
          const direccion = String(direccion_raw || '').trim();

          const notas_raw = row['Observaciones'];
          const notas = String(notas_raw || '').trim();

          const codigo_marquesina_raw = row['Código Marquesina'];
          const codigo_marquesina = String(codigo_marquesina_raw || '').trim();

          const tipo_piv_raw = row['Tipo PIV'];
          const tipo_piv = String(tipo_piv_raw || '').trim();

          const industrial_raw = row['Industrial'];
          const industrial = String(industrial_raw || '').trim();

          const funcionamiento_raw = row['Funcionamiento'];
          const funcionamiento = (funcionamiento_raw !== undefined && funcionamiento_raw !== null && String(funcionamiento_raw || '').trim() !== "") ? String(funcionamiento_raw || '').trim() : "Sin revisar";
          
          const diagnostico_raw = row['Diagnóstico'];
          const diagnostico = String(diagnostico_raw || '').trim();

          const tecnico_raw = row['TÉCNICO'];
          const tecnico = (tecnico_raw !== undefined && tecnico_raw !== null && String(tecnico_raw || '').trim() !== "") ? String(tecnico_raw || '').trim() : "Sin asignar";

          const facturacionRaw = row["Facturacion"]; // SIN TILDE
          const importe_mensual_procesado = procesarImporteFacturacion(facturacionRaw);


          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            municipality: municipio,
            status: panelStatus,
            client: cliente,
            address: direccion || "Sin dirección",
            notes: notas,
            installationDate: installationDate, // Can be undefined
            lastStatusUpdate: installationDate || format(new Date(), 'yyyy-MM-dd'), // Default to today if no install date
            
            // New fields from Excel
            codigo_marquesina: codigo_marquesina,
            tipo_piv: tipo_piv,
            industrial: industrial,
            funcionamiento: funcionamiento,
            diagnostico: diagnostico,
            tecnico: tecnico,
            
            // Facturación
            importe_mensual: importe_mensual_procesado,
            importe_mensual_original: String(facturacionRaw || ''),

            // Meta
            fecha_importacion: new Date().toISOString(),
            importado_por: "currentUser", // Placeholder
          };
          
          billingStats.totalPanels++;
          if (newPanel.importe_mensual > 0) {
            billingStats.panelesConImporte++;
            billingStats.importeTotalMensual += newPanel.importe_mensual;
            billingStats.importeMinimo = Math.min(billingStats.importeMinimo, newPanel.importe_mensual);
            billingStats.importeMaximo = Math.max(billingStats.importeMaximo, newPanel.importe_mensual);
          } else {
            billingStats.panelesSinImporte++;
            // Log if original value was present but processed to 0
            if (newPanel.importe_mensual_original && newPanel.importe_mensual_original !== '') {
               billingStats.erroresFormatoImporte.push({
                 codigo_parada: newPanel.codigo_parada,
                 valor_original: newPanel.importe_mensual_original,
                 fila: rowIndexForError
               });
            }
          }
    
          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          addedCount++;
        });
        
        if (billingStats.importeMinimo === Infinity) billingStats.importeMinimo = 0; // Avoid Infinity if no panels with amount
    
        if (newPanelsToImport.length > 0) {
          setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
        }
    } else { // Monthly Events
        const newEventsToImport: PanelEvent[] = [];
        const currentPanelIds = new Set(panels.map(p => p.codigo_parada));
        // Define expected headers for monthly events
        const headerMapping: { [key: string]: keyof PanelEvent | string } = {
            'panelid': 'panelId',
            'fecha': 'date',
            'estado anterior': 'oldStatus',
            'estado nuevo': 'newStatus',
            'notas evento': 'notes',
        };
        const normalizeHeader = (header: string) => header.toLowerCase().trim();

        initialFilteredData.forEach((row, index) => {
            const rowIndexForError = index + 2; // Assuming data starts at Excel row 2 (after 1 header)
            
            const panelEvent: Partial<PanelEvent> = {};
            let panelIdFromRow: string | undefined = undefined;

            // Map row data to PanelEvent fields based on headerMapping
            for (const excelHeader in row) {
              const normalizedExcelHeader = normalizeHeader(excelHeader);
              const eventKey = headerMapping[normalizedExcelHeader] as keyof PanelEvent;
              if (eventKey) {
                 if (eventKey === 'panelId') {
                    panelIdFromRow = String(row[excelHeader] || '').trim();
                    panelEvent[eventKey] = panelIdFromRow;
                 } else if (eventKey === 'date') {
                    panelEvent[eventKey] = convertToYYYYMMDD(row[excelHeader]);
                 } else if (eventKey === 'newStatus' || eventKey === 'oldStatus') {
                    const statusVal = String(row[excelHeader] || '').trim().toLowerCase();
                    panelEvent[eventKey] = eventStatusValueMapping[statusVal] || (eventKey === 'newStatus' ? 'unknown' : undefined);
                 } else {
                    // For other string fields like 'notes'
                    panelEvent[eventKey] = String(row[excelHeader] || '').trim();
                 }
              }
            }

            // Basic validation for panelId
            if (!panelIdFromRow) {
                errors.push(`Fila ${rowIndexForError}: panelId es obligatorio.`);
                skippedCount++;
                return;
            }
            if (!currentPanelIds.has(panelIdFromRow)) {
                errors.push(`Fila ${rowIndexForError}: Panel con ID ${panelIdFromRow} no encontrado. Omitido.`);
                skippedCount++;
                return;
            }
            
            // Validate essential fields for the event
            const validationErrors: string[] = [];
            if (!panelEvent.date) { // convertToYYYYMMDD handles invalid date formats
                validationErrors.push(`fecha '${row['fecha'] || ''}' inválida o ausente. Usar formato YYYY-MM-DD o fecha Excel.`);
            }
            if (!panelEvent.newStatus || !ALL_PANEL_STATUSES.includes(panelEvent.newStatus)) {
                validationErrors.push(`estado nuevo '${row['estado nuevo'] || ''}' inválido. Valores válidos: ${ALL_PANEL_STATUSES.join(', ')}.`);
            }
            if (panelEvent.oldStatus && !ALL_PANEL_STATUSES.includes(panelEvent.oldStatus)) {
                // oldStatus can be undefined for initial event, so only validate if present
                validationErrors.push(`estado anterior '${row['estado anterior'] || ''}' inválido.`);
            }
            
            if (validationErrors.length > 0) {
                errors.push(`Fila ${rowIndexForError} (Panel ${panelIdFromRow}): ${validationErrors.join('; ')}`);
                skippedCount++;
                return;
            }

            // Check for duplicate events before adding
            const isDuplicate = panelEvents.some(existingEvent => 
                existingEvent.panelId === panelIdFromRow &&
                existingEvent.date === panelEvent.date &&
                (existingEvent.oldStatus || undefined) === (panelEvent.oldStatus || undefined) && // Treat null and undefined oldStatus as same
                existingEvent.newStatus === panelEvent.newStatus
            ) || newEventsToImport.some(newEvent => // Check against events already staged in this import
                newEvent.panelId === panelIdFromRow &&
                newEvent.date === panelEvent.date &&
                (newEvent.oldStatus || undefined) === (panelEvent.oldStatus || undefined) &&
                newEvent.newStatus === panelEvent.newStatus
            );

            if(isDuplicate){
                errors.push(`Fila ${rowIndexForError} (Panel ${panelIdFromRow}): Evento duplicado omitido.`);
                skippedCount++;
                return;
            }

            newEventsToImport.push({
                id: crypto.randomUUID(),
                panelId: panelIdFromRow, // Already validated
                date: panelEvent.date!,   // Already validated
                oldStatus: panelEvent.oldStatus as PanelStatus | undefined, // Validated or undefined
                newStatus: panelEvent.newStatus as PanelStatus, // Validated
                notes: panelEvent.notes ? String(panelEvent.notes) : undefined, // Optional
            });
            addedCount++;
        });
        
        let panelIdsToUpdateFromEvents: Set<string> | null = null;
        if (newEventsToImport.length > 0) {
            panelIdsToUpdateFromEvents = new Set(newEventsToImport.map(e => e.panelId));
            // Update panelEvents state using functional update to ensure latest state is used
            setPanelEvents(prevEvents => [...prevEvents, ...newEventsToImport]);
        }

        // After all new events are added to state, refresh status for all affected panels
        if (panelIdsToUpdateFromEvents) {
            // Need to get the *very latest* list of all events after the update
            // This is tricky because setPanelEvents is async.
            // A more robust way might be to pass the combined list to refreshPanelStatus.
            // For now, assuming refreshPanelStatus called after this block will eventually see updated panelEvents.
            // This might require panelEvents in refreshPanelStatus's dependency array if not using functional updates for setPanels.
            // Given refreshPanelStatus uses functional setPanels, it should be fine.
            const latestEventsList = [...panelEvents, ...newEventsToImport]; // Simulating the state post-update for immediate refresh
            panelIdsToUpdateFromEvents.forEach(pid => {
                const eventsForThisPanel = latestEventsList.filter(e => e.panelId === pid);
                refreshPanelStatus(pid, eventsForThisPanel);
            });
        }
    }
    
    const opSuccess = addedCount > 0; // Consider success if at least one record was added
    let opMessage = `Registros procesados: ${processedCountFromFile}. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`;
    if (errors.length > 0) {
        opMessage += ` Errores: ${errors.length}.`;
    } else if (addedCount > 0) {
        opMessage += fileType === 'initial' ? ' Importación de paneles completada.' : ' Importación de eventos completada.';
    } else if (processedCountFromFile === 0 && fileType === 'initial') { // jsonData might be > 0, but initialFilteredData is 0
        opMessage = 'No se encontraron paneles válidos para importar.';
    } else if (processedCountFromFile === 0 && fileType === 'monthly') {
        opMessage = 'No se encontraron eventos válidos para importar.';
    }


    return { 
        success: opSuccess, 
        message: opMessage,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Return only first 10 errors for brevity
        addedCount,
        skippedCount,
        processedCount: jsonData.length, // Total rows from original file before any filtering
        billingStats: fileType === 'initial' ? billingStats : undefined
    };
  }, [panels, panelEvents, setPanels, setPanelEvents, refreshPanelStatus]); // Added setPanels, setPanelEvents
  
  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    // This is a mock. In a real app, you'd interact with a backend/DB.
    console.warn(`Delete operation for panel ${panelId} is not fully implemented.`);
    // For now, let's simulate a failure or a "not implemented" message.
    return { success: false, message: "Función de eliminación no implementada." }; 
  }, []);

  const deletePanelEvent = useCallback(async (eventId: string): Promise<DataOperationResult> => {
    console.warn(`Delete operation for event ${eventId} is not fully implemented.`);
    return { success: false, message: "Función de eliminación no implementada." };
  }, []);

  const clearAllPivData = useCallback(async (): Promise<DataOperationResult> => {
    const panelsDeleted = panels.length;
    const eventsDeleted = panelEvents.length;
    setPanels([]);
    setPanelEvents([]);
    return {
      success: true,
      message: `Todos los datos PIV ( ${panelsDeleted} paneles y ${eventsDeleted} eventos) han sido eliminados.`,
      deletedCount: panelsDeleted + eventsDeleted,
    };
  }, [panels, panelEvents, setPanels, setPanelEvents]);


  return (
    <DataContext.Provider value={{ 
        panels, 
        panelEvents, 
        addPanel, 
        updatePanel, 
        getPanelById, 
        getEventsForPanel, 
        addPanelEvent, 
        updatePanelEvent, 
        importInitialData,
        deletePanel,
        deletePanelEvent,
        clearAllPivData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData debe ser usado dentro de un DataProvider');
  }
  return context;
};

    