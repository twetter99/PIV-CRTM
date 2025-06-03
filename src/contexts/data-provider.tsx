
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
  importInitialData: (data: Partial<Panel>[]) => Promise<DataOperationResult>;
  importMonthlyEvents: (data: Partial<PanelEvent>[]) => Promise<DataOperationResult>;
  deletePanel: (panelId: string) => Promise<DataOperationResult>;
  deletePanelEvent: (eventId: string) => Promise<DataOperationResult>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false; 
  const date = parseISO(dateStr);
  return isValid(date) && format(date, 'yyyy-MM-dd') === dateStr;
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
        .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()); // Sort descending

      let newStatus = panelToUpdate.status;
      let newLastStatusUpdate = panelToUpdate.lastStatusUpdate;

      if (sortedEvents.length > 0) {
        newStatus = sortedEvents[0].newStatus;
        newLastStatusUpdate = sortedEvents[0].date;
      } else if (panelToUpdate.installationDate) {
        newStatus = panelToUpdate.status; // Use the status from import/creation
        newLastStatusUpdate = panelToUpdate.installationDate;
        if (newStatus === 'pending_installation' && isValidDateString(panelToUpdate.installationDate) && parseISO(panelToUpdate.installationDate) <= new Date()) {
          newStatus = 'installed';
        }
      } else {
        newStatus = panelToUpdate.status || 'unknown';
        newLastStatusUpdate = panelToUpdate.lastStatusUpdate;
      }

      if (panelToUpdate.status !== newStatus || panelToUpdate.lastStatusUpdate !== newLastStatusUpdate) {
        const updatedPanels = [...prevPanels];
        updatedPanels[panelIndex] = { ...panelToUpdate, status: newStatus, lastStatusUpdate: newLastStatusUpdate };
        return updatedPanels;
      }
      return prevPanels;
    });
  }, []);

  useEffect(() => {
    const initialPanelsData = MOCK_PANELS.map(p => ({ ...p }));
    const initialEventsData = MOCK_PANEL_EVENTS.map(e => ({ ...e, id: e.id || crypto.randomUUID() }));

    const panelsWithInitialStatus = initialPanelsData.map(panel => {
      const relevantEvents = initialEventsData
        .filter(e => e.panelId === panel.codigo_parada)
        .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

      let currentStatus = panel.status;
      let currentLastStatusUpdate = panel.lastStatusUpdate || panel.installationDate;

      if (relevantEvents.length > 0) {
        currentStatus = relevantEvents[0].newStatus;
        currentLastStatusUpdate = relevantEvents[0].date;
      } else if (panel.installationDate) {
        // currentStatus already set from MOCK_PANELS
        // currentLastStatusUpdate already set
        if (currentStatus === 'pending_installation' && isValidDateString(panel.installationDate) && parseISO(panel.installationDate) <= new Date()) {
          currentStatus = 'installed';
        }
      }
      return { ...panel, status: currentStatus, lastStatusUpdate: currentLastStatusUpdate };
    });

    setPanels(panelsWithInitialStatus);
    setPanelEvents(initialEventsData);
  }, []);


  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const newPanel = { ...panel, lastStatusUpdate: panel.installationDate || panel.lastStatusUpdate || format(new Date(), 'yyyy-MM-dd') };
    setPanels(prev => [...prev, newPanel]);
    return { success: true, message: `Panel ${panel.codigo_parada} añadido.` };
  }, [panels]);

  const updatePanel = useCallback(async (panelId: string, updates: Partial<Panel>): Promise<DataOperationResult> => {
    let panelNeedsStatusRefresh = false;
    setPanels(prev => prev.map(p => {
      if (p.codigo_parada === panelId) {
        if (updates.status && p.status !== updates.status) {
            panelNeedsStatusRefresh = true; 
        }
        return { ...p, ...updates };
      }
      return p;
    }));
    // If status was part of the direct update, we might need to ensure event consistency or refresh.
    // For now, if status is updated directly, refreshPanelStatus might be called by the form logic if an event is also created.
    // Or, if only panel details (not status via event) are updated, this is enough.
    // if(panelNeedsStatusRefresh) {
    //    const currentEventsForPanel = panelEvents.filter(e => e.panelId === panelId);
    //    refreshPanelStatus(panelId, currentEventsForPanel);
    // }
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
      refreshPanelStatus(newEventWithId.panelId, eventsForThisPanel);
      return updatedEvents;
    });
    return { success: true, message: `Evento para ${newEventWithId.panelId} añadido.` };
  }, [refreshPanelStatus]);
  
  const updatePanelEvent = useCallback(async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId = "";
    setPanelEvents(prevEvents => {
      let originalPanelIdForRefresh: string | undefined;
      const updatedEvents = prevEvents.map(e => {
        if (e.id === eventId) {
          originalPanelIdForRefresh = e.panelId; // Store original panel ID
          affectedPanelId = updates.panelId || e.panelId; // Use new panelId if provided, else old one
          return { ...e, ...updates };
        }
        return e;
      });

      if (originalPanelIdForRefresh && originalPanelIdForRefresh !== affectedPanelId) {
         // Event moved panels, refresh old panel
        const eventsForOldPanel = updatedEvents.filter(e => e.panelId === originalPanelIdForRefresh);
        refreshPanelStatus(originalPanelIdForRefresh, eventsForOldPanel);
      }
      if (affectedPanelId) {
        const eventsForAffectedPanel = updatedEvents.filter(e => e.panelId === affectedPanelId);
        refreshPanelStatus(affectedPanelId, eventsForAffectedPanel);
      }
      return updatedEvents;
    });
    return { success: true, message: `Evento ${eventId} actualizado.` };
  }, [refreshPanelStatus]);

  const importInitialData = useCallback(async (data: Partial<Panel>[]): Promise<DataOperationResult> => {
    const errors: string[] = [];
    const newPanelsToImport: Panel[] = [];
    let addedCount = 0;
    let skippedCount = 0;

    data.forEach((item, index) => {
      const codigo_parada = String(item.codigo_parada || '').trim();
      if (!codigo_parada) {
        errors.push(`Fila ${index + 2}: codigo_parada es obligatorio.`);
        return;
      }
      if (panels.some(p => p.codigo_parada === codigo_parada) || newPanelsToImport.some(p => p.codigo_parada === codigo_parada) ) {
        errors.push(`Fila ${index + 2}: El panel con ID ${codigo_parada} ya existe o está duplicado en el archivo. Omitido.`);
        skippedCount++;
        return;
      }
      
      const validationErrors: string[] = [];
      if (!item.municipality) validationErrors.push(`municipio es obligatorio.`);
      if (!item.client) validationErrors.push(`cliente es obligatorio.`);
      if (!item.address) validationErrors.push(`address es obligatorio.`);
      if (!item.status || !ALL_PANEL_STATUSES.includes(item.status)) {
        validationErrors.push(`estado '${item.status}' inválido. Valores permitidos: ${ALL_PANEL_STATUSES.join(', ')}.`);
      }
      if (item.installationDate && !isValidDateString(item.installationDate)) {
        validationErrors.push(`fecha instalacion '${item.installationDate}' inválida. Usar formato YYYY-MM-DD.`);
      }
      if (item.latitude && isNaN(Number(item.latitude))) validationErrors.push(`latitud inválida.`);
      if (item.longitude && isNaN(Number(item.longitude))) validationErrors.push(`longitud inválida.`);

      if (validationErrors.length > 0) {
        errors.push(`Fila ${index + 2} (ID: ${codigo_parada}): ${validationErrors.join('; ')}`);
        return;
      }

      newPanelsToImport.push({
          codigo_parada: codigo_parada,
          municipality: String(item.municipality),
          client: String(item.client),
          address: String(item.address),
          status: item.status as PanelStatus,
          installationDate: item.installationDate ? String(item.installationDate) : undefined,
          latitude: item.latitude ? Number(item.latitude) : undefined,
          longitude: item.longitude ? Number(item.longitude) : undefined,
          notes: item.notes ? String(item.notes) : undefined,
          lastStatusUpdate: item.installationDate || format(new Date(), 'yyyy-MM-dd'),
      });
      addedCount++;
    });

    if (newPanelsToImport.length > 0) {
      setPanels(prev => [...prev, ...newPanelsToImport]);
      // No need to call refreshPanelStatus here as their status is set directly from import.
      // If events are imported later, those will trigger refreshPanelStatus.
    }
    
    const message = `Importación de paneles: ${addedCount} añadidos, ${skippedCount} omitidos. ${errors.length > 0 ? `${errors.length} errores.` : 'Completada con éxito.'}`;
    return { 
        success: errors.length === 0 && addedCount > 0, 
        message,
        errors, 
        addedCount,
        skippedCount 
    };
  }, [panels]);

  const importMonthlyEvents = useCallback(async (data: Partial<PanelEvent>[]): Promise<DataOperationResult> => {
    const errors: string[] = [];
    const newEventsToImport: PanelEvent[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    
    const currentPanelIds = new Set(panels.map(p => p.codigo_parada));

    data.forEach((item, index) => {
      const panelId = String(item.panelId || '').trim();
      if (!panelId) {
        errors.push(`Fila ${index + 2}: panelId es obligatorio.`);
        return;
      }
      if (!currentPanelIds.has(panelId)) {
        errors.push(`Fila ${index + 2}: Panel con ID ${panelId} no encontrado. Omitido.`);
        skippedCount++;
        return;
      }
      
      const validationErrors: string[] = [];
      if (!item.date || !isValidDateString(item.date)) {
        validationErrors.push(`fecha '${item.date}' inválida o ausente. Usar formato YYYY-MM-DD.`);
      }
      if (!item.newStatus || !ALL_PANEL_STATUSES.includes(item.newStatus)) {
        validationErrors.push(`estado nuevo '${item.newStatus}' inválido. Valores: ${ALL_PANEL_STATUSES.join(', ')}.`);
      }
      if (item.oldStatus && !ALL_PANEL_STATUSES.includes(item.oldStatus)) {
        validationErrors.push(`estado anterior '${item.oldStatus}' inválido.`);
      }
      
      if (validationErrors.length > 0) {
         errors.push(`Fila ${index + 2} (Panel ${panelId}): ${validationErrors.join('; ')}`);
         return;
      }

      const isDuplicate = panelEvents.some(existingEvent => 
        existingEvent.panelId === panelId &&
        existingEvent.date === item.date &&
        (existingEvent.oldStatus || undefined) === (item.oldStatus || undefined) &&
        existingEvent.newStatus === item.newStatus
      ) || newEventsToImport.some(newEvent => // Also check against newly staged events
        newEvent.panelId === panelId &&
        newEvent.date === item.date &&
        (newEvent.oldStatus || undefined) === (item.oldStatus || undefined) &&
        newEvent.newStatus === item.newStatus
      );


      if(isDuplicate){
        errors.push(`Fila ${index + 2} (Panel ${panelId}): Evento duplicado omitido.`);
        skippedCount++;
        return;
      }

      newEventsToImport.push({
        id: crypto.randomUUID(),
        panelId: panelId,
        date: String(item.date),
        oldStatus: item.oldStatus as PanelStatus | undefined,
        newStatus: item.newStatus as PanelStatus,
        notes: item.notes ? String(item.notes) : undefined,
      });
      addedCount++;
    });
    
    if (newEventsToImport.length > 0) {
      setPanelEvents(prevEvents => {
        const updatedEvents = [...prevEvents, ...newEventsToImport];
        const panelIdsToUpdate = new Set(newEventsToImport.map(e => e.panelId));
        panelIdsToUpdate.forEach(pid => {
          const eventsForThisPanel = updatedEvents.filter(e => e.panelId === pid);
          refreshPanelStatus(pid, eventsForThisPanel);
        });
        return updatedEvents;
      });
    }

    const message = `Importación de eventos: ${addedCount} añadidos, ${skippedCount} omitidos. ${errors.length > 0 ? `${errors.length} errores.` : 'Completada con éxito.'}`;
    return { 
        success: errors.length === 0 && addedCount > 0, 
        message, 
        errors,
        addedCount,
        skippedCount
    };
  }, [panels, panelEvents, refreshPanelStatus]);
  
  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    // Actual deletion logic would go here if this wasn't a placeholder
    // For now, simulate by filtering out the panel and its events
    // setPanels(prev => prev.filter(p => p.codigo_parada !== panelId));
    // setPanelEvents(prev => prev.filter(e => e.panelId !== panelId));
    // return { success: true, message: `Panel ${panelId} y sus eventos eliminados (simulado).` };
    console.warn(`Delete operation for panel ${panelId} is not fully implemented.`);
    return { success: false, message: "Función de eliminación no implementada." }; 
  }, []);

  const deletePanelEvent = useCallback(async (eventId: string): Promise<DataOperationResult> => {
    let affectedPanelId: string | undefined;
    // setPanelEvents(prevEvents => {
    //   const eventToDelete = prevEvents.find(e => e.id === eventId);
    //   affectedPanelId = eventToDelete?.panelId;
    //   const updatedEvents = prevEvents.filter(e => e.id !== eventId);
      
    //   if (affectedPanelId) {
    //     const eventsForAffectedPanel = updatedEvents.filter(e => e.panelId === affectedPanelId);
    //     refreshPanelStatus(affectedPanelId, eventsForAffectedPanel);
    //   }
    //   return updatedEvents;
    // });
    // return { success: true, message: `Evento ${eventId} eliminado (simulado).` };
    console.warn(`Delete operation for event ${eventId} is not fully implemented.`);
    return { success: false, message: "Función de eliminación no implementada." };
  }, [refreshPanelStatus]);


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

