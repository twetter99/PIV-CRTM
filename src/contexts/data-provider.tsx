
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { MOCK_PANELS, MOCK_PANEL_EVENTS } from '@/lib/mock-data';
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
  // importMonthlyEvents: (data: Partial<PanelEvent>[]) => Promise<DataOperationResult>; // Merged into importInitialData for now
  deletePanel: (panelId: string) => Promise<DataOperationResult>;
  deletePanelEvent: (eventId: string) => Promise<DataOperationResult>;
  clearAllPivData: () => Promise<DataOperationResult>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // console.warn(`Invalid date string format: ${dateStr}`);
  }
  const date = parseISO(dateStr);
  return isValid(date);
};

const isValidExcelDate = (serial: number): boolean => {
    // Basic check: Excel dates are positive numbers.
    // More specific checks could be added (e.g. not too far in past/future)
    return typeof serial === 'number' && serial > 0;
};

const convertExcelDate = (serial: number): string | undefined => {
    if (!isValidExcelDate(serial)) return undefined;
    // Excel date serial number (days since 1900-01-00)
    // JavaScript Date uses milliseconds since 1970-01-01
    // Subtract 25569 days (days from 1900-01-00 to 1970-01-01, adjusting for Excel's leap year bug for 1900)
    const excelEpochDiff = 25569;
    const date = new Date((serial - excelEpochDiff) * 86400000); // 86400000 ms in a day
    if (isValid(date)) {
        // Format to YYYY-MM-DD, ensuring UTC to avoid timezone shifts from local interpretation
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
  if (typeof dateInput === 'number') { // Assume Excel serial date
    return convertExcelDate(dateInput);
  } else if (dateInput instanceof Date) {
    if (isValid(dateInput)) {
      date = dateInput;
    } else {
      return undefined;
    }
  } else if (typeof dateInput === 'string') {
    const parsedDate = parseISO(dateInput); // Handles YYYY-MM-DD and ISO strings
    if (isValid(parsedDate)) {
      date = parsedDate;
    } else {
      const parts = dateInput.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (parts) {
        let day, month, year;
        const part1 = parseInt(parts[1], 10);
        const part2 = parseInt(parts[2], 10);
        const part3 = parseInt(parts[3], 10);

        if (part3 > 1900) { // YYYY format for year
            year = part3;
            // Ambiguity: DD/MM/YYYY vs MM/DD/YYYY. Assume DD/MM by default.
            // If part1 > 12, it's likely day. If part2 > 12, then part1 must be month.
            if (part1 > 12) { // DD/MM/YYYY
                day = part1; month = part2;
            } else if (part2 > 12) { // MM/DD/YYYY (part1 is month, part2 is day)
                 month = part1; day = part2;
            } else { // Ambiguous e.g. 01/02/YYYY, assume DD/MM
                 day = part1; month = part2;
            }
        } else { // YY format for year, assume 20YY
            year = part3 + 2000;
             if (part1 > 12) { // DD/MM/YY
                day = part1; month = part2;
            } else if (part2 > 12) { // MM/DD/YY
                 month = part1; day = part2;
            } else { // Ambiguous e.g. 01/02/YY, assume DD/MM
                 day = part1; month = part2;
            }
        }
        if (year && month && day) {
            date = new Date(Date.UTC(year, month - 1, day));
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
  const year = date.getUTCFullYear();
  const monthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dayStr = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
};


// Mapping for "Vigencia" field from Excel to PanelStatus
const vigenciaStatusMapping: { [key: string]: PanelStatus } = {
  'ok': 'installed',
  'en rev.': 'maintenance',
  'mantenimiento': 'maintenance',
  'desinstalado': 'removed',
  'pendiente': 'pending_installation',
};

// Extended status mapping for event import (flexible input)
const eventStatusValueMapping: { [key: string]: PanelStatus } = {
  'instalado': 'installed',
  'eliminado': 'removed',
  'mantenimiento': 'maintenance',
  'pendiente instalacion': 'pending_installation',
  'pendiente eliminación': 'pending_removal',
  'desconocido': 'unknown',
  // Add more variations if needed
  ...vigenciaStatusMapping // Include vigencia mappings for flexibility
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
            if (isNaN(dateA) || isNaN(dateB)) return 0; // Handle invalid dates gracefully
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
        newLastStatusUpdate = panelToUpdate.lastStatusUpdate || undefined; // Can be undefined if no other date source
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
    const initialPanelsData = MOCK_PANELS.map(p => ({ ...p }));
    const initialEventsData = MOCK_PANEL_EVENTS.map(e => ({ ...e, id: e.id || crypto.randomUUID() }));
    const todayStr = format(new Date(), 'yyyy-MM-dd');

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
      let currentLastStatusUpdate = panel.lastStatusUpdate || (panel.installationDate && isValidDateString(panel.installationDate) ? panel.installationDate : undefined);
      
      if (relevantEvents.length > 0) {
        currentStatus = relevantEvents[0].newStatus;
        currentLastStatusUpdate = relevantEvents[0].date;
      } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
        if (currentStatus === 'pending_installation' && parseISO(panel.installationDate) <= parseISO(todayStr)) {
          currentStatus = 'installed';
        }
      }
      return { ...panel, status: currentStatus, lastStatusUpdate: currentLastStatusUpdate };
    }).sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));

    setPanels(panelsWithInitialStatus);
    setPanelEvents(initialEventsData);
  }, [refreshPanelStatus]);


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
    
    let latestEvents: PanelEvent[];
    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      latestEvents = updatedEvents.filter(e => e.panelId === newEventWithId.panelId);
      return updatedEvents;
    });
    
    // @ts-ignore latestEvents will be assigned
    if (latestEvents) {
        refreshPanelStatus(newEventWithId.panelId, latestEvents);
    }

    return { success: true, message: `Evento para ${newEventWithId.panelId} añadido.` };
  }, [refreshPanelStatus]); 
  
  const updatePanelEvent = useCallback(async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId: string | undefined;
    let originalPanelIdForRefresh: string | undefined;
    let eventExists = false;

    setPanelEvents(prevEvents => {
      const eventIndex = prevEvents.findIndex(e => e.id === eventId);
      if (eventIndex === -1) return prevEvents;
      eventExists = true;

      const updatedEvents = [...prevEvents];
      const originalEvent = updatedEvents[eventIndex];
      originalPanelIdForRefresh = originalEvent.panelId; 
      affectedPanelId = updates.panelId || originalEvent.panelId; 
      updatedEvents[eventIndex] = { ...originalEvent, ...updates };
      return updatedEvents;
    });
    
    if (!eventExists) return { success: false, message: `Evento con ID ${eventId} no encontrado.`};

    const latestEventsList = panelEvents.map(e => e.id === eventId ? {...e, ...updates} : e);

    if (originalPanelIdForRefresh && originalPanelIdForRefresh !== affectedPanelId) {
      const eventsForOldPanel = latestEventsList.filter(e => e.panelId === originalPanelIdForRefresh);
      refreshPanelStatus(originalPanelIdForRefresh, eventsForOldPanel);
    }
    if (affectedPanelId) {
      const eventsForAffectedPanel = latestEventsList.filter(e => e.panelId === affectedPanelId);
      refreshPanelStatus(affectedPanelId, eventsForAffectedPanel);
    }
    return { success: true, message: `Evento ${eventId} actualizado.` };
  }, [panelEvents, refreshPanelStatus]);


  const importInitialData = useCallback(async (jsonData: any[], fileType: 'initial' | 'monthly'): Promise<DataOperationResult> => {
    const errors: string[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    
    const initialFilteredData = jsonData.filter(row => 
        Object.values(row).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );
    const processedCount = initialFilteredData.length;

    if (processedCount === 0 && fileType === 'initial') {
         return {
            success: false,
            message: "No se encontraron datos procesables en el archivo. Verifique que las cabeceras estén en la fila 5 y los datos en la fila 6.",
            errors: ["No se encontraron datos para importar."],
            processedCount: jsonData.length, addedCount, skippedCount
         }
    } else if (processedCount === 0 && fileType === 'monthly') {
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

        if (processedCount > 0) {
            const firstRowKeys = Object.keys(initialFilteredData[0]);
            const requiredHeaders = ['Código parada', 'Municipio Marquesina', 'Vigencia'];
            const missingHeaders = requiredHeaders.filter(h => !firstRowKeys.includes(h));

            if (missingHeaders.length > 0) {
                return {
                    success: false,
                    message: `Error: Faltan cabeceras requeridas en la fila 5: ${missingHeaders.join(', ')}.`,
                    errors: [`Cabeceras faltantes: ${missingHeaders.join(', ')}`],
                    processedCount: jsonData.length, addedCount, skippedCount
                };
            }
        }
        

        initialFilteredData.forEach((row, index) => {
          const rowIndexForError = index + 6; // Data starts at row 6 (after 4 ignored rows + 1 header row)
    
          const codigo_parada_raw = row['Código parada'];
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";
    
          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'Código parada' es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return;
          }
    
          if (currentPanelIds.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe o está duplicado en este archivo. Omitido.`);
            skippedCount++;
            return;
          }
    
          const municipio_raw = row['Municipio Marquesina'];
          const municipio = (municipio_raw !== undefined && municipio_raw !== null && String(municipio_raw).trim() !== "") ? String(municipio_raw).trim() : "Sin especificar";
    
          const vigencia_raw = row['Vigencia'];
          const vigencia_cleaned = (vigencia_raw !== undefined && vigencia_raw !== null) ? String(vigencia_raw).trim().toLowerCase() : "";
          const panelStatus = vigenciaStatusMapping[vigencia_cleaned] || 'pending_installation';
    
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


          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            municipality: municipio,
            status: panelStatus,
            client: cliente,
            address: direccion,
            notes: notas,
            installationDate: installationDate,
            lastStatusUpdate: installationDate || format(new Date(), 'yyyy-MM-dd'),
            
            codigo_marquesina: codigo_marquesina,
            tipo_piv: tipo_piv,
            industrial: industrial,
            funcionamiento: funcionamiento,
            diagnostico: diagnostico,
            tecnico: tecnico,
    
            fecha_importacion: new Date().toISOString(),
            importado_por: "currentUser", 
          };
    
          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          addedCount++;
        });
    
        if (newPanelsToImport.length > 0) {
          setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
        }
    } else { // Monthly Events
        const newEventsToImport: PanelEvent[] = [];
        const currentPanelIds = new Set(panels.map(p => p.codigo_parada));
        const headerMapping: { [key: string]: keyof PanelEvent | string } = {
            'panelid': 'panelId',
            'fecha': 'date',
            'estado anterior': 'oldStatus',
            'estado nuevo': 'newStatus',
            'notas evento': 'notes',
        };
        const normalizeHeader = (header: string) => header.toLowerCase().trim();

        initialFilteredData.forEach((row, index) => {
            const rowIndexForError = index + 2; // Assuming headers in row 1 for this generic event import
            
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
                    panelEvent[eventKey] = convertToYYYYMMDD(row[excelHeader]);
                 } else if (eventKey === 'newStatus' || eventKey === 'oldStatus') {
                    const statusVal = String(row[excelHeader] || '').trim().toLowerCase();
                    panelEvent[eventKey] = eventStatusValueMapping[statusVal] || (eventKey === 'newStatus' ? 'unknown' : undefined);
                 } else {
                    panelEvent[eventKey] = String(row[excelHeader] || '').trim();
                 }
              }
            }

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
            
            const validationErrors: string[] = [];
            if (!panelEvent.date) {
                validationErrors.push(`fecha '${row['fecha'] || ''}' inválida o ausente. Usar formato YYYY-MM-DD o fecha Excel.`);
            }
            if (!panelEvent.newStatus || !ALL_PANEL_STATUSES.includes(panelEvent.newStatus)) {
                validationErrors.push(`estado nuevo '${row['estado nuevo'] || ''}' inválido. Valores: ${ALL_PANEL_STATUSES.join(', ')}.`);
            }
            if (panelEvent.oldStatus && !ALL_PANEL_STATUSES.includes(panelEvent.oldStatus)) {
                validationErrors.push(`estado anterior '${row['estado anterior'] || ''}' inválido.`);
            }
            
            if (validationErrors.length > 0) {
                errors.push(`Fila ${rowIndexForError} (Panel ${panelIdFromRow}): ${validationErrors.join('; ')}`);
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
                errors.push(`Fila ${rowIndexForError} (Panel ${panelIdFromRow}): Evento duplicado omitido.`);
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
            const latestEventsList = [...panelEvents, ...newEventsToImport]; // Important: use the most current list
            panelIdsToUpdateFromEvents.forEach(pid => {
                const eventsForThisPanel = latestEventsList.filter(e => e.panelId === pid);
                refreshPanelStatus(pid, eventsForThisPanel);
            });
        }
    }
    
    const opSuccess = addedCount > 0; 
    let opMessage = `Registros procesados: ${processedCount}. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`;
    if (errors.length > 0) {
        opMessage += ` Errores: ${errors.length}.`;
    } else if (addedCount > 0) {
        opMessage += fileType === 'initial' ? ' Importación de paneles completada.' : ' Importación de eventos completada.';
    } else if (processedCount === 0 && fileType === 'initial') {
        opMessage = 'No se encontraron paneles válidos para importar.';
    } else if (processedCount === 0 && fileType === 'monthly') {
        opMessage = 'No se encontraron eventos válidos para importar.';
    }


    return { 
        success: opSuccess, 
        message: opMessage,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error messages
        addedCount,
        skippedCount,
        processedCount: jsonData.length // Report original count from file
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
  }, [panels.length, panelEvents.length]);


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

    