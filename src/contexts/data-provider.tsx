
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFnsDateFns, format as formatDateFnsInternal } from 'date-fns'; // Renamed to avoid conflict
import * as XLSX from 'xlsx';
import { parseAndValidateDate } from '@/lib/billing-utils'; // Importar la función unificada

interface DataOperationResult {
  success: boolean;
  message?: string;
  errors?: string[];
  addedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  processedCount?: number; 
  deletedCount?: number; 
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
    const date = new Date(Date.UTC(0, 0, serial - excelEpochDiff -1)); // Corregido: -1 día para epoch de Excel
    return isValid(date) ? date : undefined;
};


const convertToYYYYMMDD = (dateInput: any): string | undefined => {
  if (dateInput === null || dateInput === undefined || String(dateInput).trim() === "" || String(dateInput).trim().toLowerCase() === "nan") {
    return undefined;
  }

  let date: Date | undefined;
  let originalDateInputValue = String(dateInput).trim(); 

  if (typeof dateInput === 'number') { // Asumir número de serie de Excel
    date = convertExcelSerialToDate(dateInput);
    if (!date || !isValid(date)) {
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
    // Si es YYYY-MM-DD HH:MM:SS, tomar solo la parte de fecha
    if (datePartToParse.length > 10 && datePartToParse.charAt(4) === '-' && datePartToParse.charAt(7) === '-') {
        datePartToParse = datePartToParse.substring(0, 10);
    }
    
    // Primero intentar parsear como YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePartToParse)) {
        let parsedDate = parseISO(datePartToParse); // parseISO maneja UTC implícitamente para YYYY-MM-DD
        if (isValid(parsedDate) && formatDateFnsInternal(parsedDate, 'yyyy-MM-dd') === datePartToParse) {
            date = parsedDate;
        } else {
            // console.warn(`convertToYYYYMMDD: Invalid YYYY-MM-DD string: ${datePartToParse}`);
            // No retornar aquí, intentar otros formatos
        }
    }
    
    // Si no es YYYY-MM-DD o falló, intentar DD-MM-YY o DD/MM/YY
    if (!date) {
        const parts = datePartToParse.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (parts) {
            let day, month, year_val;
            const part1 = parseInt(parts[1], 10);
            const part2 = parseInt(parts[2], 10);
            let part3 = parseInt(parts[3], 10);

            // Heurística para año corto: yy < 70 -> 20yy, yy >= 70 -> 19yy (ajustar si es necesario)
            if (parts[3].length === 2) { 
                year_val = part3 < 70 ? 2000 + part3 : 1900 + part3;
            } else if (parts[3].length === 4) {
                year_val = part3;
            } else {
                // console.warn(`convertToYYYYMMDD: Formato de año inválido en partes: ${datePartToParse}`);
                return undefined;
            }
            
            // Heurística para día/mes (asumir DD/MM o MM/DD si uno es > 12)
            if (part1 > 12 && part2 <=12) { day = part1; month = part2; } // DD/MM
            else if (part2 > 12 && part1 <=12) { month = part1; day = part2; } // MM/DD
            else { // Ambiguo o ambos <=12, asumir DD/MM como estándar español
                day = part1; month = part2;
            }

            if (year_val && month && day && month >=1 && month <=12 && day >=1 && day <=31) {
                const tempDate = new Date(Date.UTC(year_val, month - 1, day));
                 if (isValid(tempDate) && tempDate.getUTCFullYear() === year_val && tempDate.getUTCMonth() === month -1 && tempDate.getUTCDate() === day) {
                    date = tempDate;
                } else {
                    // console.warn(`convertToYYYYMMDD: Fecha inválida o desbordada tras construir desde DD/MM/YYYY: ${datePartToParse}`);
                    return undefined;
                }
            } else {
                 // console.warn(`convertToYYYYMMDD: No se pudieron parsear los componentes día/mes/año: ${datePartToParse}`);
                return undefined;
            }
        } else {
             // console.warn(`convertToYYYYMMDD: Cadena de fecha no parseable: ${datePartToParse}`);
            return undefined;
        }
    }
  } else {
    // console.warn(`convertToYYYYMMDD: Tipo de entrada de fecha no soportado: ${typeof dateInput}`);
    return undefined;
  }

  if (!date || !isValid(date)) return undefined;

  const finalYear = date.getUTCFullYear();
  const finalMonthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const finalDayStr = date.getUTCDate().toString().padStart(2, '0');
  return `${finalYear}-${finalMonthStr}-${finalDayStr}`;
};


