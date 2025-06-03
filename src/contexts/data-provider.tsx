"use client";

import type { Panel, PanelEvent } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { MOCK_PANELS, MOCK_PANEL_EVENTS } from '@/lib/mock-data';

interface DataContextType {
  panels: Panel[];
  panelEvents: PanelEvent[];
  addPanel: (panel: Panel) => Promise<{ success: boolean; message?: string }>;
  updatePanel: (panelId: string, updates: Partial<Panel>) => Promise<{ success: boolean; message?: string }>;
  getPanelById: (panelId: string) => Panel | undefined;
  getEventsForPanel: (panelId: string) => PanelEvent[];
  addPanelEvent: (event: PanelEvent) => Promise<{ success: boolean; message?: string }>;
  updatePanelEvent: (eventId: string, updates: Partial<PanelEvent>) => Promise<{ success: boolean; message?: string }>;
  importInitialData: (data: Panel[]) => Promise<{ success: boolean; errors: string[] }>;
  importMonthlyEvents: (data: PanelEvent[]) => Promise<{ success: boolean; errors: string[] }>;
  deletePanel?: (panelId: string) => Promise<{ success: boolean; message?: string }>; // Optional deletePanel for completeness
  deletePanelEvent?: (eventId: string) => Promise<{ success: boolean; message?: string }>; // Optional deletePanelEvent
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelEvents, setPanelEvents] = useState<PanelEvent[]>([]);

  const refreshPanelStatus = useCallback((panelId: string, currentEvents: PanelEvent[]) => {
    const relevantEvents = currentEvents
      .filter(e => e.panelId === panelId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (relevantEvents.length > 0) {
      const latestEvent = relevantEvents[0];
      setPanels(prevPanels => 
        prevPanels.map(p => 
          p.codigo_parada === panelId 
            ? { ...p, status: latestEvent.newStatus, lastStatusUpdate: latestEvent.date } 
            : p
        )
      );
    } else {
      const panel = MOCK_PANELS.find(p=>p.codigo_parada === panelId);
      if (panel && panel.installationDate && !panel.lastStatusUpdate) {
        setPanels(prevPanels => 
          prevPanels.map(p => 
            p.codigo_parada === panelId 
              ? { ...p, status: panel.status, lastStatusUpdate: panel.installationDate } 
              : p
          )
        );
      }
    }
  }, []);


  useEffect(() => {
    const initialPanels = MOCK_PANELS.map(p => ({...p}));
    const initialEvents = MOCK_PANEL_EVENTS.map(e => ({ ...e, id: e.id || crypto.randomUUID() }));
    
    setPanels(initialPanels);
    setPanelEvents(initialEvents);

    initialPanels.forEach(panel => {
      refreshPanelStatus(panel.codigo_parada, initialEvents);
    });
  }, [refreshPanelStatus]);


  const addPanel = async (panel: Panel) => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const newPanel = {...panel, lastStatusUpdate: panel.installationDate || new Date().toISOString().split('T')[0]};
    setPanels(prev => [...prev, newPanel]);
    return { success: true };
  };

  const updatePanel = async (panelId: string, updates: Partial<Panel>) => {
    setPanels(prev => prev.map(p => p.codigo_parada === panelId ? { ...p, ...updates } : p));
    return { success: true };
  };

  const getPanelById = (panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
  };

  const getEventsForPanel = (panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const addPanelEvent = async (event: PanelEvent) => {
    const newEventWithId = { ...event, id: event.id || crypto.randomUUID() };
    let newEventsList: PanelEvent[] = [];
    setPanelEvents(prev => {
      newEventsList = [...prev, newEventWithId];
      return newEventsList;
    });
    refreshPanelStatus(newEventWithId.panelId, newEventsList);
    return { success: true };
  };
  
  const updatePanelEvent = async (eventId: string, updates: Partial<PanelEvent>) => {
    let affectedPanelId = "";
    let newEventsList: PanelEvent[] = [];
    setPanelEvents(prev => {
      newEventsList = prev.map(e => {
        if (e.id === eventId) {
          affectedPanelId = e.panelId;
          if(updates.panelId && updates.panelId !== e.panelId) {
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
    return { success: true };
  };

  const importInitialData = async (data: Panel[]): Promise<{ success: boolean; errors: string[] }> => {
    const errors: string[] = [];
    const newPanels: Panel[] = [];
    data.forEach(panel => {
      if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
        errors.push(`ID de panel duplicado: ${panel.codigo_parada}`);
      } else {
        newPanels.push({...panel, lastStatusUpdate: panel.installationDate || new Date().toISOString().split('T')[0]});
      }
    });

    if (errors.length === 0) {
      let currentPanels: Panel[] = [];
      setPanels(prev => {
        currentPanels = [...prev, ...newPanels];
        return currentPanels;
      });
      newPanels.forEach(p => refreshPanelStatus(p.codigo_parada, panelEvents));
      return { success: true, errors: [] };
    }
    return { success: false, errors };
  };

  const importMonthlyEvents = async (data: PanelEvent[]): Promise<{ success: boolean; errors: string[] }> => {
    const newEventsWithIds = data.map(event => ({ ...event, id: event.id || crypto.randomUUID() }));
    
    let currentEvents: PanelEvent[] = [];
    setPanelEvents(prev => {
      currentEvents = [...prev, ...newEventsWithIds];
      return currentEvents;
    });
    
    const panelIdsToUpdate = new Set(newEventsWithIds.map(e => e.panelId));
    panelIdsToUpdate.forEach(panelId => {
      refreshPanelStatus(panelId, currentEvents);
    });
    return { success: true, errors: [] };
  };
  
  // Mock delete functions as they were referenced in components
  const deletePanel = async (panelId: string) => {
    // setPanels(prev => prev.filter(p => p.codigo_parada !== panelId));
    // setPanelEvents(prev => prev.filter(e => e.panelId !== panelId));
    // return { success: true };
    return { success: false, message: "Función de eliminación no implementada." }; // Placeholder
  };

  const deletePanelEvent = async (eventId: string) => {
    // setPanelEvents(prev => prev.filter(e => e.id !== eventId));
    // After deleting, potentially refresh the status of the affected panel
    // const event = panelEvents.find(e => e.id === eventId);
    // if (event) {
    //   refreshPanelStatus(event.panelId, panelEvents.filter(e => e.id !== eventId));
    // }
    // return { success: true };
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
