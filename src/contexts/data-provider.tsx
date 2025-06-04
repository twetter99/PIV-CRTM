
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { MOCK_PANELS, MOCK_PANEL_EVENTS } from '@/lib/mock-data';
import { format, parseISO, isValid } from 'date-fns';

interface DataOperationResult {
  success: boolean;
  message?: string;
  errors?: string[];
  addedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  processedCount?: number; // Total rows attempted from file
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
  importInitialData: (jsonData: any[]) => Promise<DataOperationResult>;
  importMonthlyEvents: (data: Partial<PanelEvent>[]) => Promise<DataOperationResult>;
  deletePanel: (panelId: string) => Promise<DataOperationResult>;
  deletePanelEvent: (eventId: string) => Promise<DataOperationResult>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string') return false;
  // Check for YYYY-MM-DD format more strictly, but allow parseISO to handle variations if possible.
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
     // console.warn(`Invalid date string format: ${dateStr}`);
  }
  const date = parseISO(dateStr);
  return isValid(date);
  // return isValid(date) && format(date, 'yyyy-MM-dd') === dateStr.substring(0,10); // Check if formatting back gives same date part
};

const convertToYYYYMMDD = (dateInput: any): string | undefined => {
  if (dateInput === null || dateInput === undefined || dateInput === "") {
    return undefined;
  }
  let date: Date;
  if (typeof dateInput === 'number') { 
    const utcDays = Math.floor(dateInput - 25569); // 25569 is days from 1900-01-00 to 1970-01-01
    const utcValue = utcDays * 86400000; // Milliseconds in a day
    date = new Date(utcValue);
     if (!isValid(date)) return undefined; // Check if conversion resulted in a valid date
  } else if (dateInput instanceof Date) {
    if (isValid(dateInput)) {
      date = dateInput;
    } else {
      return undefined;
    }
  } else if (typeof dateInput === 'string') {
    const parsedDate = parseISO(dateInput); 
    if (isValid(parsedDate)) {
      date = parsedDate;
    } else {
      // Attempt to parse DD/MM/YYYY or MM/DD/YYYY if parseISO fails
      const parts = dateInput.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (parts) {
        let day, month, year;
        // Assuming DD/MM/YYYY by default for ambiguous cases like 01/02/2023
        // This logic might need refinement based on expected string date formats
        if (parseInt(parts[3],10) > 1900) { // YYYY
            year = parseInt(parts[3],10);
            month = parseInt(parts[2],10);
            day = parseInt(parts[1],10);
        } else { // YY - assume 20YY
            year = parseInt(parts[3],10) + 2000;
            month = parseInt(parts[2],10);
            day = parseInt(parts[1],10);
        }
         // Check if day could be month (e.g. US format MM/DD/YY)
        if (month > 12 && day <= 12) { // Likely MM/DD/YYYY if first part > 12
            const temp = day;
            day = month;
            month = temp;
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
  // Format to YYYY-MM-DD using UTC dates to avoid timezone shifts
  const year = date.getUTCFullYear();
  const monthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dayStr = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
};


// Mapping for "Vigencia" field from Excel to PanelStatus
const vigenciaStatusMapping: Record<string, PanelStatus> = {
  'ok': 'installed',
  'en rev.': 'maintenance', // Assuming "En Rev." means maintenance
  'mantenimiento': 'maintenance',
  'desinstalado': 'removed',
  'pendiente': 'pending_installation',
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
            return dateB - dateA; // Sort descending by date
        });

      let newStatus = panelToUpdate.status;
      let newLastStatusUpdate = panelToUpdate.lastStatusUpdate;

      if (sortedEvents.length > 0) {
        newStatus = sortedEvents[0].newStatus;
        newLastStatusUpdate = sortedEvents[0].date;
      } else if (panelToUpdate.installationDate && isValidDateString(panelToUpdate.installationDate)) {
        newStatus = panelToUpdate.status; 
        newLastStatusUpdate = panelToUpdate.installationDate;
        if (newStatus === 'pending_installation' && parseISO(panelToUpdate.installationDate) <= new Date()) {
          newStatus = 'installed';
        }
      } else {
        newStatus = panelToUpdate.status || 'unknown';
        newLastStatusUpdate = panelToUpdate.lastStatusUpdate;
      }

      if (panelToUpdate.status !== newStatus || panelToUpdate.lastStatusUpdate !== newLastStatusUpdate) {
        const updatedPanels = [...prevPanels];
        updatedPanels[panelIndex] = { ...panelToUpdate, status: newStatus, lastStatusUpdate: newLastStatusUpdate };
        return updatedPanels.sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));
      }
      return prevPanels;
    });
  }, []); // Removed setPanels from dependencies as we use functional update

  useEffect(() => {
    const initialPanelsData = MOCK_PANELS.map(p => ({ ...p }));
    const initialEventsData = MOCK_PANEL_EVENTS.map(e => ({ ...e, id: e.id || crypto.randomUUID() }));

    const panelsWithInitialStatus = initialPanelsData.map(panel => {
      const relevantEvents = initialEventsData
        .filter(e => e.panelId === panel.codigo_parada)
        .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

      let currentStatus = panel.status;
      let currentLastStatusUpdate = panel.lastStatusUpdate || (panel.installationDate && isValidDateString(panel.installationDate) ? panel.installationDate : undefined);
      
      if (relevantEvents.length > 0) {
        currentStatus = relevantEvents[0].newStatus;
        currentLastStatusUpdate = relevantEvents[0].date;
      } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
        if (currentStatus === 'pending_installation' && parseISO(panel.installationDate) <= new Date()) {
          currentStatus = 'installed';
        }
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
    setPanels(prev => prev.map(p => {
      if (p.codigo_parada === panelId) {
        return { ...p, ...updates };
      }
      return p;
    }).sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
    // If status is updated directly on panel, events might become inconsistent.
    // Consider if direct status update should trigger event creation or be disallowed.
    const currentEventsForPanel = panelEvents.filter(e => e.panelId === panelId);
    refreshPanelStatus(panelId, currentEventsForPanel);
    return { success: true, message: `Panel ${panelId} actualizado.` };
  }, [panelEvents, refreshPanelStatus]);

  const getPanelById = useCallback((panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
  }, [panels]);

  const getEventsForPanel = useCallback((panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  }, [panelEvents]);
  
  const addPanelEvent = useCallback(async (event: Partial<PanelEvent>): Promise<DataOperationResult> => {
    if (!event.panelId) return { success: false, message: "Panel ID es obligatorio para el evento." };
    const newEventWithId = { ...event, id: event.id || crypto.randomUUID() } as PanelEvent;
    
    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      const eventsForThisPanel = updatedEvents.filter(e => e.panelId === newEventWithId.panelId);
      // refreshPanelStatus is called inside this setState's scope if needed,
      // but it uses setPanels, so call it after setPanelEvents is done.
      return updatedEvents;
    });
    // Call refreshPanelStatus after state update has been queued
    // Need to get the latest events for the panel after adding the new one
    const latestEvents = [...panelEvents, newEventWithId].filter(e => e.panelId === newEventWithId.panelId);
    refreshPanelStatus(newEventWithId.panelId, latestEvents);

    return { success: true, message: `Evento para ${newEventWithId.panelId} añadido.` };
  }, [panelEvents, refreshPanelStatus]); // Added panelEvents dependency
  
  const updatePanelEvent = useCallback(async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId = "";
    let originalPanelIdForRefresh: string | undefined;

    setPanelEvents(prevEvents => {
      const updatedEvents = prevEvents.map(e => {
        if (e.id === eventId) {
          originalPanelIdForRefresh = e.panelId; 
          affectedPanelId = updates.panelId || e.panelId; 
          return { ...e, ...updates };
        }
        return e;
      });
      return updatedEvents;
    });
    
    // Call refreshPanelStatus after state update has been queued
    // Need to get the latest events for the panel(s)
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
  }, [panelEvents, refreshPanelStatus]); // Added panelEvents dependency

  const importInitialData = useCallback(async (jsonData: any[]): Promise<DataOperationResult> => {
    const errors: string[] = [];
    const newPanelsToImport: Panel[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    const processedCount = jsonData.length;
    const importedPanelIdsInFile = new Set<string>();

    if (jsonData.length > 1000) {
      return {
        success: false,
        message: `Error: El archivo excede el límite de 1000 registros. Se encontraron ${jsonData.length} registros.`,
        errors: [`El archivo tiene ${jsonData.length} registros, el máximo permitido es 1000.`],
        processedCount, addedCount, skippedCount
      };
    }
    
    // Basic header check - Assumes row 5 was headers, jsonData objects have keys from it
    if (jsonData.length > 0) {
        const firstRowKeys = Object.keys(jsonData[0]);
        if (!firstRowKeys.includes('Código parada') || !firstRowKeys.includes('Municipio Marquesina') || !firstRowKeys.includes('Vigencia')) {
            return {
                success: false,
                message: "Error: El archivo no tiene el formato esperado. Verifique que las cabeceras ('Código parada', 'Municipio Marquesina', 'Vigencia', etc.) estén en la fila 5.",
                errors: ["Cabeceras no encontradas en la fila 5 o formato incorrecto."],
                processedCount, addedCount, skippedCount
            };
        }
    } else {
         return {
            success: false,
            message: "No se encontraron datos para importar en el archivo o el formato es incorrecto (cabeceras en fila 5, datos desde fila 6).",
            errors: ["No se encontraron datos procesables."],
            processedCount, addedCount, skippedCount
         }
    }


    jsonData.forEach((row, index) => {
      const rowIndexForError = index + 6; // Data starts at row 6

      const codigo_parada_raw = row['Código parada'];
      const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";

      if (!codigo_parada) {
        errors.push(`Fila ${rowIndexForError}: 'Código parada' es obligatorio y no puede estar vacío.`);
        skippedCount++;
        return;
      }

      if (panels.some(p => p.codigo_parada === codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
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

      const newPanel: Panel = {
        codigo_parada: codigo_parada,
        municipality: municipio,
        status: panelStatus,
        client: String(row['Empresas concesionarias'] || '').trim(),
        address: String(row['Direccion CCE (Clear Channel)'] || '').trim(),
        notes: String(row['Observaciones'] || '').trim(),
        installationDate: installationDate,
        lastStatusUpdate: installationDate || format(new Date(), 'yyyy-MM-dd'),
        
        codigo_marquesina: String(row['Código Marquesina'] || '').trim(),
        tipo_piv: String(row['Tipo PIV'] || '').trim(),
        industrial: String(row['Industrial'] || '').trim(),
        funcionamiento: String(row['Funcionamiento'] || '').trim(),
        diagnostico: String(row['Diagnóstico'] || '').trim(),
        tecnico: String(row['TÉCNICO'] || '').trim(),

        fecha_importacion: new Date().toISOString(),
        importado_por: "currentUser", // Placeholder
      };

      newPanelsToImport.push(newPanel);
      importedPanelIdsInFile.add(codigo_parada);
      addedCount++;
    });

    if (newPanelsToImport.length > 0) {
      setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
    }
    
    const opSuccess = errors.length === 0 && addedCount > 0;
    let opMessage = `Registros procesados: ${processedCount}. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`;
    if (errors.length > 0) {
        opMessage += ` Errores: ${errors.length}.`;
    } else if (addedCount > 0) {
        opMessage += ' Importación completada con éxito.';
    } else if (processedCount === 0) {
        opMessage = 'No se encontraron datos para importar.';
    }


    return { 
        success: opSuccess, 
        message: opMessage,
        errors: errors.length > 0 ? errors : undefined,
        addedCount,
        skippedCount,
        processedCount
    };
  }, [panels]); // Removed setPanels, using functional update if needed, but direct setPanels after loop is fine.


  const importMonthlyEvents = useCallback(async (data: Partial<PanelEvent>[]): Promise<DataOperationResult> => {
    const errors: string[] = [];
    const newEventsToImport: PanelEvent[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    const processedCount = data.length;
    
    const currentPanelIds = new Set(panels.map(p => p.codigo_parada));

    data.forEach((item, index) => {
      const rowIndexForError = index + 2; // Assuming headers in row 1 for this generic event import
      const panelId = String(item.panelId || '').trim();
      if (!panelId) {
        errors.push(`Fila ${rowIndexForError}: panelId es obligatorio.`);
        skippedCount++;
        return;
      }
      if (!currentPanelIds.has(panelId)) {
        errors.push(`Fila ${rowIndexForError}: Panel con ID ${panelId} no encontrado. Omitido.`);
        skippedCount++;
        return;
      }
      
      const validationErrors: string[] = [];
      const eventDate = convertToYYYYMMDD(item.date);
      if (!eventDate) {
        validationErrors.push(`fecha '${item.date}' inválida o ausente. Usar formato YYYY-MM-DD o fecha Excel.`);
      }
      if (!item.newStatus || !ALL_PANEL_STATUSES.includes(item.newStatus)) {
        validationErrors.push(`estado nuevo '${item.newStatus}' inválido. Valores: ${ALL_PANEL_STATUSES.join(', ')}.`);
      }
      if (item.oldStatus && !ALL_PANEL_STATUSES.includes(item.oldStatus)) {
        validationErrors.push(`estado anterior '${item.oldStatus}' inválido.`);
      }
      
      if (validationErrors.length > 0) {
         errors.push(`Fila ${rowIndexForError} (Panel ${panelId}): ${validationErrors.join('; ')}`);
         skippedCount++;
         return;
      }

      const isDuplicate = panelEvents.some(existingEvent => 
        existingEvent.panelId === panelId &&
        existingEvent.date === eventDate && // Use converted date
        (existingEvent.oldStatus || undefined) === (item.oldStatus || undefined) &&
        existingEvent.newStatus === item.newStatus
      ) || newEventsToImport.some(newEvent => 
        newEvent.panelId === panelId &&
        newEvent.date === eventDate &&
        (newEvent.oldStatus || undefined) === (item.oldStatus || undefined) &&
        newEvent.newStatus === item.newStatus
      );


      if(isDuplicate){
        errors.push(`Fila ${rowIndexForError} (Panel ${panelId}): Evento duplicado omitido.`);
        skippedCount++;
        return;
      }

      newEventsToImport.push({
        id: crypto.randomUUID(),
        panelId: panelId,
        date: eventDate!, // Not null due to earlier check
        oldStatus: item.oldStatus as PanelStatus | undefined,
        newStatus: item.newStatus as PanelStatus,
        notes: item.notes ? String(item.notes) : undefined,
      });
      addedCount++;
    });
    
    let panelIdsToUpdateFromEvents: Set<string> | null = null;

    if (newEventsToImport.length > 0) {
      panelIdsToUpdateFromEvents = new Set(newEventsToImport.map(e => e.panelId));
      setPanelEvents(prevEvents => {
        const updatedEvents = [...prevEvents, ...newEventsToImport];
        return updatedEvents;
      });
    }

    if (panelIdsToUpdateFromEvents) {
        const latestEventsList = [...panelEvents, ...newEventsToImport];
        panelIdsToUpdateFromEvents.forEach(pid => {
            const eventsForThisPanel = latestEventsList.filter(e => e.panelId === pid);
            refreshPanelStatus(pid, eventsForThisPanel);
        });
    }
    
    const opSuccess = errors.length === 0 && addedCount > 0;
    let opMessage = `Importación de eventos: ${addedCount} añadidos, ${skippedCount} omitidos de ${processedCount} procesados.`;
     if (errors.length > 0) {
        opMessage += ` Errores: ${errors.length}.`;
    } else if (addedCount > 0) {
        opMessage += ' Completada con éxito.';
    } else if (processedCount === 0) {
        opMessage = 'No se encontraron eventos para importar.';
    }

    return { 
        success: opSuccess, 
        message: opMessage, 
        errors: errors.length > 0 ? errors : undefined,
        addedCount,
        skippedCount,
        processedCount
    };
  }, [panels, panelEvents, refreshPanelStatus]); // Added panelEvents
  
  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    console.warn(`Delete operation for panel ${panelId} is not fully implemented.`);
    return { success: false, message: "Función de eliminación no implementada." }; 
  }, []);

  const deletePanelEvent = useCallback(async (eventId: string): Promise<DataOperationResult> => {
    console.warn(`Delete operation for event ${eventId} is not fully implemented.`);
    return { success: false, message: "Función de eliminación no implementada." };
  }, []);


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
        importMonthlyEvents,
        deletePanel,
        deletePanelEvent
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
