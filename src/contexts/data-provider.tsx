
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { MOCK_PANELS, MOCK_PANEL_EVENTS } from '@/lib/mock-data';
import { format, parseISO, isValid, isDate } from 'date-fns';

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
  addPanelEvent: (event: PanelEvent) => Promise<DataOperationResult>;
  updatePanelEvent: (eventId: string, updates: Partial<PanelEvent>) => Promise<DataOperationResult>;
  importInitialData: (data: Partial<Panel>[]) => Promise<DataOperationResult>;
  importMonthlyEvents: (data: Partial<PanelEvent>[]) => Promise<DataOperationResult>;
  deletePanel?: (panelId: string) => Promise<DataOperationResult>;
  deletePanelEvent?: (eventId: string) => Promise<DataOperationResult>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false; // Basic YYYY-MM-DD format check
  const date = parseISO(dateStr);
  return isValid(date) && format(date, 'yyyy-MM-dd') === dateStr;
};


export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelEvents, setPanelEvents] = useState<PanelEvent[]>([]);

  const refreshPanelStatus = useCallback((panelId: string, currentEvents: PanelEvent[]) => {
    const relevantEvents = currentEvents
      .filter(e => e.panelId === panelId)
      .sort((a, b) => {
        const dateA = parseISO(a.date).getTime();
        const dateB = parseISO(b.date).getTime();
        return dateB - dateA;
      });
    
    const panelToUpdate = panels.find(p => p.codigo_parada === panelId);

    if (relevantEvents.length > 0) {
      const latestEvent = relevantEvents[0];
      setPanels(prevPanels => 
        prevPanels.map(p => 
          p.codigo_parada === panelId 
            ? { ...p, status: latestEvent.newStatus, lastStatusUpdate: latestEvent.date } 
            : p
        )
      );
    } else if (panelToUpdate && panelToUpdate.installationDate) {
        // If no events, but has installation date, status should be based on initial status
        // or 'installed' if installation date is in the past.
        // This logic might need refinement based on how initial status is truly determined.
        const installDate = parseISO(panelToUpdate.installationDate);
        if (isValid(installDate) && installDate <= new Date()) {
             setPanels(prevPanels => 
                prevPanels.map(p => 
                p.codigo_parada === panelId 
                    ? { ...p, status: p.status || 'installed', lastStatusUpdate: p.installationDate } 
                    : p
                )
            );
        } else {
             setPanels(prevPanels => 
                prevPanels.map(p => 
                p.codigo_parada === panelId 
                    ? { ...p, status: p.status || 'pending_installation', lastStatusUpdate: p.installationDate } 
                    : p
                )
            );
        }
    }
  }, [panels]); // Added panels to dependency array


  useEffect(() => {
    const initialPanels = MOCK_PANELS.map(p => ({...p}));
    const initialEvents = MOCK_PANEL_EVENTS.map(e => ({ ...e, id: e.id || crypto.randomUUID() }));
    
    setPanels(initialPanels);
    setPanelEvents(initialEvents);

    initialPanels.forEach(panel => {
      // Need to pass the current events list that's being set
      refreshPanelStatus(panel.codigo_parada, initialEvents);
    });
  }, [refreshPanelStatus]); // Removed initialEvents from dependency array as it's defined inside


  const addPanel = async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const newPanel = {...panel, lastStatusUpdate: panel.installationDate || format(new Date(), 'yyyy-MM-dd')};
    setPanels(prev => [...prev, newPanel]);
    return { success: true, message: `Panel ${panel.codigo_parada} añadido.` };
  };

  const updatePanel = async (panelId: string, updates: Partial<Panel>): Promise<DataOperationResult> => {
    setPanels(prev => prev.map(p => p.codigo_parada === panelId ? { ...p, ...updates } : p));
    if (updates.status || updates.lastStatusUpdate) {
        // If status is directly updated, ensure it's consistent with events
        // This might be complex, for now, just update. A full sync might be needed.
        refreshPanelStatus(panelId, panelEvents);
    }
    return { success: true, message: `Panel ${panelId} actualizado.` };
  };

  const getPanelById = (panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
  };

  const getEventsForPanel = (panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  };

  const addPanelEvent = async (event: PanelEvent): Promise<DataOperationResult> => {
    const newEventWithId = { ...event, id: event.id || crypto.randomUUID() };
    let newEventsList: PanelEvent[] = [];
    setPanelEvents(prev => {
      newEventsList = [...prev, newEventWithId];
      return newEventsList;
    });
    refreshPanelStatus(newEventWithId.panelId, newEventsList);
    return { success: true, message: `Evento para ${event.panelId} añadido.` };
  };
  
  const updatePanelEvent = async (eventId: string, updates: Partial<PanelEvent>): Promise<DataOperationResult> => {
    let affectedPanelId = "";
    let newEventsList: PanelEvent[] = [];
    setPanelEvents(prev => {
      newEventsList = prev.map(e => {
        if (e.id === eventId) {
          affectedPanelId = e.panelId;
          if(updates.panelId && updates.panelId !== e.panelId) {
             // Potentially re-assigning event to a different panel, complex case.
             // For now, assume panelId is not changed or handle if it is.
             affectedPanelId = updates.panelId; 
          }
          return { ...e, ...updates };
        }
        return e;
      });
      return newEventsList;
    });
    if(affectedPanelId) {
      refreshPanelStatus(affectedPanelId, newEventsList);
    }
    return { success: true, message: `Evento ${eventId} actualizado.` };
  };

  const importInitialData = async (data: Partial<Panel>[]): Promise<DataOperationResult> => {
    const errors: string[] = [];
    const newPanels: Panel[] = [];
    let addedCount = 0;
    let skippedCount = 0;

    data.forEach((item, index) => {
      const codigo_parada = String(item.codigo_parada || '').trim();
      if (!codigo_parada) {
        errors.push(`Fila ${index + 2}: codigo_parada es obligatorio.`);
        return;
      }
      if (panels.some(p => p.codigo_parada === codigo_parada)) {
        errors.push(`Fila ${index + 2}: El panel con ID ${codigo_parada} ya existe. Omitido.`);
        skippedCount++;
        return;
      }
      if (!item.municipality) errors.push(`Fila ${index + 2} (${codigo_parada}): municipio es obligatorio.`);
      if (!item.client) errors.push(`Fila ${index + 2} (${codigo_parada}): cliente es obligatorio.`);
      if (!item.address) errors.push(`Fila ${index + 2} (${codigo_parada}): address es obligatorio.`);
      if (!item.status || !ALL_PANEL_STATUSES.includes(item.status)) {
        errors.push(`Fila ${index + 2} (${codigo_parada}): estado '${item.status}' inválido. Valores permitidos: ${ALL_PANEL_STATUSES.join(', ')}.`);
      }
      if (item.installationDate && !isValidDateString(item.installationDate)) {
        errors.push(`Fila ${index + 2} (${codigo_parada}): fecha instalacion '${item.installationDate}' inválida. Usar formato YYYY-MM-DD.`);
      }
      if (item.latitude && isNaN(Number(item.latitude))) errors.push(`Fila ${index + 2} (${codigo_parada}): latitud inválida.`);
      if (item.longitude && isNaN(Number(item.longitude))) errors.push(`Fila ${index + 2} (${codigo_parada}): longitud inválida.`);


      if (errors.length === 0) { // Only add if no errors for this specific item so far from this block
         const fullPanel: Panel = {
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
        };
        newPanels.push(fullPanel);
        addedCount++;
      }
    });

    if (newPanels.length > 0) {
      let currentPanelsList: Panel[] = [];
      setPanels(prev => {
        currentPanelsList = [...prev, ...newPanels];
        return currentPanelsList;
      });
      newPanels.forEach(p => refreshPanelStatus(p.codigo_parada, panelEvents)); // Use current panelEvents
    }
    
    if (errors.length > 0) {
      return { 
        success: newPanels.length > 0, // Success if at least some were added
        message: `Importación de paneles completada con ${errors.length} errores. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`,
        errors, 
        addedCount,
        skippedCount 
      };
    }

    return { 
        success: true, 
        message: `Importación de paneles exitosa. Paneles añadidos: ${addedCount}.`,
        addedCount
    };
  };

  const importMonthlyEvents = async (data: Partial<PanelEvent>[]): Promise<DataOperationResult> => {
    const errors: string[] = [];
    const newEvents: PanelEvent[] = [];
    let addedCount = 0;
    let skippedCount = 0;

    data.forEach((item, index) => {
      const panelId = String(item.panelId || '').trim();
      if (!panelId) {
        errors.push(`Fila ${index + 2}: panelId es obligatorio.`);
        return;
      }
      if (!panels.some(p => p.codigo_parada === panelId)) {
        errors.push(`Fila ${index + 2}: Panel con ID ${panelId} no encontrado. Omitido.`);
        skippedCount++;
        return;
      }
      if (!item.date || !isValidDateString(item.date)) {
        errors.push(`Fila ${index + 2} (Panel ${panelId}): fecha '${item.date}' inválida o ausente. Usar formato YYYY-MM-DD.`);
      }
      if (!item.newStatus || !ALL_PANEL_STATUSES.includes(item.newStatus)) {
        errors.push(`Fila ${index + 2} (Panel ${panelId}): estado nuevo '${item.newStatus}' inválido. Valores: ${ALL_PANEL_STATUSES.join(', ')}.`);
      }
      if (item.oldStatus && !ALL_PANEL_STATUSES.includes(item.oldStatus)) {
        errors.push(`Fila ${index + 2} (Panel ${panelId}): estado anterior '${item.oldStatus}' inválido.`);
      }
      
      // Check for exact duplicates before adding to prevent issues
      const isDuplicate = panelEvents.some(existingEvent => 
        existingEvent.panelId === panelId &&
        existingEvent.date === item.date &&
        existingEvent.oldStatus === (item.oldStatus || undefined) && // Ensure undefined matches if item.oldStatus is null/undefined
        existingEvent.newStatus === item.newStatus
      );

      if(isDuplicate){
        errors.push(`Fila ${index + 2} (Panel ${panelId}): Evento duplicado omitido.`);
        skippedCount++;
        return;
      }

      if (errors.length === 0) { // Only add if no errors for this specific item
        newEvents.push({
          id: crypto.randomUUID(),
          panelId: panelId,
          date: String(item.date),
          oldStatus: item.oldStatus as PanelStatus | undefined,
          newStatus: item.newStatus as PanelStatus,
          notes: item.notes ? String(item.notes) : undefined,
        });
        addedCount++;
      }
    });
    
    if (newEvents.length > 0) {
      let currentEventsList: PanelEvent[] = [];
      setPanelEvents(prev => {
        currentEventsList = [...prev, ...newEvents];
        return currentEventsList;
      });
      const panelIdsToUpdate = new Set(newEvents.map(e => e.panelId));
      panelIdsToUpdate.forEach(pid => refreshPanelStatus(pid, currentEventsList));
    }

    if (errors.length > 0) {
      return { 
        success: newEvents.length > 0, 
        message: `Importación de eventos completada con ${errors.length} errores. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`, 
        errors,
        addedCount,
        skippedCount
      };
    }

    return { 
        success: true, 
        message: `Importación de eventos exitosa. Eventos añadidos: ${addedCount}.`,
        addedCount 
    };
  };
  
  const deletePanel = async (panelId: string): Promise<DataOperationResult> => {
    // setPanels(prev => prev.filter(p => p.codigo_parada !== panelId));
    // setPanelEvents(prev => prev.filter(e => e.panelId !== panelId));
    // return { success: true, message: `Panel ${panelId} y sus eventos eliminados.` };
    return { success: false, message: "Función de eliminación no implementada." }; // Placeholder
  };

  const deletePanelEvent = async (eventId: string): Promise<DataOperationResult> => {
    // const eventToDelete = panelEvents.find(e => e.id === eventId);
    // setPanelEvents(prev => prev.filter(e => e.id !== eventId));
    // if (eventToDelete) {
    //   refreshPanelStatus(eventToDelete.panelId, panelEvents.filter(e => e.id !== eventId));
    // }
    // return { success: true, message: `Evento ${eventId} eliminado.` };
    return { success: false, message: "Función de eliminación no implementada." }; // Placeholder
  };


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

