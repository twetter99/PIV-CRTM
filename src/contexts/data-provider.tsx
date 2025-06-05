
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFnsDateFns, format as formatDateFnsInternal } from 'date-fns'; // Renamed to avoid conflict
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

const isValidExcelDate = (serial: number): boolean => {
    return typeof serial === 'number' && serial > 0;
};

const convertExcelSerialToDate = (serial: number): Date | undefined => {
    if (!isValidExcelDate(serial)) return undefined;
    const excelEpochDiff = 25569;
    const date = new Date(Date.UTC(0, 0, serial - excelEpochDiff -1));
    return isValid(date) ? date : undefined;
};


const convertToYYYYMMDD = (dateInput: any): string | undefined => {
  if (dateInput === null || dateInput === undefined || String(dateInput).trim() === "" || String(dateInput).trim().toLowerCase() === "nan") {
    return undefined;
  }

  let date: Date;
  let originalDateInputValue = String(dateInput).trim(); // Keep original for potential substring

  if (typeof dateInput === 'number') {
    date = convertExcelSerialToDate(dateInput) || new Date(NaN);
    if (!isValid(date)) {
        // console.warn(`convertToYYYYMMDD: Invalid Excel serial date: ${dateInput}`);
        return undefined;
    }
  } else if (dateInput instanceof Date) {
    if (isValid(dateInput)) {
      date = dateInput;
    } else {
        // console.warn(`convertToYYYYMMDD: Invalid Date object: ${dateInput}`);
        return undefined;
    }
  } else if (typeof dateInput === 'string') {
    let datePartToParse = originalDateInputValue;
    // If it looks like "YYYY-MM-DD HH:MM:SS", take only the date part
    if (originalDateInputValue.length > 10 && originalDateInputValue.charAt(4) === '-' && originalDateInputValue.charAt(7) === '-') {
        datePartToParse = originalDateInputValue.substring(0, 10);
    }
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePartToParse)) {
        let parsedDate = parseISO(datePartToParse);
        if (isValid(parsedDate) && formatDateFnsInternal(parsedDate, 'yyyy-MM-dd') === datePartToParse) {
            date = parsedDate;
        } else {
            // console.warn(`convertToYYYYMMDD: Invalid YYYY-MM-DD string: ${datePartToParse}`);
            return undefined;
        }
    } else { 
        const parts = datePartToParse.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (parts) {
            let day, month, year_val; // Renamed 'year' to 'year_val' to avoid conflict
            const part1 = parseInt(parts[1], 10);
            const part2 = parseInt(parts[2], 10);
            let part3 = parseInt(parts[3], 10);

            if (parts[3].length === 2) { 
                year_val = part3 < 70 ? 2000 + part3 : 1900 + part3;
            } else { 
                year_val = part3;
            }
            
            if (part1 > 12) { day = part1; month = part2; } 
            else if (part2 > 12) { month = part1; day = part2; } 
            else { day = part1; month = part2; }

            if (year_val && month && day) {
                const tempDate = new Date(Date.UTC(year_val, month - 1, day));
                 if (isValid(tempDate) && tempDate.getUTCFullYear() === year_val && tempDate.getUTCMonth() === month -1 && tempDate.getUTCDate() === day) {
                    date = tempDate;
                } else {
                    // console.warn(`convertToYYYYMMDD: Date rolled over or invalid after DD/MM/YYYY construction: ${datePartToParse}`);
                    return undefined;
                }
            } else {
                 // console.warn(`convertToYYYYMMDD: Could not parse day/month/year from parts: ${datePartToParse}`);
                return undefined;
            }
        } else {
             // console.warn(`convertToYYYYMMDD: Unparseable date string (not YYYY-MM-DD and not DD/MM/YYYY-like): ${datePartToParse}`);
            return undefined;
        }
    }
  } else {
    // console.warn(`convertToYYYYMMDD: Unsupported date input type: ${typeof dateInput}`);
    return undefined;
  }

  const finalYear = date.getUTCFullYear();
  const finalMonthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const finalDayStr = date.getUTCDate().toString().padStart(2, '0');
  return `${finalYear}-${finalMonthStr}-${finalDayStr}`;
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

    if (valor.includes(',') && valor.includes('.')) {
        if (valor.indexOf('.') > valor.indexOf(',')) {
            valor = valor.replace(/,/g, '');
        } else {
            valor = valor.replace(/\./g, '').replace(',', '.');
        }
    } else if (valor.includes(',')) {
      valor = valor.replace(',', '.');
    }

    const numero = parseFloat(valor);

    if (isNaN(numero) || numero < 0) {
      // console.warn(`Importe inválido encontrado: "${valorExcel}" (procesado como "${valor}"). Usando 0.`);
      return 0;
    }

    return Math.round(numero * 100) / 100;

  } catch (error) {
    // console.error(`Error procesando importe "${valorExcel}":`, error);
    return 0;
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
            const dateA = a.date ? parseISO(a.date.substring(0,10)).getTime() : 0; 
            const dateB = b.date ? parseISO(b.date.substring(0,10)).getTime() : 0;
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return dateB - dateA;
        });

      let newStatus = panelToUpdate.status;
      let newLastStatusUpdate = panelToUpdate.lastStatusUpdate;
      
      if (sortedEvents.length > 0) {
        const latestEvent = sortedEvents[0];
        newStatus = latestEvent.newStatus;
        newLastStatusUpdate = latestEvent.date;
      } else if (panelToUpdate.piv_instalado && isValidDateString(panelToUpdate.piv_instalado)) {
        newStatus = panelToUpdate.status; 
        newLastStatusUpdate = panelToUpdate.piv_instalado;
      } else {
        newStatus = panelToUpdate.status || 'unknown';
        newLastStatusUpdate = panelToUpdate.lastStatusUpdate || undefined;
      }

      if (panelToUpdate.status !== newStatus || panelToUpdate.lastStatusUpdate !== newLastStatusUpdate) {
        const updatedPanels = [...prevPanels];
        updatedPanels[panelIndex] = { ...panelToUpdate, status: newStatus, lastStatusUpdate: newLastStatusUpdate };
        return updatedPanels.sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));
      }
      return prevPanels;
    });
  }, []);

  useEffect(() => {
    const initialPanelsData: Panel[] = [];
    const initialEventsData: PanelEvent[] = [];

    const panelsWithInitialStatus = initialPanelsData.map(panel => {
      const relevantEvents = initialEventsData
        .filter(e => e.panelId === panel.codigo_parada)
        .sort((a, b) => {
            const dateA = a.date ? parseISO(a.date.substring(0,10)).getTime() : 0;
            const dateB = b.date ? parseISO(b.date.substring(0,10)).getTime() : 0;
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return dateB - dateA;
        });

      let currentStatus = panel.status;
      let currentLastStatusUpdate = panel.lastStatusUpdate || (panel.piv_instalado && isValidDateString(panel.piv_instalado) ? panel.piv_instalado : null);

      if (relevantEvents.length > 0) {
        currentStatus = relevantEvents[0].newStatus;
        currentLastStatusUpdate = relevantEvents[0].date;
      }
      return { ...panel, status: currentStatus, lastStatusUpdate: currentLastStatusUpdate };
    }).sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));

    setPanels(panelsWithInitialStatus);
    setPanelEvents(initialEventsData);
  }, []);

  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const newPanel = {
        ...panel,
        lastStatusUpdate: panel.lastStatusUpdate || panel.piv_instalado || format(new Date(), 'yyyy-MM-dd')
    };
    setPanels(prev => [...prev, newPanel].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
    return { success: true, message: `Panel ${panel.codigo_parada} añadido.` };
  }, [panels]);

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

    const currentEventsForPanel = panelEvents.filter(e => e.panelId === panelId);
    refreshPanelStatus(panelId, currentEventsForPanel);
    return { success: true, message: `Panel ${panelId} actualizado.` };
  }, [panelEvents, refreshPanelStatus]);

  const getPanelById = useCallback((panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
  }, [panels]);

  const getEventsForPanel = useCallback((panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => {
        const dateA = a.date ? parseISO(a.date.substring(0,10)).getTime() : 0;
        const dateB = b.date ? parseISO(b.date.substring(0,10)).getTime() : 0;
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB;
    });
  }, [panelEvents]);

  const addPanelEvent = useCallback(async (event: Partial<PanelEvent>): Promise<DataOperationResult> => {
    if (!event.panelId) return { success: false, message: "Panel ID es obligatorio para el evento." };
    const eventDate = event.date ? convertToYYYYMMDD(event.date) : undefined;
    if (!eventDate) return { success: false, message: "Fecha de evento inválida o faltante." };

    const newEventWithId = { ...event, date: eventDate, id: event.id || crypto.randomUUID() } as PanelEvent;


    let latestEventsForPanel: PanelEvent[];
    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      latestEventsForPanel = updatedEvents.filter(e => e.panelId === newEventWithId.panelId);
      return updatedEvents;
    });

    // @ts-ignore
    if (latestEventsForPanel) {
        refreshPanelStatus(newEventWithId.panelId, latestEventsForPanel);
    }

    return { success: true, message: `Evento para ${newEventWithId.panelId} añadido.` };
  }, [refreshPanelStatus]);

  const updatePanelEvent = useCallback(async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId: string | undefined;
    let originalPanelIdForRefresh: string | undefined;
    let eventExists = false;
    let latestEventsList: PanelEvent[] = [];

    if (updates.date) {
        const updatedDate = convertToYYYYMMDD(updates.date);
        if (!updatedDate) return { success: false, message: "Fecha de evento actualizada inválida." };
        updates.date = updatedDate;
    }

    setPanelEvents(prevEvents => {
      const eventIndex = prevEvents.findIndex(e => e.id === eventId);
      if (eventIndex === -1) {
        latestEventsList = [...prevEvents];
        return prevEvents;
      }
      eventExists = true;

      const updatedEvents = [...prevEvents];
      const originalEvent = updatedEvents[eventIndex];
      originalPanelIdForRefresh = originalEvent.panelId;
      affectedPanelId = updates.panelId || originalEvent.panelId;
      updatedEvents[eventIndex] = { ...originalEvent, ...updates };
      latestEventsList = updatedEvents;
      return updatedEvents;
    });

    if (!eventExists) return { success: false, message: `Evento con ID ${eventId} no encontrado.`};

    if (originalPanelIdForRefresh && originalPanelIdForRefresh !== affectedPanelId) {
      const eventsForOldPanel = latestEventsList.filter(e => e.panelId === originalPanelIdForRefresh);
      refreshPanelStatus(originalPanelIdForRefresh, eventsForOldPanel);
    }
    if (affectedPanelId) {
      const eventsForAffectedPanel = latestEventsList.filter(e => e.panelId === affectedPanelId);
      refreshPanelStatus(affectedPanelId, eventsForAffectedPanel);
    }
    return { success: true, message: `Evento ${eventId} actualizado.` };
  }, [refreshPanelStatus]);


  const importInitialData = useCallback(async (jsonData: any[], fileType: 'initial' | 'monthly'): Promise<DataOperationResult> => {
    const errors: string[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    let firstPanelMappedForDebug: Panel | null = null; // For debug log

    const billingStats: BillingStats = {
      totalPanels: 0,
      panelesConImporte: 0,
      panelesSinImporte: 0,
      importeTotalMensual: 0,
      importeMinimo: Infinity,
      importeMaximo: 0,
      erroresFormatoImporte: []
    };

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
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));

        if (processedCountFromFile > 0) {
            const firstRowKeys = Object.keys(initialFilteredData[0]);
            // Use the keys that validateColumns in import-export/page.tsx expects *after* its internal mapping
            // which are 'Código parada', 'Municipio Marquesina', 'Vigencia', 'Facturacion'
            const requiredHeaders = ['Código parada', 'Municipio Marquesina', 'Vigencia', 'Facturacion'];
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
          const rowIndexForError = index + 6; 

          // Prioritize 'codigoParada' from Excel if it exists, otherwise use 'Código parada'
          const codigo_parada_raw = row['codigoParada'] || row['Código parada'];
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";

          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'codigoParada' (o 'Código parada') es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return;
          }

          if (currentPanelIdsSet.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe o está duplicado. Omitido.`);
            skippedCount++;
            return;
          }

          // --- Corrected PIV Date Mapping ---
          const piv_instalado_raw = row['fechaInstalacion']; // From Excel: 'fechaInstalacion'
          const piv_desinstalado_raw = row['fechaDesinstalacion']; // From Excel: 'fechaDesinstalacion'
          const piv_reinstalado_raw = row['fechaReinstalacion'];   // From Excel: 'fechaReinstalacion'
          
          const piv_instalado_converted = convertToYYYYMMDD(piv_instalado_raw);
          const piv_desinstalado_converted = convertToYYYYMMDD(piv_desinstalado_raw);
          const piv_reinstalado_converted = convertToYYYYMMDD(piv_reinstalado_raw);

          const ultima_instalacion_raw = row['ultimaInstalacionOReinstalacion']; // Excel: 'ultimaInstalacionOReinstalacion'
          const ultima_instalacion_o_reinstalacion_converted = convertToYYYYMMDD(ultima_instalacion_raw);


          // Fallback for other date fields that might exist with different names in Excel
          const piv_instalado_fallback_raw = row['PIV Instalado'];
          if (!piv_instalado_converted && piv_instalado_fallback_raw) {
              const fallback_converted = convertToYYYYMMDD(piv_instalado_fallback_raw);
              if (fallback_converted) errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Usando 'PIV Instalado' como fallback para 'fechaInstalacion'.`);
          }
          const piv_desinstalado_fallback_raw = row['PIV Desinstalado'];
           if (!piv_desinstalado_converted && piv_desinstalado_fallback_raw) {
              const fallback_converted = convertToYYYYMMDD(piv_desinstalado_fallback_raw);
              if (fallback_converted) errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Usando 'PIV Desinstalado' como fallback para 'fechaDesinstalacion'.`);
          }
          const piv_reinstalado_fallback_raw = row['PIV Reinstalado'];
           if (!piv_reinstalado_converted && piv_reinstalado_fallback_raw) {
              const fallback_converted = convertToYYYYMMDD(piv_reinstalado_fallback_raw);
              if (fallback_converted) errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Usando 'PIV Reinstalado' como fallback para 'fechaReinstalacion'.`);
          }
          // --- End Corrected PIV Date Mapping ---


          const municipio_raw = row['Municipio Marquesina'] || row['municipio'];
          const municipio = (municipio_raw !== undefined && municipio_raw !== null && String(municipio_raw).trim() !== "") ? String(municipio_raw).trim() : "Sin especificar";

          const vigencia_excel_raw = row['Vigencia'] || row['vigencia'];
          const vigencia_cleaned = (vigencia_excel_raw !== undefined && vigencia_excel_raw !== null) ? String(vigencia_excel_raw).trim().toLowerCase() : "";
          const panelStatus = vigenciaStatusMapping[vigencia_cleaned] || 'pending_installation';
          
          const cliente_raw = row['Empresas concesionarias'] || row['empresaConcesionaria'];
          const cliente = (cliente_raw !== undefined && cliente_raw !== null && String(cliente_raw).trim() !== "") ? String(cliente_raw).trim() : "Sin asignar";

          const direccion_raw = row['Direccion CCE (Clear Channel)'] || row['direccion'] || row['Dirección'];
          const direccion = String(direccion_raw || '').trim();

          const notas_raw = row['Observaciones'];
          const notas = String(notas_raw || '').trim();

          const codigo_marquesina_raw = row['Código Marquesina'] || row['codigoMarquesina'];
          const codigo_marquesina = String(codigo_marquesina_raw || '').trim();

          const tipo_piv_raw = row['Tipo PIV'] || row['tipoPiv'];
          const tipo_piv = String(tipo_piv_raw || '').trim();

          const industrial_raw = row['Industrial'] || row['industrial'];
          const industrial = String(industrial_raw || '').trim();

          const funcionamiento_raw = row['Funcionamiento'];
          const funcionamiento = (funcionamiento_raw !== undefined && funcionamiento_raw !== null && String(funcionamiento_raw || '').trim() !== "") ? String(funcionamiento_raw || '').trim() : "Sin revisar";

          const diagnostico_raw = row['Diagnóstico'];
          const diagnostico = String(diagnostico_raw || '').trim();

          const tecnico_raw = row['TÉCNICO'] || row['tecnico'];
          const tecnico = (tecnico_raw !== undefined && tecnico_raw !== null && String(tecnico_raw || '').trim() !== "") ? String(tecnico_raw || '').trim() : "Sin asignar";

          const facturacionOriginalRaw = row["Facturacion"] || row["importeMensual"];
          const importe_mensual_para_calculo = 0; 
          const importe_mensual_original_parsed = procesarImporteFacturacion(facturacionOriginalRaw);


          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            piv_instalado: piv_instalado_converted || convertToYYYYMMDD(piv_instalado_fallback_raw),
            piv_desinstalado: piv_desinstalado_converted || convertToYYYYMMDD(piv_desinstalado_fallback_raw),
            piv_reinstalado: piv_reinstalado_converted || convertToYYYYMMDD(piv_reinstalado_fallback_raw),
            
            municipality: municipio,
            client: cliente,
            address: direccion || "Sin dirección",
            status: panelStatus,
            notes: notas,
            
            codigo_marquesina: codigo_marquesina,
            tipo_piv: tipo_piv,
            industrial: industrial,
            funcionamiento: funcionamiento,
            diagnostico: diagnostico,
            tecnico: tecnico,

            marquesina: String(row['marquesina'] || '').trim(),
            cce: String(row['Cce'] || row['cce'] || '').trim(),
            ultima_instalacion_o_reinstalacion: ultima_instalacion_o_reinstalacion_converted,
            vigencia: String(vigencia_excel_raw || '').trim(),
            empresa_concesionaria: String(cliente_raw || '').trim(),


            importe_mensual: importe_mensual_para_calculo, 
            importe_mensual_original: String(facturacionOriginalRaw || ''),

            installationDate: piv_instalado_converted || ultima_instalacion_o_reinstalacion_converted || convertToYYYYMMDD(piv_instalado_fallback_raw),
            lastStatusUpdate: piv_instalado_converted || ultima_instalacion_o_reinstalacion_converted || convertToYYYYMMDD(piv_instalado_fallback_raw) || format(new Date(), 'yyyy-MM-dd'),
            fecha_importacion: new Date().toISOString(),
            importado_por: "currentUser",
          };
          
          // Validation and logging for critical fields
          if (!newPanel.piv_instalado) {
            if (piv_instalado_raw && String(piv_instalado_raw).trim() !== '') {
                 errors.push(`Fila ${rowIndexForError} (Panel ${newPanel.codigo_parada}): 'fechaInstalacion' (mapeado a piv_instalado) es inválida: '${piv_instalado_raw}'. El panel no será facturable.`);
            } else if (piv_instalado_fallback_raw && String(piv_instalado_fallback_raw).trim() !== '') {
                 errors.push(`Fila ${rowIndexForError} (Panel ${newPanel.codigo_parada}): 'PIV Instalado' (fallback, mapeado a piv_instalado) es inválida: '${piv_instalado_fallback_raw}'. El panel no será facturable.`);
            } else {
                 console.warn(`Panel ${newPanel.codigo_parada} no tiene fecha de instalación (piv_instalado) válida tras mapeo. No será facturable.`);
            }
          }


          billingStats.totalPanels++;
          if (importe_mensual_original_parsed > 0) {
            billingStats.panelesConImporte++;
            billingStats.importeTotalMensual += importe_mensual_original_parsed;
            billingStats.importeMinimo = Math.min(billingStats.importeMinimo, importe_mensual_original_parsed);
            billingStats.importeMaximo = Math.max(billingStats.importeMaximo, importe_mensual_original_parsed);
          } else {
            billingStats.panelesSinImporte++;
            if (facturacionOriginalRaw && String(facturacionOriginalRaw).trim() !== '') {
               billingStats.erroresFormatoImporte.push({
                 codigo_parada: newPanel.codigo_parada,
                 valor_original: String(facturacionOriginalRaw),
                 fila: rowIndexForError
               });
            }
          }
          
          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          addedCount++;
          if (!firstPanelMappedForDebug) {
            firstPanelMappedForDebug = newPanel;
          }
        });

        if (billingStats.importeMinimo === Infinity) billingStats.importeMinimo = 0;

        if (newPanelsToImport.length > 0) {
          setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
          
          // Debug log for the first panel
          if (firstPanelMappedForDebug) {
            console.log('Primer panel mapeado:', JSON.parse(JSON.stringify(firstPanelMappedForDebug))); // Deep copy for clean log
            console.log('Campos de fecha del primer panel:', {
              piv_instalado: firstPanelMappedForDebug.piv_instalado,
              piv_desinstalado: firstPanelMappedForDebug.piv_desinstalado,
              piv_reinstalado: firstPanelMappedForDebug.piv_reinstalado,
              ultima_instalacion_o_reinstalacion: firstPanelMappedForDebug.ultima_instalacion_o_reinstalacion,
              excel_fechaInstalacion_raw: initialFilteredData[0] ? initialFilteredData[0]['fechaInstalacion'] : 'N/A',
              excel_fechaDesinstalacion_raw: initialFilteredData[0] ? initialFilteredData[0]['fechaDesinstalacion'] : 'N/A',
              excel_fechaReinstalacion_raw: initialFilteredData[0] ? initialFilteredData[0]['fechaReinstalacion'] : 'N/A',
            });
          }
           console.log(`Importados ${addedCount} de ${processedCountFromFile} paneles procesados inicialmente desde el archivo. ${skippedCount} omitidos.`);
        }
    } else { // monthly events
        const newEventsToImport: PanelEvent[] = [];
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));
        const headerMapping: { [key: string]: keyof PanelEvent | string } = {
            'panelid': 'panelId',
            'fecha': 'date',
            'estado anterior': 'oldStatus',
            'estado nuevo': 'newStatus',
            'notas evento': 'notes',
        };
        const normalizeHeader = (header: string) => header.toLowerCase().trim();

        initialFilteredData.forEach((row, index) => {
            const rowIndexForError = index + 2; 

            const panelEvent: Partial<PanelEvent> = {};
            let panelIdFromRow: string | undefined = undefined;

            for (const excelHeader in row) {
              const normalizedExcelHeader = normalizeHeader(excelHeader);
              const eventKey = headerMapping[normalizedExcelHeader] as keyof PanelEvent;
              if (eventKey) {
                 if (eventKey === 'panelId') {
                    panelIdFromRow = String(row[excelHeader] || '').trim();
                    panelEvent[eventKey] = panelIdFromRow;
                 } else if (eventKey === 'date') {
                    const convertedDate = convertToYYYYMMDD(row[excelHeader]);
                    if (row[excelHeader] && String(row[excelHeader]).trim() !== '' && !convertedDate) {
                        errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow || 'Desconocido'}): Fecha de evento inválida '${row[excelHeader]}'.`);
                    }
                    panelEvent[eventKey] = convertedDate;
                 } else if (eventKey === 'newStatus' || eventKey === 'oldStatus') {
                    const statusVal = String(row[excelHeader] || '').trim().toLowerCase();
                    panelEvent[eventKey] = eventStatusValueMapping[statusVal] || (eventKey === 'newStatus' ? 'unknown' : undefined);
                 } else {
                    panelEvent[eventKey] = String(row[excelHeader] || '').trim();
                 }
              }
            }

            if (!panelIdFromRow) {
                errors.push(`Fila ${rowIndexForError}: panelId es obligatorio para evento.`);
                skippedCount++;
                return;
            }
            if (!currentPanelIdsSet.has(panelIdFromRow)) {
                errors.push(`Fila ${rowIndexForError}: Panel con ID ${panelIdFromRow} (para evento) no encontrado. Omitido.`);
                skippedCount++;
                return;
            }

            const validationErrors: string[] = [];
            if (!panelEvent.date) {
                if (!(row['fecha'] && String(row['fecha']).trim() !== '')) { 
                  validationErrors.push(`fecha de evento es obligatoria.`);
                }
            }
            if (!panelEvent.newStatus || !ALL_PANEL_STATUSES.includes(panelEvent.newStatus)) {
                validationErrors.push(`estado nuevo '${row['estado nuevo'] || ''}' inválido. Valores válidos: ${ALL_PANEL_STATUSES.join(', ')}.`);
            }
            if (panelEvent.oldStatus && !ALL_PANEL_STATUSES.includes(panelEvent.oldStatus)) {
                validationErrors.push(`estado anterior '${row['estado anterior'] || ''}' inválido.`);
            }

            if (validationErrors.length > 0) {
                errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow}): ${validationErrors.join('; ')}`);
                skippedCount++;
                return;
            }

            const isDuplicate = panelEvents.some(existingEvent =>
                existingEvent.panelId === panelIdFromRow &&
                existingEvent.date === panelEvent.date && 
                (existingEvent.oldStatus || undefined) === (panelEvent.oldStatus || undefined) &&
                existingEvent.newStatus === panelEvent.newStatus
            ) || newEventsToImport.some(newEvent =>
                newEvent.panelId === panelIdFromRow &&
                newEvent.date === panelEvent.date &&
                (newEvent.oldStatus || undefined) === (panelEvent.oldStatus || undefined) &&
                newEvent.newStatus === panelEvent.newStatus
            );

            if(isDuplicate){
                errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow}): Evento duplicado omitido.`);
                skippedCount++;
                return;
            }

            newEventsToImport.push({
                id: crypto.randomUUID(),
                panelId: panelIdFromRow,
                date: panelEvent.date!, 
                oldStatus: panelEvent.oldStatus as PanelStatus | undefined,
                newStatus: panelEvent.newStatus as PanelStatus,
                notes: panelEvent.notes ? String(panelEvent.notes) : undefined,
            });
            addedCount++;
        });

        let panelIdsToUpdateFromEvents: Set<string> | null = null;
        if (newEventsToImport.length > 0) {
            panelIdsToUpdateFromEvents = new Set(newEventsToImport.map(e => e.panelId));
            setPanelEvents(prevEvents => [...prevEvents, ...newEventsToImport]);
        }

        if (panelIdsToUpdateFromEvents) {
            const latestEventsList = [...panelEvents, ...newEventsToImport];
            panelIdsToUpdateFromEvents.forEach(pid => {
                const eventsForThisPanel = latestEventsList.filter(e => e.panelId === pid);
                refreshPanelStatus(pid, eventsForThisPanel);
            });
        }
    }

    const opSuccess = addedCount > 0;
    let opMessage = `Registros procesados: ${processedCountFromFile}. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`;
    if (errors.length > 0) {
        opMessage += ` Errores/Advertencias: ${errors.length}. Revise los detalles y la consola.`;
    } else if (addedCount > 0) {
        opMessage += fileType === 'initial' ? ' Importación de paneles completada.' : ' Importación de eventos completada.';
    } else if (processedCountFromFile === 0 && fileType === 'initial') {
        opMessage = 'No se encontraron paneles válidos para importar.';
    } else if (processedCountFromFile === 0 && fileType === 'monthly') {
        opMessage = 'No se encontraron eventos válidos para importar.';
    }


    return {
        success: opSuccess,
        message: opMessage,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, 
        addedCount,
        skippedCount,
        processedCount: jsonData.length, 
        billingStats: fileType === 'initial' ? billingStats : undefined
    };
  }, [panels, panelEvents, refreshPanelStatus]);

  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    // console.warn(`Delete operation for panel ${panelId} is not fully implemented.`);
    return { success: false, message: "Función de eliminación no implementada." };
  }, []);

  const deletePanelEvent = useCallback(async (eventId: string): Promise<DataOperationResult> => {
    // console.warn(`Delete operation for event ${eventId} is not fully implemented.`);
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
  }, [panels, panelEvents]);


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

/**
 * Helper function to check if a date string is valid YYYY-MM-DD.
 * It ensures the string, after potentially trimming to 10 chars,
 * adheres to the YYYY-MM-DD format and represents a real date.
 * @param dateStr The date string to validate.
 * @returns True if valid, false otherwise.
 */
const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
  
  const datePart = dateStr.substring(0, 10); 

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
    return false;
  }
  const dateObj = parseISO(datePart);
  return isValid(dateObj) && formatDateFnsInternal(dateObj, 'yyyy-MM-dd') === datePart;
};