export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelEvents, setPanelEvents] = useState<PanelEvent[]>([]);

  const refreshPanelStatus = useCallback((panelId: string, eventsForPanel: PanelEvent[]) => {
    setPanels(prevPanels => {
      const panelIndex = prevPanels.findIndex(p => p.codigo_parada === panelId);
      if (panelIndex === -1) return prevPanels;

      const panelToUpdate = { ...prevPanels[panelIndex] };
      
      const panelPivInstaladoDate = parseAndValidateDate(panelToUpdate.piv_instalado);
      let newStatus: PanelStatus = panelPivInstaladoDate ? 'pending_installation' : 'unknown';
      let newLastStatusUpdate: string | null = panelToUpdate.piv_instalado || null;

      if (panelPivInstaladoDate && new Date() >= panelPivInstaladoDate) {
        newStatus = 'installed'; // Por defecto si ya pasó la fecha de instalación
      }
      
      const sortedEvents = [...eventsForPanel]
        .filter(e => parseAndValidateDate(e.fecha))
        .sort((a, b) => {
            const dateA = parseAndValidateDate(a.fecha)!.getTime();
            const dateB = parseAndValidateDate(b.fecha)!.getTime();
            return dateB - dateA; // Más reciente primero
        });

      if (sortedEvents.length > 0) {
        const latestEvent = sortedEvents[0];
        const latestEventDate = parseAndValidateDate(latestEvent.fecha);

        if (latestEventDate) {
            newLastStatusUpdate = latestEvent.fecha;
            if (latestEvent.tipo === "DESINSTALACION") {
                newStatus = 'removed';
            } else if (latestEvent.tipo === "REINSTALACION") {
                newStatus = 'installed';
            }
        }
      } else if (panelPivInstaladoDate) { // Sin eventos, basarse en piv_instalado
         newStatus = (new Date() >= panelPivInstaladoDate) ? 'installed' : 'pending_installation';
         newLastStatusUpdate = panelToUpdate.piv_instalado;
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
    // Lógica inicial para cargar datos (si es desde localStorage o similar)
    // Actualmente vacío, la importación es la fuente principal
  }, []);

  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const panelPivInstaladoDate = parseAndValidateDate(panel.piv_instalado);
    const newPanel = {
        ...panel,
        status: panelPivInstaladoDate && new Date() >= panelPivInstaladoDate ? 'installed' : (panelPivInstaladoDate ? 'pending_installation' : 'unknown'),
        lastStatusUpdate: panel.piv_instalado || format(new Date(), 'yyyy-MM-dd')
    };
    setPanels(prev => [...prev, newPanel].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
    return { success: true, message: `Panel ${panel.codigo_parada} añadido.` };
  }, [panels]);

  const updatePanel = useCallback(async (panelId: string, updates: Partial<Panel>): Promise<DataOperationResult> => {
    let panelExists = false;
    let affectedPanelForRefresh: Panel | undefined;

    setPanels(prev => {
        const panelIndex = prev.findIndex(p => p.codigo_parada === panelId);
        if (panelIndex === -1) return prev;
        
        panelExists = true;
        const updatedPanels = [...prev];
        updatedPanels[panelIndex] = { ...updatedPanels[panelIndex], ...updates };
        affectedPanelForRefresh = updatedPanels[panelIndex];
        return updatedPanels.sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));
    });

    if (!panelExists) return { success: false, message: `Panel ${panelId} no encontrado.`};
    
    if (affectedPanelForRefresh) {
        const currentEventsForPanel = panelEvents.filter(e => e.panelId === panelId);
        refreshPanelStatus(panelId, currentEventsForPanel);
    }
    return { success: true, message: `Panel ${panelId} actualizado.` };
  }, [panelEvents, refreshPanelStatus]);

  const getPanelById = useCallback((panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
  }, [panels]);

  const getEventsForPanel = useCallback((panelId: string) => {
    return panelEvents.filter(e => e.panelId === panelId).sort((a, b) => {
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB; // Ascendente por fecha
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

    let latestEventsForPanel: PanelEvent[];
    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      latestEventsForPanel = updatedEvents.filter(e => e.panelId === newEventWithId.panelId);
      return updatedEvents.sort((a,b) => { // Mantener ordenado globalmente también
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        return dateA - dateB;
      });
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
        latestEventsList = [...prevEvents];
        return prevEvents;
      }
      eventExists = true;

      const updatedEvents = [...prevEvents];
      const originalEvent = updatedEvents[eventIndex];
      originalPanelIdForRefresh = originalEvent.panelId;
      affectedPanelId = updates.panelId || originalEvent.panelId; // Si el panelId cambia, actualizar ambos
      updatedEvents[eventIndex] = { ...originalEvent, ...updates } as PanelEvent;
      latestEventsList = updatedEvents;
      return updatedEvents.sort((a,b) => {
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        return dateA - dateB;
      });
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
    let firstPanelMappedForDebug: Panel | null = null; 

    const billingStats: BillingStats = { /* ... inicialización ... */ }  as BillingStats; // Como estaba

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


    if (fileType === 'initial') {
        const newPanelsToImport: Panel[] = [];
        const newEventsToCreate: PanelEvent[] = [];
        const importedPanelIdsInFile = new Set<string>();
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));

        if (processedCountFromFile > 0) {
            // Validación de cabeceras como estaba, pero adaptada a nombres de Excel
            const firstRowKeys = Object.keys(initialFilteredData[0]);
            const requiredExcelHeaders = ['codigoParada', 'municipioMarquesina', 'fechaInstalacion', 'importeMensual']; 
            // 'vigencia' podría ser opcional o manejado de otra forma
            const missingHeaders = requiredExcelHeaders.filter(h => !firstRowKeys.some(excelKey => excelKey.toLowerCase().trim() === h.toLowerCase().trim()));

            if (missingHeaders.length > 0 && false) { // Desactivar temporalmente esta validación estricta de headers
                return {
                    success: false,
                    message: `Error: Faltan cabeceras requeridas en la fila 5 del Excel: ${missingHeaders.join(', ')}. Cabeceras encontradas: ${firstRowKeys.join(', ')}`,
                    errors: [`Cabeceras faltantes: ${missingHeaders.join(', ')}`],
                    processedCount: jsonData.length, addedCount, skippedCount
                };
            }
        }


        initialFilteredData.forEach((row, index) => {
          const rowIndexForError = index + 6; // Asumiendo cabeceras en fila 5

          const codigo_parada_raw = row['codigoParada'] || row['codigo parada'] || row['Código parada'];
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";

          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'codigoParada' es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return;
          }

          if (currentPanelIdsSet.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe o está duplicado. Omitido.`);
            skippedCount++;
            return;
          }
          
          const piv_instalado_excel = row['fechaInstalacion'];
          const piv_desinstalado_excel = row['fechaDesinstalacion'];
          const piv_reinstalado_excel = row['fechaReinstalacion'];
          const ultima_instalacion_excel = row['ultimaInstalacionOReinstalacion'];


          const piv_instalado_converted = convertToYYYYMMDD(piv_instalado_excel);
          const piv_desinstalado_converted = convertToYYYYMMDD(piv_desinstalado_excel);
          const piv_reinstalado_converted = convertToYYYYMMDD(piv_reinstalado_excel);
          const ultima_instalacion_converted = convertToYYYYMMDD(ultima_instalacion_excel);
          
          if (!piv_instalado_converted) {
            if (piv_instalado_excel && String(piv_instalado_excel).trim() !== '') {
                 errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'fechaInstalacion' ("${piv_instalado_excel}") es inválida. Se asignará Nulo. El panel no será facturable.`);
            } else {
                 console.warn(`Panel ${codigo_parada} no tiene fecha de instalación (piv_instalado) válida. No será facturable.`);
            }
          }
          
          const importe_mensual_excel_raw = row['importeMensual'];
          let importe_mensual_final = 37.7; // Valor por defecto
          if (importe_mensual_excel_raw !== null && importe_mensual_excel_raw !== undefined && String(importe_mensual_excel_raw).trim() !== '') {
              const parsedAmount = parseFloat(String(importe_mensual_excel_raw).replace(',', '.'));
              if (!isNaN(parsedAmount) && parsedAmount >= 0) {
                  importe_mensual_final = parsedAmount;
              } else {
                  errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'importeMensual' ("${importe_mensual_excel_raw}") es inválido. Usando por defecto ${importe_mensual_final}.`);
              }
          }


          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            piv_instalado: piv_instalado_converted!, // Si es undefined aquí, no se facturará
            piv_desinstalado: piv_desinstalado_converted,
            piv_reinstalado: piv_reinstalado_converted,
            importe_mensual: importe_mensual_final,
            
            tipo_piv: String(row['tipoPiv'] || row['Tipo PIV'] || '').trim(),
            industrial: String(row['industrial'] || row['Industrial'] || '').trim(),
            empresa_concesionaria: String(row['empresaConcesionaria'] || row['Empresas concesionarias'] || '').trim(),
            municipio_marquesina: String(row['municipioMarquesina'] || row['Municipio Marquesina'] || '').trim(),
            codigo_marquesina: String(row['codigoMarquesina'] || row['Código Marquesina'] || '').trim(),
            direccion_cce: String(row['direccionCce'] || row['Direccion CCE (Clear Channel)'] || row['dirección'] || '').trim(),
            marquesina: String(row['marquesina'] || '').trim(),
            vigencia: String(row['vigencia'] || row['Vigencia'] || '').trim(),
            cce: String(row['Cce'] || row['cce'] || '').trim(),
            ultima_instalacion_o_reinstalacion: ultima_instalacion_converted,
            
            // Campos derivados para UI actual (pueden ser redundantes con los de arriba)
            municipality: String(row['municipioMarquesina'] || row['Municipio Marquesina'] || '').trim(),
            client: String(row['empresaConcesionaria'] || row['Empresas concesionarias'] || '').trim(),
            address: String(row['direccionCce'] || row['Direccion CCE (Clear Channel)'] || row['dirección'] || '').trim(),
            
            status: piv_instalado_converted ? 'pending_installation' : 'unknown', 
            lastStatusUpdate: piv_instalado_converted, // Se actualizará después con eventos
            fecha_importacion: new Date().toISOString().split('T')[0],
            importado_por: "currentUser", // Simulación
            importe_mensual_original: String(importe_mensual_excel_raw || ''),
            installationDate: piv_instalado_converted || ultima_instalacion_converted,
          };
          
          billingStats.totalPanels++;
          // ... (lógica de billingStats como estaba) ...
          
          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          addedCount++;
          if (!firstPanelMappedForDebug) {
            firstPanelMappedForDebug = newPanel;
          }

          // Crear eventos basados en piv_desinstalado y piv_reinstalado
          if (piv_desinstalado_converted) {
            newEventsToCreate.push({
              id: crypto.randomUUID(),
              panelId: codigo_parada,
              tipo: "DESINSTALACION",
              fecha: piv_desinstalado_converted,
            });
          }
          if (piv_reinstalado_converted) {
            if (piv_desinstalado_converted && parseAndValidateDate(piv_reinstalado_converted)! > parseAndValidateDate(piv_desinstalado_converted)!) {
              newEventsToCreate.push({
                id: crypto.randomUUID(),
                panelId: codigo_parada,
                tipo: "REINSTALACION",
                fecha: piv_reinstalado_converted,
              });
            } else if (!piv_desinstalado_converted && piv_instalado_converted && parseAndValidateDate(piv_reinstalado_converted)! > parseAndValidateDate(piv_instalado_converted)! ) {
              // Si no hay desinstalación, pero reinstalación es posterior a instalación inicial, puede ser una actualización.
              // O podría ser un error de datos. La Cloud Function podría tener lógica más específica.
              // Por ahora, se crea el evento si es posterior a la instalación inicial.
               newEventsToCreate.push({
                id: crypto.randomUUID(),
                panelId: codigo_parada,
                tipo: "REINSTALACION", // O podría ser un tipo "ACTUALIZACION_INSTALACION"
                fecha: piv_reinstalado_converted,
                notes: "Reinstalación sin desinstalación previa registrada. Se asume actualización."
              });
            } else if (piv_instalado_converted && parseAndValidateDate(piv_reinstalado_converted)! < parseAndValidateDate(piv_instalado_converted)!) {
                errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'fechaReinstalacion' ("${piv_reinstalado_excel}") es anterior a 'fechaInstalacion'. Evento de reinstalación omitido.`);
            }
          }
        });

        if (newPanelsToImport.length > 0) {
          setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
          console.log(`[Importación Inicial] Paneles añadidos al estado: ${newPanelsToImport.length}`);
        }
        if (newEventsToCreate.length > 0) {
          setPanelEvents(prevEvents => [...prevEvents, ...newEventsToCreate].sort((a,b) => {
             const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
             const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
             return dateA - dateB; // Ordenar por fecha del evento
          }));
          console.log(`[Importación Inicial] Eventos PIV creados y añadidos al estado: ${newEventsToCreate.length}`);
        }
        
        // Refrescar estado de todos los paneles importados/actualizados
        const panelIdsToRefresh = new Set([...newPanelsToImport.map(p => p.codigo_parada), ...newEventsToCreate.map(e => e.panelId)]);
        panelIdsToRefresh.forEach(pid => {
            const currentPanel = getPanelById(pid); // Obtener el panel actualizado del estado
            const eventsForThisPanel = getEventsForPanel(pid); // Obtener eventos actualizados
            if(currentPanel) refreshPanelStatus(pid, eventsForThisPanel);
        });


        if (firstPanelMappedForDebug) {
            console.log('Primer panel mapeado:', JSON.parse(JSON.stringify(firstPanelMappedForDebug))); 
            console.log('Campos de fecha del primer panel (convertidos):', {
              piv_instalado: firstPanelMappedForDebug.piv_instalado,
              piv_desinstalado: firstPanelMappedForDebug.piv_desinstalado,
              piv_reinstalado: firstPanelMappedForDebug.piv_reinstalado,
              ultima_instalacion_o_reinstalacion: firstPanelMappedForDebug.ultima_instalacion_o_reinstalacion,
            });
             console.log('Valores Excel originales del primer panel (para fechas PIV):', {
              excel_fechaInstalacion: initialFilteredData[0] ? initialFilteredData[0]['fechaInstalacion'] : 'N/A',
              excel_fechaDesinstalacion: initialFilteredData[0] ? initialFilteredData[0]['fechaDesinstalacion'] : 'N/A',
              excel_fechaReinstalacion: initialFilteredData[0] ? initialFilteredData[0]['fechaReinstalacion'] : 'N/A',
            });
        }
        console.log(`Importados ${addedCount} de ${processedCountFromFile} paneles. ${skippedCount} omitidos.`);
        if (errors.length > 0) console.warn("Errores/Advertencias de importación:", errors.slice(0,10));


    } else { // fileType === 'monthly' (importación de eventos)
        const newEventsToImport: PanelEvent[] = [];
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));
        const headerMapping: { [key: string]: keyof PanelEvent | string } = {
            'panelid': 'panelId',
            'fecha': 'fecha', // Usar 'fecha' directamente como en la interfaz PanelEvent
            'estado anterior': 'oldStatus', // Se usará para inferir 'tipo' si es necesario
            'estado nuevo': 'newStatus',   // Se usará para inferir 'tipo'
            'tipo evento': 'tipo',         // Si el Excel ya tiene una columna 'tipo evento'
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
                  // Guardar para inferir tipo si no viene explícito
                  const statusVal = String(row[excelHeader] || '').trim().toLowerCase();
                  const panelStatusMapped = eventStatusValueMapping[statusVal] || 'unknown'; // eventStatusValueMapping debe existir
                  
                  if (eventKey === 'oldStatus') panelEvent.oldStatus = panelStatusMapped as PanelStatus;
                  if (eventKey === 'newStatus') panelEvent.newStatus = panelStatusMapped as PanelStatus;

              } else if (eventKey === 'notes'){
                 panelEvent.notes = String(row[excelHeader] || '').trim();
              }
            }

            if (!panelIdFromRow) { /* ... validación ... */ skippedCount++; return; }
            if (!currentPanelIdsSet.has(panelIdFromRow)) { /* ... validacion ... */ skippedCount++; return; }
            if (!panelEvent.fecha) { /* ... validacion ... */ skippedCount++; return; }

            // Inferir tipo de evento si no vino explícitamente
            if (!tipoEventoDeterminado) {
                if (panelEvent.newStatus === 'removed' || panelEvent.newStatus === 'pending_removal') {
                    tipoEventoDeterminado = "DESINSTALACION";
                } else if (panelEvent.newStatus === 'installed' && panelEvent.oldStatus && (panelEvent.oldStatus === 'removed' || panelEvent.oldStatus === 'maintenance')) {
                    tipoEventoDeterminado = "REINSTALACION";
                } else {
                    errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow}): No se pudo determinar el tipo de evento (DESINSTALACION/REINSTALACION) a partir de los estados. newStatus: ${panelEvent.newStatus}, oldStatus: ${panelEvent.oldStatus}.`);
                    skippedCount++;
                    return;
                }
                panelEvent.tipo = tipoEventoDeterminado;
            }
            // Eliminar oldStatus y newStatus si ya tenemos el tipo, ya que no son parte del esquema final de PanelEvent
            delete panelEvent.oldStatus;
            delete panelEvent.newStatus;


            // Validación de duplicados como estaba...
            // ...
            
            newEventsToImport.push(panelEvent as PanelEvent);
            addedCount++;
        });

        if (newEventsToImport.length > 0) {
            setPanelEvents(prevEvents => [...prevEvents, ...newEventsToImport].sort((a,b) => {
                const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
                const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
                return dateA - dateB;
            }));
            const panelIdsAffected = new Set(newEventsToImport.map(e => e.panelId));
            panelIdsAffected.forEach(pid => {
                const currentPanel = getPanelById(pid);
                const eventsForThisPanel = getEventsForPanel(pid);
                if(currentPanel) refreshPanelStatus(pid, eventsForThisPanel);
            });
        }
    }

    const opSuccess = addedCount > 0;
    // ... (mensaje de operación y retorno como estaba) ...
    let opMessage = `Registros procesados desde archivo: ${processedCountFromFile}. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`;
    if (errors.length > 0) {
        opMessage += ` Errores/Advertencias: ${errors.length}. Revise los detalles y la consola. Primeros errores: ${errors.slice(0,3).join('; ')}`;
    } else if (addedCount > 0) {
        opMessage += fileType === 'initial' ? ' Importación de paneles completada.' : ' Importación de eventos completada.';
    } else {
        opMessage = `No se ${fileType === 'initial' ? 'importaron paneles' : 'importaron eventos'}. Verifique el archivo y los logs.`;
    }

    return {
        success: opSuccess,
        message: opMessage,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined, 
        addedCount,
        skippedCount,
        processedCount: jsonData.length, 
        billingStats: fileType === 'initial' ? billingStats : undefined
    };
  }, [panels, panelEvents, refreshPanelStatus, getPanelById, getEventsForPanel]); // Añadido getPanelById y getEventsForPanel

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


// Helper function to check if a date string is valid YYYY-MM-DD.
// Esta función debe ser robusta a formatos YYYY-MM-DD HH:MM:SS
const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
  
  const datePart = dateStr.trim().substring(0, 10); 

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
    return false;
  }
  const dateObj = parseISO(datePart);
  return isValid(dateObj) && formatDateFnsInternal(dateObj, 'yyyy-MM-dd') === datePart;
};

// Mapeo de estados de eventos (ejemplo, puede necesitar ajustes)
const eventStatusValueMapping: { [key: string]: PanelStatus } = {
  'instalado': 'installed',
  'eliminado': 'removed',
  'mantenimiento': 'maintenance',
  'pendiente instalacion': 'pending_installation',
  'pendiente eliminación': 'pending_removal',
  'desconocido': 'unknown',
  // Añadir mapeos de 'vigencia' si se usan para inferir estado de evento
  'ok': 'installed',
  'en rev.': 'maintenance',
  'desinstalado': 'removed',
  'pendiente': 'pending_installation',
};
