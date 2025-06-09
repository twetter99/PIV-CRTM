
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFnsDateFns, format as formatDateFnsInternal } from 'date-fns';
import * as XLSX from 'xlsx'; 
import { parseAndValidateDate as parseAndValidateDateFromBillingUtils } from '@/lib/billing-utils';

interface DataOperationResult {
  success: boolean;
  message?: string;
  errors?: string[];
  addedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  processedCount?: number; 
  deletedCount?: number; 
  // billingStats?: BillingStats; // Comentado porque BillingStats fue eliminado de este archivo
}

// interface BillingStats { // Comentado
//   totalPanels: number;
//   panelesConImporte: number;
//   panelesSinImporte: number;
//   importeTotalMensual: number;
//   importeMinimo: number;
//   importeMaximo: number;
//   erroresFormatoImporte: { codigoParada: string; valor_original: string; fila: number }[];
// }


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


const convertExcelSerialToDate = (serial: number): Date | undefined => {
  if (typeof serial !== 'number' || serial <= 0) return undefined;
  try {
    const excelDate = XLSX.SSF.parse_date_code(serial);
    if (excelDate && typeof excelDate.y === 'number' && typeof excelDate.m === 'number' && typeof excelDate.d === 'number') {
        const hours = typeof excelDate.H === 'number' ? excelDate.H : 0;
        const minutes = typeof excelDate.M === 'number' ? excelDate.M : 0;
        const seconds = typeof excelDate.S === 'number' ? excelDate.S : 0;
        const date = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d, hours, minutes, seconds));
        return isValid(date) ? date : undefined;
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
};


