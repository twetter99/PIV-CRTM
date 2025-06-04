
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFnsDateFns } from 'date-fns'; // Renamed to avoid conflict
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
    // console.warn(`isValidDateString: Invalid format for date string: ${dateStr}`);
    return false;
  }
  const date = parseISO(dateStr);
  return isValid(date);
};

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
  if (dateInput === null || dateInput === undefined || String(dateInput).trim() === "") {
    return undefined;
  }
  
  let date: Date;

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
    const trimmedDateInput = dateInput.trim();
    let parsedDate = parseISO(trimmedDateInput); 
    if (isValid(parsedDate)) {
      if (/^\d{4}$/.test(trimmedDateInput)) {
          // console.warn(`convertToYYYYMMDD: Ambiguous year-only string: ${trimmedDateInput}`);
          return undefined; 
      }
      date = parsedDate;
    } else {
      const parts = trimmedDateInput.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (parts) {
        let day, month, year;
        const part1 = parseInt(parts[1], 10);
        const part2 = parseInt(parts[2], 10);
        let part3 = parseInt(parts[3], 10);

        if (parts[3].length === 2) {
            year = part3 < 70 ? 2000 + part3 : 1900 + part3; 
        } else {
            year = part3;
        }

        if (part1 > 12 && part2 <= 12) { 
            day = part1; month = part2;
        } else if (part1 <= 12 && part2 > 12) { 
            month = part1; day = part2;
        } else if (part1 <=12 && part2 <=12) { 
            day = part1; month = part2;
        } else { 
            // console.warn(`convertToYYYYMMDD: Invalid day/month in string: ${trimmedDateInput}`);
            return undefined;
        }
        
        if (year && month && day) {
            date = new Date(Date.UTC(year, month - 1, day));
            if (!isValid(date) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month -1 || date.getUTCDate() !== day) {
                // console.warn(`convertToYYYYMMDD: Date rolled over or invalid after construction: ${trimmedDateInput}`);
                return undefined;
            }
        } else {
            // console.warn(`convertToYYYYMMDD: Could not parse day/month/year from: ${trimmedDateInput}`);
            return undefined;
        }
      } else {
        // console.warn(`convertToYYYYMMDD: Unparseable date string: ${trimmedDateInput}`);
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
            const dateA = parseISO(a.date).getTime();
            const dateB = parseISO(b.date).getTime();
            if (isNaN(dateA) || isNaN(dateB)) return 0; 
            return dateB - dateA; 
        });

      let newStatus = panelToUpdate.status;
      let newLastStatusUpdate = panelToUpdate.lastStatusUpdate;
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      if (sortedEvents.length > 0) {
        const latestEvent = sortedEvents[0];
        newStatus = latestEvent.newStatus;
        newLastStatusUpdate = latestEvent.date;
      } else if (panelToUpdate.installationDate && isValidDateString(panelToUpdate.installationDate)) {
        newStatus = panelToUpdate.status; 
        newLastStatusUpdate = panelToUpdate.installationDate;
        if (newStatus === 'pending_installation' && parseISO(panelToUpdate.installationDate) <= parseISO(todayStr)) {
          newStatus = 'installed';
        }
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
    
    // const todayStr = format(new Date(), 'yyyy-MM-dd');

    const panelsWithInitialStatus = initialPanelsData.map(panel => {
      const relevantEvents = initialEventsData
        .filter(e => e.panelId === panel.codigo_parada)
        .sort((a, b) => { 
            const dateA = parseISO(a.date).getTime();
            const dateB = parseISO(b.date).getTime();
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return dateB - dateA;
        });

      let currentStatus = panel.status;
      let currentLastStatusUpdate = panel.lastStatusUpdate || (panel.installationDate && isValidDateString(panel.installationDate) ? panel.installationDate : null);
      
      if (relevantEvents.length > 0) {
        currentStatus = relevantEvents[0].newStatus;
        currentLastStatusUpdate = relevantEvents[0].date;
      } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
        // Logic for status update based on installation date might be too simplistic here
        // Keeping it as is, but primary status update logic should be in refreshPanelStatus
        // or based on PIV dates if those become the single source of truth for status.
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
        lastStatusUpdate: panel.installationDate || panel.lastStatusUpdate || format(new Date(), 'yyyy-MM-dd') 
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
        const dateA = parseISO(a.date).getTime();
        const dateB = parseISO(b.date).getTime();
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB; 
    });
  }, [panelEvents]);
  
  const addPanelEvent = useCallback(async (event: Partial<PanelEvent>): Promise<DataOperationResult> => {
    if (!event.panelId) return { success: false, message: "Panel ID es obligatorio para el evento." };
    const newEventWithId = { ...event, id: event.id || crypto.randomUUID() } as PanelEvent;
    
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
    
          const codigo_parada_raw = row['Código parada'];
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";
    
          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'Código parada' es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return; 
          }
    
          if (currentPanelIdsSet.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe en la base de datos o está duplicado en este archivo. Omitido.`);
            skippedCount++;
            return; 
          }
    
          const municipio_raw = row['Municipio Marquesina'];
          const municipio = (municipio_raw !== undefined && municipio_raw !== null && String(municipio_raw).trim() !== "") ? String(municipio_raw).trim() : "Sin especificar";
    
          const vigencia_raw = row['Vigencia'];
          const vigencia_cleaned = (vigencia_raw !== undefined && vigencia_raw !== null) ? String(vigencia_raw).trim().toLowerCase() : "";
          const panelStatus = vigenciaStatusMapping[vigencia_cleaned] || 'pending_installation'; 
    
          const installationDateExcel = row['Última instalación/reinstalación']; 
          const installationDate_converted = convertToYYYYMMDD(installationDateExcel);
          if (installationDateExcel && !installationDate_converted) {
            errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Fecha 'Última instalación/reinstalación' inválida: '${installationDateExcel}'.`);
          }


          // PIV specific dates - ensure they are always present in the object, defaulting to null
          const pivInstaladoRaw = row['PIV Instalado'];
          const piv_instalado_converted = convertToYYYYMMDD(pivInstaladoRaw);
          if (pivInstaladoRaw && String(pivInstaladoRaw).trim() !== '' && !piv_instalado_converted) {
            errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Fecha 'PIV Instalado' inválida: '${pivInstaladoRaw}'.`);
          }

          const pivDesinstaladoRaw = row['PIV Desinstalado'];  
          const piv_desinstalado_converted = convertToYYYYMMDD(pivDesinstaladoRaw);
          if (pivDesinstaladoRaw && String(pivDesinstaladoRaw).trim() !== '' && !piv_desinstalado_converted) {
            errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Fecha 'PIV Desinstalado' inválida: '${pivDesinstaladoRaw}'.`);
          }

          const pivReinstaladoRaw = row['PIV Reinstalado'];
          const piv_reinstalado_converted = convertToYYYYMMDD(pivReinstaladoRaw);
           if (pivReinstaladoRaw && String(pivReinstaladoRaw).trim() !== '' && !piv_reinstalado_converted) {
            errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): Fecha 'PIV Reinstalado' inválida: '${pivReinstaladoRaw}'.`);
          }
    
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

          const facturacionOriginalRaw = row["Facturacion"]; 
          
          const importe_mensual_para_calculo = 0; 


          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            municipality: municipio,
            status: panelStatus,
            client: cliente,
            address: direccion || "Sin dirección",
            notes: notas,
            installationDate: installationDate_converted === undefined ? null : installationDate_converted, 
            lastStatusUpdate: installationDate_converted === undefined ? null : installationDate_converted || format(new Date(), 'yyyy-MM-dd'), 
            
            piv_instalado: piv_instalado_converted === undefined ? null : piv_instalado_converted,
            piv_desinstalado: piv_desinstalado_converted === undefined ? null : piv_desinstalado_converted,
            piv_reinstalado: piv_reinstalado_converted === undefined ? null : piv_reinstalado_converted,
            
            codigo_marquesina: codigo_marquesina,
            tipo_piv: tipo_piv,
            industrial: industrial,
            funcionamiento: funcionamiento,
            diagnostico: diagnostico,
            tecnico: tecnico,
            
            importe_mensual: importe_mensual_para_calculo, 
            importe_mensual_original: String(facturacionOriginalRaw || ''), 

            fecha_importacion: new Date().toISOString(),
            importado_por: "currentUser", 
          };
          
          billingStats.totalPanels++;
          const originalImporteNumerico = procesarImporteFacturacion(facturacionOriginalRaw);
          if (originalImporteNumerico > 0) {
            billingStats.panelesConImporte++;
            billingStats.importeTotalMensual += originalImporteNumerico;
            billingStats.importeMinimo = Math.min(billingStats.importeMinimo, originalImporteNumerico);
            billingStats.importeMaximo = Math.max(billingStats.importeMaximo, originalImporteNumerico);
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
          
          // console.log('Verificación Fechas PIV:', {
          //   codigo_parada: newPanel.codigo_parada,
          //   piv_instalado: newPanel.piv_instalado,
          //   piv_desinstalado: newPanel.piv_desinstalado,
          //   piv_reinstalado: newPanel.piv_reinstalado,
          //   installationDate: newPanel.installationDate,
          //   raw_piv_instalado: pivInstaladoRaw,
          //   raw_ultima_instalacion: installationDateExcel
          // });

          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          addedCount++;
        });
        
        if (billingStats.importeMinimo === Infinity) billingStats.importeMinimo = 0; 
    
        if (newPanelsToImport.length > 0) {
          setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
        }
    } else { 
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
                // Error ya registrado si la fecha original existía pero no se pudo convertir
                if (!(row['fecha'] && String(row['fecha']).trim() !== '')) { // Solo añadir si la celda estaba realmente vacía.
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
        opMessage += ` Errores: ${errors.length}. Revise los detalles para más información.`;
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
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Devuelve solo los primeros 10 errores para no sobrecargar
        addedCount,
        skippedCount,
        processedCount: jsonData.length, 
        billingStats: fileType === 'initial' ? billingStats : undefined
    };
  }, [panels, panelEvents, refreshPanelStatus]); 
  
  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    console.warn(`Delete operation for panel ${panelId} is not fully implemented.`);
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
