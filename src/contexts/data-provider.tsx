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
      // If no events, status might be based on installation date or initial import
      // For simplicity, if no events, we don't automatically change status here unless it's an initial load.
      // This part could be enhanced based on specific business rules for panels without events.
      const panel = MOCK_PANELS.find(p=>p.codigo_parada === panelId); // Check original mock if needed
      if (panel && panel.installationDate && !panel.lastStatusUpdate) { // Only if it's likely an initial state without events
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
      return { success: false, message: `Panel with code ${panel.codigo_parada} already exists.` };
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
          affectedPanelId = e.panelId; // original panelId
          if(updates.panelId && updates.panelId !== e.panelId) {
             // If panelId is changed, this logic might need to refresh old panelId too. For now, focus on new/current.
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
        errors.push(`Duplicate panel ID: ${panel.codigo_parada}`);
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
      // Assuming no events are imported with initial data, status is from panel record
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
        importMonthlyEvents 
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