const convertToYYYYMMDD = (dateInput: any): string | undefined => {
  if (dateInput === null || dateInput === undefined || String(dateInput).trim() === "" || String(dateInput).trim().toLowerCase() === "nan") {
    return undefined;
  }

  let date: Date | undefined;
  let originalDateInputValue = String(dateInput).trim(); 

  if (dateInput instanceof Date) { 
    if (isValid(dateInput)) {
      date = dateInput;
    } else {
      return undefined;
    }
  } else if (typeof dateInput === 'number') { 
    date = convertExcelSerialToDate(dateInput);
    if (!date || !isValid(date)) {
      return undefined;
    }
  } else if (typeof dateInput === 'string') {
    let datePartToParse = originalDateInputValue.length > 10 && (originalDateInputValue.includes(' ') || originalDateInputValue.includes('T'))
                         ? originalDateInputValue.substring(0, 10) 
                         : originalDateInputValue;
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePartToParse)) {
        let parsedDate = parseISO(datePartToParse); 
        if (isValid(parsedDate) && formatDateFnsInternal(parsedDate, 'yyyy-MM-dd') === datePartToParse) {
            date = parsedDate;
        }
    }
    
    if (!date) { 
        const parts = datePartToParse.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (parts) {
            let day_val, month_val, year_val;
            const part1 = parseInt(parts[1], 10);
            const part2 = parseInt(parts[2], 10);
            let part3 = parseInt(parts[3], 10);

            if (parts[3].length === 2) { 
                year_val = part3 < 70 ? 2000 + part3 : 1900 + part3; 
            } else if (parts[3].length === 4) { 
                year_val = part3;
            } else {
                return undefined; 
            }
            
            if (part1 > 12 && part2 <=12) { day_val = part1; month_val = part2; } 
            else if (part2 > 12 && part1 <=12) { month_val = part1; day_val = part2; } 
            else { day_val = part1; month_val = part2; } 

            if (year_val && month_val && day_val && month_val >=1 && month_val <=12 && day_val >=1 && day_val <=31) {
                const tempDate = new Date(Date.UTC(year_val, month_val - 1, day_val));
                 if (isValid(tempDate) && tempDate.getUTCFullYear() === year_val && tempDate.getUTCMonth() === month_val -1 && tempDate.getUTCDate() === day_val) {
                    date = tempDate;
                } else {
                    return undefined;
                }
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

  if (!date || !isValid(date)) {
    return undefined;
  }

  try {
    const finalYear = date.getUTCFullYear();
    const finalMonthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const finalDayStr = date.getUTCDate().toString().padStart(2, '0');
    return `${finalYear}-${finalMonthStr}-${finalDayStr}`;
  } catch (error) {
    return undefined;
  }
};


export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelEvents, setPanelEvents] = useState<PanelEvent[]>([]);

  const refreshPanelStatus = useCallback((panelId: string, currentEventsForPanel?: PanelEvent[]) => {
    setPanels(prevPanels => {
      const panelIndex = prevPanels.findIndex(p => p.codigoParada === panelId);
      if (panelIndex === -1) return prevPanels;

      const panelToUpdate = { ...prevPanels[panelIndex] };
      const today = new Date();
      today.setUTCHours(0,0,0,0); 

      let newStatus: PanelStatus = 'unknown';
      let newLastStatusUpdate: string | null = null;
      
      // Usa panelToUpdate.fechaInstalacion (camelCase)
      const panelPivInstaladoDate = parseAndValidateDateFromBillingUtils(panelToUpdate.fechaInstalacion);

      if (panelPivInstaladoDate) {
        newLastStatusUpdate = panelToUpdate.fechaInstalacion || null; // Asegurar que es string | null
        if (panelPivInstaladoDate > today) {
          newStatus = 'pending_installation';
        } else {
          newStatus = 'installed'; 
        }
      } else {
        newStatus = 'unknown';
        newLastStatusUpdate = panelToUpdate.fechaImportacion || format(today, 'yyyy-MM-dd');
      }
      
      const eventsToProcess = (currentEventsForPanel || panelEvents.filter(e => e.panelId === panelId))
        .map(e => ({ ...e, fechaObj: parseAndValidateDateFromBillingUtils(e.fecha) }))
        .filter(e => e.fechaObj && e.fechaObj <= today) 
        .sort((a,b) => a.fechaObj!.getTime() - b.fechaObj!.getTime()); 

      if (panelPivInstaladoDate) { 
          for (const event of eventsToProcess) {
            if (event.fechaObj! >= panelPivInstaladoDate) { 
                if (event.tipo === "DESINSTALACION") {
                    newStatus = 'removed';
                } else if (event.tipo === "REINSTALACION") {
                    newStatus = 'installed';
                }
                newLastStatusUpdate = event.fecha; 
            }
          }
      }

      if (panelToUpdate.status !== newStatus || panelToUpdate.lastStatusUpdate !== newLastStatusUpdate) {
        const updatedPanels = [...prevPanels];
        updatedPanels[panelIndex] = { ...panelToUpdate, status: newStatus, lastStatusUpdate: newLastStatusUpdate };
        return updatedPanels.sort((a, b) => a.codigoParada.localeCompare(b.codigoParada));
      }
      return prevPanels; 
    });
  }, [panelEvents]);


  useEffect(() => {
    // Cargar datos iniciales (actualmente deshabilitado)
  }, []);


  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigoParada === panel.codigoParada)) {
      return { success: false, message: `El panel con código ${panel.codigoParada} ya existe.` };
    }

    const today = new Date();
    today.setUTCHours(0,0,0,0);
    let initialStatus: PanelStatus;
    let initialLastStatusUpdate: string | null;

    const panelPivInstaladoDate = parseAndValidateDateFromBillingUtils(panel.fechaInstalacion);

    if (panelPivInstaladoDate) {
        initialLastStatusUpdate = panel.fechaInstalacion || null; 
        if (panelPivInstaladoDate > today) {
            initialStatus = 'pending_installation';
        } else {
            initialStatus = 'installed';
        }
    } else { 
        initialStatus = 'unknown';
        initialLastStatusUpdate = panel.fechaImportacion || format(today, 'yyyy-MM-dd');
    }

    const newPanelWithStatus: Panel = {
        ...panel,
        status: initialStatus,
        lastStatusUpdate: initialLastStatusUpdate
    };

    setPanels(prev => [...prev, newPanelWithStatus].sort((a, b) => a.codigoParada.localeCompare(b.codigoParada)));
    return { success: true, message: `Panel ${panel.codigoParada} añadido con estado inicial ${initialStatus}.` };
  }, [panels]); 

  const updatePanel = useCallback(async (panelId: string, updates: Partial<Panel>): Promise<DataOperationResult> => {
    let panelExists = false;
    
    setPanels(prev => {
        const panelIndex = prev.findIndex(p => p.codigoParada === panelId);
        if (panelIndex === -1) return prev;
        
        panelExists = true;
        const updatedPanels = [...prev];
        updatedPanels[panelIndex] = { ...updatedPanels[panelIndex], ...updates };
        return updatedPanels.sort((a, b) => a.codigoParada.localeCompare(b.codigoParada));
    });

    if (!panelExists) return { success: false, message: `Panel ${panelId} no encontrado.`};
    
    refreshPanelStatus(panelId); 
    
    return { success: true, message: `Panel ${panelId} actualizado.` };
  }, [refreshPanelStatus]);

  const getPanelById = useCallback((panelId: string) => {
    return panels.find(p => p.codigoParada === panelId);
  }, [panels]);

  const getEventsForPanel = useCallback((panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => {
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB; 
    });
  }, [panelEvents]);

  const addPanelEvent = useCallback(async (event: Partial<PanelEvent>): Promise<DataOperationResult> => {
    if (!event.panelId) return { success: false, message: "Panel ID es obligatorio para el evento." };
    
    const eventDateConverted = convertToYYYYMMDD(event.fecha);
    if (!eventDateConverted) return { success: false, message: "Fecha de evento inválida o faltante." };

    if (!event.tipo || (event.tipo !== "DESINSTALACION" && event.tipo !== "REINSTALACION")) {
        return { success: false, message: "Tipo de evento inválido. Debe ser DESINSTALACION o REINSTALACION." };
    }

    const newEventWithId = { 
        ...event, 
        fecha: eventDateConverted, 
        id: event.id || crypto.randomUUID() 
    } as PanelEvent;

    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      return updatedEvents.sort((a,b) => { 
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        return dateA - dateB;
      });
    });

    refreshPanelStatus(newEventWithId.panelId);
    
    return { success: true, message: `Evento para ${newEventWithId.panelId} añadido.` };
  }, [refreshPanelStatus]);

  const updatePanelEvent = useCallback(async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId: string | undefined;
    let originalPanelIdForRefresh: string | undefined;
    let eventExists = false;

    if (updates.fecha) {
        const updatedDate = convertToYYYYMMDD(updates.fecha);
        if (!updatedDate) return { success: false, message: "Fecha de evento actualizada inválida." };
        updates.fecha = updatedDate;
    }
    if (updates.tipo && (updates.tipo !== "DESINSTALACION" && updates.tipo !== "REINSTALACION")) {
        return { success: false, message: "Tipo de evento actualizado inválido." };
    }

    setPanelEvents(prevEvents => {
      const eventIndex = prevEvents.findIndex(e => e.id === eventId);
      if (eventIndex === -1) {
        return prevEvents;
      }
      eventExists = true;

      const updatedEvents = [...prevEvents];
      const originalEvent = updatedEvents[eventIndex];
      originalPanelIdForRefresh = originalEvent.panelId;
      affectedPanelId = updates.panelId || originalEvent.panelId; 
      updatedEvents[eventIndex] = { ...originalEvent, ...updates } as PanelEvent;
      return updatedEvents.sort((a,b) => {
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        return dateA - dateB;
      });
    });

    if (!eventExists) return { success: false, message: `Evento con ID ${eventId} no encontrado.`};

    if (originalPanelIdForRefresh && originalPanelIdForRefresh !== affectedPanelId) {
      refreshPanelStatus(originalPanelIdForRefresh);
    }
    if (affectedPanelId) {
      refreshPanelStatus(affectedPanelId);
    }
    return { success: true, message: `Evento ${eventId} actualizado.` };
  }, [refreshPanelStatus]);


  const importInitialData = useCallback(async (jsonData: any[], fileType: 'initial' | 'monthly'): Promise<DataOperationResult> => {
    const errors: string[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    const panelIdsToRefresh: Set<string> = new Set();
    
    // const billingStats: BillingStats = { // Comentado
    //     totalPanels: 0, 
    //     panelesConImporte: 0, 
    //     panelesSinImporte: 0, 
    //     importeTotalMensual: 0, 
    //     importeMinimo: Infinity, 
    //     importeMaximo: -Infinity, 
    //     erroresFormatoImporte: [] 
    // } as BillingStats;

    const initialFilteredData = jsonData.filter(row =>
        Object.values(row).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );
    const processedCountFromFile = initialFilteredData.length;

    if (processedCountFromFile === 0) {
         return {
            success: false,
            message: `No se encontraron ${fileType === 'initial' ? 'paneles' : 'eventos'} procesables en el archivo.`,
            errors: ["No se encontraron datos para importar."],
            processedCount: jsonData.length, addedCount, skippedCount
         }
    }

    const todayFormatted = new Date().toISOString().split('T')[0];

    if (fileType === 'initial') {
        const newPanelsToImport: Panel[] = [];
        const newEventsToCreate: PanelEvent[] = [];
        const importedPanelIdsInFile = new Set<string>();
        const currentPanelIdsSet = new Set(panels.map(p => p.codigoParada));
        
        initialFilteredData.forEach((row, index) => {
          const rowIndexForError = index + 6; 

          const codigoParadaRaw = row['codigoParada']; // Acceder con camelCase
          const panelCodigoParada = codigoParadaRaw !== undefined && codigoParadaRaw !== null ? String(codigoParadaRaw).trim() : "";

          if (!panelCodigoParada) {
            errors.push(`Fila ${rowIndexForError}: 'codigoParada' es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return;
          }

          if (currentPanelIdsSet.has(panelCodigoParada) || importedPanelIdsInFile.has(panelCodigoParada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${panelCodigoParada}' ya existe o está duplicado en el archivo. Omitido.`);
            skippedCount++;
            return;
          }
          
          const fechaInstalacionOriginal = row['fechaInstalacion'];
          const fechaDesinstalacionOriginal = row['fechaDesinstalacion'];
          const fechaReinstalacionOriginal = row['fechaReinstalacion'];
          
          const fechaInstalacionConvertida = convertToYYYYMMDD(fechaInstalacionOriginal);
          const fechaDesinstalacionConvertida = convertToYYYYMMDD(fechaDesinstalacionOriginal);
          const fechaReinstalacionConvertida = convertToYYYYMMDD(fechaReinstalacionOriginal);
          
          if (!fechaInstalacionConvertida) {
             errors.push(`Fila ${rowIndexForError} (Panel ${panelCodigoParada}): 'fechaInstalacion' ("${fechaInstalacionOriginal}") es inválida o faltante. Este campo es obligatorio. Panel omitido.`);
             skippedCount++;
             return; 
          }
          
          const importeMensualOriginal = row['importeMensual'];
          let importeMensualFinal = 37.7; 
          if (importeMensualOriginal !== null && importeMensualOriginal !== undefined && String(importeMensualOriginal).trim() !== '') {
              const parsedAmount = parseFloat(String(importeMensualOriginal).replace(',', '.'));
              if (!isNaN(parsedAmount) && parsedAmount >= 0) {
                  importeMensualFinal = parsedAmount;
              } else {
                  errors.push(`Fila ${rowIndexForError} (Panel ${panelCodigoParada}): 'importeMensual' ("${importeMensualOriginal}") es inválido. Usando por defecto ${importeMensualFinal}.`);
              }
          }
          
          // Crear el objeto newPanel
          // Los campos obligatorios de la interfaz Panel deben tener un valor
          const newPanel: Panel = {
            codigoParada: panelCodigoParada,
            fechaInstalacion: fechaInstalacionConvertida, // Guardar la fecha convertida para lógica interna
            fechaDesinstalacion: fechaDesinstalacionConvertida,
            fechaReinstalacion: fechaReinstalacionConvertida,
            importeMensual: importeMensualFinal,
            
            // Campos que esperamos del Excel (camelCase)
            // Si el Excel no los tiene, serán undefined y se guardarán así si el tipo lo permite, o string vacío
            municipioMarquesina: String(row.municipioMarquesina || '').trim(),
            cliente: String(row.empresaConcesionaria || row.cliente || '').trim(), // Prioriza empresaConcesionaria
            direccion: String(row.direccionCce || row.direccion || '').trim(), // Prioriza direccionCce
            observaciones: String(row.observaciones || row.notas || '').trim(),
            
            // Asignar todos los demás campos camelCase directamente desde row
            // La interfaz Panel con [key: string]: any permite esto.
            // Estos son los valores "crudos" del Excel.
            codigoMarquesina: row.codigoMarquesina,
            vigencia: row.vigencia,
            tipoPiv: row.tipoPiv,
            industrial: row.industrial,
            empresaConcesionaria: row.empresaConcesionaria,
            op1: row.op1,
            op2: row.op2,
            marquesinaCce: row.marquesinaCce,
            direccionCce: row.direccionCce, // Puede ser redundante si ya se asignó a 'direccion'
            ultimaInstalacionOReinstalacion: row.ultimaInstalacionOReinstalacion, // Este es el valor crudo
            cambioUbicacionReinstalacionesContrato2024_2025: row.cambioUbicacionReinstalacionesContrato2024_2025,
            reinstalacionVandalizados: row.reinstalacionVandalizados,
            garantiaCaducada: row.garantiaCaducada,
            descripcionCorta: row.descripcionCorta,
            codigoPivAsignado: row.codigoPivAsignado,

            // Campos calculados/internos
            status: 'unknown', // Se recalculará
            lastStatusUpdate: null, // Se recalculará
            fechaImportacion: todayFormatted,
            importadoPor: "currentUser", 
            importeMensualOriginal: String(importeMensualOriginal || ''),
          };
          
            // billingStats.totalPanels++; // Comentado
            // if (importeMensualFinal > 0) {
            //     billingStats.panelesConImporte++;
            //     billingStats.importeTotalMensual += importeMensualFinal;
            //     if (importeMensualFinal < billingStats.importeMinimo) billingStats.importeMinimo = importeMensualFinal;
            //     if (importeMensualFinal > billingStats.importeMaximo) billingStats.importeMaximo = importeMensualFinal;
            // } else {
            //     billingStats.panelesSinImporte++;
            // }
          
            newPanelsToImport.push(newPanel);
            importedPanelIdsInFile.add(panelCodigoParada);
          
          // Crear eventos basados en fechas convertidas
          if (fechaDesinstalacionConvertida) {
            newEventsToCreate.push({
              id: crypto.randomUUID(),
              panelId: panelCodigoParada,
              tipo: "DESINSTALACION",
              fecha: fechaDesinstalacionConvertida,
              notes: "Evento creado desde fechaDesinstalacion en importación inicial"
            });
          }
          if (fechaReinstalacionConvertida) {
            const desinstallDateObj = parseAndValidateDateFromBillingUtils(fechaDesinstalacionConvertida);
            const reinstallDateObj = parseAndValidateDateFromBillingUtils(fechaReinstalacionConvertida);
            
            if (reinstallDateObj && (!desinstallDateObj || reinstallDateObj >= desinstallDateObj)) {
              newEventsToCreate.push({
                id: crypto.randomUUID(),
                panelId: panelCodigoParada,
                tipo: "REINSTALACION",
                fecha: fechaReinstalacionConvertida,
                notes: "Evento creado desde fechaReinstalacion en importación inicial"
              });
            } else if (reinstallDateObj && desinstallDateObj && reinstallDateObj < desinstallDateObj) {
                errors.push(`Fila ${rowIndexForError} (Panel ${panelCodigoParada}): 'fechaReinstalacion' ("${fechaReinstalacionOriginal}") es anterior a 'fechaDesinstalacion'. Evento de reinstalación omitido o podría necesitar revisión manual.`);
            }
          }
        });

        setPanels(prevPanels => [...prevPanels, ...newPanelsToImport].sort((a,b) => a.codigoParada.localeCompare(b.codigoParada)));
        addedCount = newPanelsToImport.length;

        if (newEventsToCreate.length > 0) {
            setPanelEvents(prevEvents => [...prevEvents, ...newEventsToCreate].sort((a,b) => {
                const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
                const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
                return dateA - dateB;
            }));
        }
        
        newPanelsToImport.forEach(panel => panelIdsToRefresh.add(panel.codigoParada));
        panelIdsToRefresh.forEach(id => refreshPanelStatus(id));
        
    } else { // fileType === 'monthly'
        const newEventsToImport: PanelEvent[] = [];
        const currentPanelIdsSet = new Set(panels.map(p => p.codigoParada));
        const headerMapping: { [key: string]: keyof PanelEvent | string } = {
            'panelid': 'panelId', // El Excel de eventos usa 'panelid'
            'fecha': 'fecha', 
            'estado anterior': 'oldStatus', 
            'estado nuevo': 'newStatus',   
            'tipo evento': 'tipo',         
            'notas evento': 'notes',
        };
        const normalizeHeader = (header: string) => header.toLowerCase().trim();

        initialFilteredData.forEach((row, index) => {
            const rowIndexForError = index + 2; 
            const panelEvent: Partial<PanelEvent> = { id: crypto.randomUUID() };
            let panelIdFromRow: string | undefined = undefined;
            let tipoEventoDeterminado: "DESINSTALACION" | "REINSTALACION" | undefined = undefined;

            for (const excelHeader in row) {
              const normalizedExcelHeader = normalizeHeader(excelHeader);
              const eventKey = headerMapping[normalizedExcelHeader] as keyof PanelEvent | 'oldStatus' | 'newStatus';
              
              if (eventKey === 'panelId') {
                 panelIdFromRow = String(row[excelHeader] || '').trim();
                 panelEvent.panelId = panelIdFromRow;
              } else if (eventKey === 'fecha') {
                 panelEvent.fecha = convertToYYYYMMDD(row[excelHeader]);
                 if (row[excelHeader] && String(row[excelHeader]).trim() !== '' && !panelEvent.fecha) {
                    errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow || 'Desconocido'}): Fecha de evento inválida '${row[excelHeader]}'.`);
                 }
              } else if (eventKey === 'tipo') {
                  const tipoRaw = String(row[excelHeader] || '').trim().toUpperCase();
                  if (tipoRaw === "DESINSTALACION" || tipoRaw === "REINSTALACION") {
                      tipoEventoDeterminado = tipoRaw as "DESINSTALACION" | "REINSTALACION";
                      panelEvent.tipo = tipoEventoDeterminado;
                  } else if (tipoRaw !== '') {
                      errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow || 'Desconocido'}): Tipo de evento '${row[excelHeader]}' inválido en columna 'tipo evento'.`);
                  }
              } else if (eventKey === 'oldStatus' || eventKey === 'newStatus') {
                  const statusVal = String(row[excelHeader] || '').trim().toLowerCase();
                  const panelStatusMapped = eventStatusValueMapping[statusVal] || 'unknown'; 
                  
                  if (eventKey === 'oldStatus') panelEvent.oldStatus = panelStatusMapped as PanelStatus;
                  if (eventKey === 'newStatus') panelEvent.newStatus = panelStatusMapped as PanelStatus;

              } else if (eventKey === 'notes'){
                 panelEvent.notes = String(row[excelHeader] || '').trim();
              }
            }

            if (!panelIdFromRow) { errors.push(`Fila ${rowIndexForError}: Falta panelId para evento.`); skippedCount++; return; }
            if (!currentPanelIdsSet.has(panelIdFromRow)) { errors.push(`Fila ${rowIndexForError}: PanelId ${panelIdFromRow} para evento no existe en los paneles cargados.`); skippedCount++; return; }
            if (!panelEvent.fecha) { errors.push(`Fila ${rowIndexForError}: Fecha faltante o inválida para evento del panel ${panelIdFromRow}.`); skippedCount++; return; }

            if (!tipoEventoDeterminado) {
                if (panelEvent.newStatus === 'removed' || panelEvent.newStatus === 'pending_removal') {
                    tipoEventoDeterminado = "DESINSTALACION";
                } else if (panelEvent.newStatus === 'installed' && panelEvent.oldStatus && (panelEvent.oldStatus === 'removed' || panelEvent.oldStatus === 'maintenance')) {
                    tipoEventoDeterminado = "REINSTALACION";
                } else {
                    errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow}): No se pudo determinar tipo de evento (DESINSTALACION/REINSTALACION). newStatus: ${panelEvent.newStatus}, oldStatus: ${panelEvent.oldStatus}. El evento no será importado.`);
                    skippedCount++;
                    return;
                }
                panelEvent.tipo = tipoEventoDeterminado;
            }
            delete panelEvent.oldStatus; // No son parte del modelo PanelEvent final
            delete panelEvent.newStatus; // No son parte del modelo PanelEvent final
            
            newEventsToImport.push(panelEvent as PanelEvent);
            panelIdsToRefresh.add(panelIdFromRow);
        });

        if (newEventsToImport.length > 0) {
            setPanelEvents(prevEvents => [...prevEvents, ...newEventsToImport].sort((a,b) => {
                const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
                const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
                return dateA - dateB;
            }));
            addedCount += newEventsToImport.length;
        }
        panelIdsToRefresh.forEach(id => refreshPanelStatus(id));
    }

    const opSuccess = addedCount > 0 || (fileType === 'initial' && initialFilteredData.length > 0 && skippedCount < processedCountFromFile && addedCount > 0);
    let opMessage = `Registros procesados desde archivo: ${processedCountFromFile}. `;
    if (fileType === 'initial') {
        opMessage += `Paneles ${initialFilteredData.length > addedCount ? 'intentados según archivo' : 'añadidos'}: ${addedCount}. `;
    } else {
        opMessage += `Eventos añadidos: ${addedCount}. `;
    }
    opMessage += `Omitidos/Errores: ${skippedCount}.`;

    if (errors.length > 0) {
        opMessage += ` Errores/Advertencias: ${errors.length}. Revise los detalles y la consola. Primeros errores: ${errors.slice(0,3).join('; ')}`;
    } else if (addedCount > 0) {
        opMessage += fileType === 'initial' ? ' Importación de paneles completada.' : ' Importación de eventos completada.';
    } else if (skippedCount === processedCountFromFile && processedCountFromFile > 0) {
         opMessage = `Se procesaron ${processedCountFromFile} ${fileType === 'initial' ? 'paneles' : 'eventos'} del archivo, pero todos fueron omitidos debido a duplicados o errores.`;
    }
     else if (processedCountFromFile > 0 && addedCount === 0) {
        opMessage = `No se ${fileType === 'initial' ? 'importaron paneles nuevos válidos' : 'importaron eventos nuevos válidos'}. Verifique el archivo y los logs. ${opMessage}`;
    } else { 
        opMessage = `No se encontraron datos válidos para importar.`;
    }
    
    return {
        success: opSuccess,
        message: opMessage,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined, 
        addedCount,
        skippedCount,
        processedCount: jsonData.length, 
        // billingStats: fileType === 'initial' ? billingStats : undefined // Comentado
    };
  }, [panels, panelEvents, refreshPanelStatus]); // addPanel y addPanelEvent eliminados de dependencias

  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    // Implementación futura
    setPanels(prev => prev.filter(p => p.codigoParada !== panelId));
    setPanelEvents(prev => prev.filter(e => e.panelId !== panelId));
    return { success: true, message: `Panel ${panelId} y sus eventos eliminados (simulado).` };
  }, []);

  const deletePanelEvent = useCallback(async (eventId: string): Promise<DataOperationResult> => {
    let panelIdToRefresh: string | undefined;
    setPanelEvents(prev => {
        const eventToDelete = prev.find(e => e.id === eventId);
        if (eventToDelete) panelIdToRefresh = eventToDelete.panelId;
        return prev.filter(e => e.id !== eventId);
    });
    if (panelIdToRefresh) refreshPanelStatus(panelIdToRefresh);
    return { success: true, message: `Evento ${eventId} eliminado.` };
  }, [refreshPanelStatus]);

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

const eventStatusValueMapping: { [key: string]: PanelStatus } = {
  'instalado': 'installed',
  'eliminado': 'removed',
  'mantenimiento': 'maintenance',
  'pendiente instalacion': 'pending_installation',
  'pendiente instalación': 'pending_installation',
  'pendiente eliminacion': 'pending_removal',
  'pendiente eliminación': 'pending_removal',
  'desconocido': 'unknown',
  'ok': 'installed',
  'en rev.': 'maintenance',
  'desinstalado': 'removed',
  'pendiente': 'pending_installation', 
};
