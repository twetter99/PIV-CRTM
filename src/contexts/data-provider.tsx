
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFnsDateFns, format as formatDateFnsInternal } from 'date-fns';
import * as XLSX from 'xlsx'; // Importar para XLSX.SSF.parse_date_code
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


const convertExcelSerialToDate = (serial: number): Date | undefined => {
  if (typeof serial !== 'number' || serial <= 0) return undefined;
  try {
    const excelDate = XLSX.SSF.parse_date_code(serial);
    if (excelDate && typeof excelDate.y === 'number' && typeof excelDate.m === 'number' && typeof excelDate.d === 'number') {
        // Asegurarse de que los componentes de tiempo sean válidos o por defecto a 0 si no están presentes
        const hours = typeof excelDate.H === 'number' ? excelDate.H : 0;
        const minutes = typeof excelDate.M === 'number' ? excelDate.M : 0;
        const seconds = typeof excelDate.S === 'number' ? excelDate.S : 0;
        const date = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d, hours, minutes, seconds));
        return isValid(date) ? date : undefined;
    }
  } catch (e) {
    console.error("Error converting Excel serial date:", serial, e);
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
      // console.warn(`convertToYYYYMMDD: Invalid Date object received:`, dateInput);
      return undefined;
    }
  } else if (typeof dateInput === 'number') { 
    date = convertExcelSerialToDate(dateInput);
    if (!date || !isValid(date)) {
      // console.warn(`convertToYYYYMMDD: Invalid date from Excel serial number: ${dateInput}`);
      return undefined;
    }
  } else if (typeof dateInput === 'string') {
    let datePartToParse = originalDateInputValue.length > 10 && (originalDateInputValue.includes(' ') || originalDateInputValue.includes('T'))
                         ? originalDateInputValue.substring(0, 10) 
                         : originalDateInputValue;
    
    // Intenta parsear como YYYY-MM-DD primero (puede ser el substring)
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePartToParse)) {
        let parsedDate = parseISO(datePartToParse); 
        if (isValid(parsedDate) && formatDateFnsInternal(parsedDate, 'yyyy-MM-dd') === datePartToParse) {
            date = parsedDate;
        }
    }
    
    // Si no es YYYY-MM-DD, intenta otros formatos como DD/MM/YY o DD-MM-YY
    if (!date) { 
        const parts = datePartToParse.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (parts) {
            let day_val, month_val, year_val;
            const part1 = parseInt(parts[1], 10);
            const part2 = parseInt(parts[2], 10);
            let part3 = parseInt(parts[3], 10);

            if (parts[3].length === 2) { 
                year_val = part3 < 70 ? 2000 + part3 : 1900 + part3; // Asumir siglo para YY
            } else if (parts[3].length === 4) {
                year_val = part3;
            } else {
                // console.warn(`convertToYYYYMMDD: Invalid year part: ${parts[3]} from ${datePartToParse}`);
                return undefined;
            }
            
            // Heurística para DD/MM vs MM/DD
            if (part1 > 12 && part2 <=12) { day_val = part1; month_val = part2; } // DD/MM
            else if (part2 > 12 && part1 <=12) { month_val = part1; day_val = part2; } // MM/DD - menos común en España
            else { day_val = part1; month_val = part2; } // Podría ser ambiguo, asume DD/MM

            if (year_val && month_val && day_val && month_val >=1 && month_val <=12 && day_val >=1 && day_val <=31) {
                const tempDate = new Date(Date.UTC(year_val, month_val - 1, day_val));
                 if (isValid(tempDate) && tempDate.getUTCFullYear() === year_val && tempDate.getUTCMonth() === month_val -1 && tempDate.getUTCDate() === day_val) {
                    date = tempDate;
                } else {
                    // console.warn(`convertToYYYYMMDD: Date components formed an invalid date: ${day_val}-${month_val}-${year_val}`);
                    return undefined;
                }
            } else {
                // console.warn(`convertToYYYYMMDD: Invalid date components after parsing parts: d=${day_val}, m=${month_val}, y=${year_val}`);
                return undefined;
            }
        } else {
            // console.warn(`convertToYYYYMMDD: String does not match YYYY-MM-DD or DD/MM/YY patterns: ${datePartToParse}`);
            return undefined;
        }
    }
  } else {
    // console.warn(`convertToYYYYMMDD: Unsupported input type: ${typeof dateInput}`);
    return undefined;
  }

  if (!date || !isValid(date)) {
    // console.warn(`convertToYYYYMMDD: Final date object is invalid for input: ${originalDateInputValue}`);
    return undefined;
  }

  try {
    const finalYear = date.getUTCFullYear();
    const finalMonthStr = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const finalDayStr = date.getUTCDate().toString().padStart(2, '0');
    return `${finalYear}-${finalMonthStr}-${finalDayStr}`;
  } catch (error) {
    // console.error(`convertToYYYYMMDD: Error formatting final date: ${date}`, error);
    return undefined;
  }
};


export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelEvents, setPanelEvents] = useState<PanelEvent[]>([]);

  const refreshPanelStatus = useCallback((panelId: string, currentEventsForPanel?: PanelEvent[]) => {
    setPanels(prevPanels => {
      const panelIndex = prevPanels.findIndex(p => p.codigo_parada === panelId);
      if (panelIndex === -1) return prevPanels;

      const panelToUpdate = { ...prevPanels[panelIndex] };
      
      let newStatus: PanelStatus = 'unknown';
      let newLastStatusUpdate: string | null = null;
      const today = new Date(); 
      today.setUTCHours(0,0,0,0); 

      const panelPivInstaladoDate = parseAndValidateDateFromBillingUtils(panelToUpdate.piv_instalado);

      if (panelPivInstaladoDate) {
        if (panelPivInstaladoDate > today) {
          newStatus = 'pending_installation';
        } else {
          newStatus = 'installed'; 
        }
        newLastStatusUpdate = panelToUpdate.piv_instalado!;
      } else {
        newStatus = 'unknown';
        newLastStatusUpdate = null; // o la fecha de importación si se prefiere
      }
      
      const eventsToConsider = (currentEventsForPanel || panelEvents.filter(e => e.panelId === panelId))
        .filter(e => {
            const eventDate = parseAndValidateDateFromBillingUtils(e.fecha);
            return eventDate && eventDate <= today; 
        })
        .sort((a, b) => { 
            const dateA = parseAndValidateDateFromBillingUtils(a.fecha)!.getTime();
            const dateB = parseAndValidateDateFromBillingUtils(b.fecha)!.getTime();
            if (dateA !== dateB) return dateA - dateB;
            return a.id.localeCompare(b.id); 
        });

      if (panelPivInstaladoDate) { 
          for (const event of eventsToConsider) {
            const eventDate = parseAndValidateDateFromBillingUtils(event.fecha)!; 
            if (eventDate >= panelPivInstaladoDate) { // Solo aplicar eventos si son en o después de la instalación
                if (event.tipo === "DESINSTALACION") {
                    newStatus = 'removed';
                } else if (event.tipo === "REINSTALACION") {
                    newStatus = 'installed';
                }
                newLastStatusUpdate = event.fecha; // El último evento válido actualiza la fecha de estado
            }
          }
      }


      if (panelToUpdate.status !== newStatus || panelToUpdate.lastStatusUpdate !== newLastStatusUpdate) {
        const updatedPanels = [...prevPanels];
        updatedPanels[panelIndex] = { ...panelToUpdate, status: newStatus, lastStatusUpdate: newLastStatusUpdate };
        return updatedPanels.sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));
      }
      return prevPanels; 
    });
  }, [panelEvents]);


  useEffect(() => {
    // Cargar datos iniciales desde localStorage si existe
    // const storedPanels = localStorage.getItem('piv_panels');
    // const storedEvents = localStorage.getItem('piv_panelEvents');
    // if (storedPanels) setPanels(JSON.parse(storedPanels));
    // if (storedEvents) setPanelEvents(JSON.parse(storedEvents));
  }, []);

  // useEffect(() => {
    // Guardar en localStorage cuando cambien los datos (opcional)
    // localStorage.setItem('piv_panels', JSON.stringify(panels));
    // localStorage.setItem('piv_panelEvents', JSON.stringify(panelEvents));
  // }, [panels, panelEvents]);


  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }

    let initialStatus: PanelStatus = 'unknown';
    let initialLastStatusUpdate: string | null = null;
    const today = new Date();
    today.setUTCHours(0,0,0,0);

    const panelPivInstaladoDate = parseAndValidateDateFromBillingUtils(panel.piv_instalado);

    if (panelPivInstaladoDate) {
        initialLastStatusUpdate = panel.piv_instalado!;
        if (panelPivInstaladoDate > today) {
            initialStatus = 'pending_installation';
        } else {
            initialStatus = 'installed';
        }
    } else {
        initialLastStatusUpdate = panel.fecha_importacion || format(today, 'yyyy-MM-dd');
    }

    const newPanelWithStatus = {
        ...panel,
        status: initialStatus,
        lastStatusUpdate: initialLastStatusUpdate
    };

    setPanels(prev => [...prev, newPanelWithStatus].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
    // La llamada a refreshPanelStatus no es estrictamente necesaria aquí si addPanel ya calcula el estado inicial.
    // Pero si hay eventos preexistentes para este panelId (raro para un nuevo panel), se podría llamar.
    // Por ahora, se asume que un nuevo panel no tiene eventos preexistentes.
    return { success: true, message: `Panel ${panel.codigo_parada} añadido con estado inicial ${initialStatus}.` };
  }, [panels]);

  const updatePanel = useCallback(async (panelId: string, updates: Partial<Panel>): Promise<DataOperationResult> => {
    let panelExists = false;
    
    setPanels(prev => {
        const panelIndex = prev.findIndex(p => p.codigo_parada === panelId);
        if (panelIndex === -1) return prev;
        
        panelExists = true;
        const updatedPanels = [...prev];
        updatedPanels[panelIndex] = { ...updatedPanels[panelIndex], ...updates };
        return updatedPanels.sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada));
    });

    if (!panelExists) return { success: false, message: `Panel ${panelId} no encontrado.`};
    
    refreshPanelStatus(panelId); 
    
    return { success: true, message: `Panel ${panelId} actualizado.` };
  }, [refreshPanelStatus]);

  const getPanelById = useCallback((panelId: string) => {
    return panels.find(p => p.codigo_parada === panelId);
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
    
    const billingStats: BillingStats = { 
        totalPanels: 0, 
        panelesConImporte: 0, 
        panelesSinImporte: 0, 
        importeTotalMensual: 0, 
        importeMinimo: Infinity, 
        importeMaximo: -Infinity, 
        erroresFormatoImporte: [] 
    } as BillingStats;

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
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));
        
        // console.log("Importing initial data. First mapped row received by DataProvider:", jsonData.length > 0 ? jsonData[0] : "No data");

        initialFilteredData.forEach((row, index) => {
          const rowIndexForError = index + 6; 

          const codigo_parada_raw = row['codigo_parada']; 
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";

          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'codigo_parada' es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return;
          }

          if (currentPanelIdsSet.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe o está duplicado en el archivo. Omitido.`);
            skippedCount++;
            return;
          }
          
          const piv_instalado_valor_mapeado = row['piv_instalado'];
          const piv_desinstalado_valor_mapeado = row['piv_desinstalado'];
          const piv_reinstalado_valor_mapeado = row['piv_reinstalado'];
          const ultima_instalacion_valor_mapeado = row['ultima_instalacion_reinstalacion'];


          const piv_instalado_converted = convertToYYYYMMDD(piv_instalado_valor_mapeado);
          const piv_desinstalado_converted = convertToYYYYMMDD(piv_desinstalado_valor_mapeado);
          const piv_reinstalado_converted = convertToYYYYMMDD(piv_reinstalado_valor_mapeado);
          const ultima_instalacion_converted = convertToYYYYMMDD(ultima_instalacion_valor_mapeado);
          
          if (!piv_instalado_converted) {
            if (piv_instalado_valor_mapeado && String(piv_instalado_valor_mapeado).trim() !== '') {
                 errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'piv_instalado' ("${piv_instalado_valor_mapeado}") es inválida. El panel no será facturable o tendrá estado 'unknown'.`);
            }
          }
          
          const importe_mensual_valor_mapeado = row['importe_mensual'];
          let importe_mensual_final = 37.7; 
          if (importe_mensual_valor_mapeado !== null && importe_mensual_valor_mapeado !== undefined && String(importe_mensual_valor_mapeado).trim() !== '') {
              const parsedAmount = parseFloat(String(importe_mensual_valor_mapeado).replace(',', '.'));
              if (!isNaN(parsedAmount) && parsedAmount >= 0) {
                  importe_mensual_final = parsedAmount;
              } else {
                  errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'importe_mensual' ("${importe_mensual_valor_mapeado}") es inválido. Usando por defecto ${importe_mensual_final}.`);
              }
          }

          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            piv_instalado: piv_instalado_converted || null, 
            piv_desinstalado: piv_desinstalado_converted || null,
            piv_reinstalado: piv_reinstalado_converted || null,
            importe_mensual: importe_mensual_final,
            
            tipo_piv: String(row['tipo_piv'] || '').trim(),
            industrial: String(row['industrial'] || '').trim(),
            empresa_concesionaria: String(row['empresa_concesionaria'] || '').trim(),
            municipio_marquesina: String(row['municipio_marquesina'] || '').trim(),
            codigo_marquesina: String(row['codigo_marquesina'] || '').trim(),
            direccion_cce: String(row['direccion_cce'] || '').trim(),
            vigencia: String(row['vigencia'] || '').trim(),
            ultima_instalacion_o_reinstalacion: ultima_instalacion_converted || null,
            
            observaciones: String(row['observaciones'] || '').trim(),
            descripcion_corta: String(row['descripcion_corta'] || '').trim(),
            codigo_piv_asignado: String(row['codigo_piv_asignado'] || '').trim(),
            op1: String(row['op1'] || '').trim(),
            op2: String(row['op2'] || '').trim(),
            marquesina_cce: String(row['marquesina_cce'] || '').trim(),
            cambio_ubicacion_reinstalaciones: String(row['cambio_ubicacion_reinstalaciones'] || '').trim(),
            reinstalacion_vandalizados: String(row['reinstalacion_vandalizados'] || '').trim(),
            garantia_caducada: String(row['garantia_caducada'] || '').trim(),
            
            // Campos derivados/UI
            municipality: String(row['municipio_marquesina'] || '').trim(),
            client: String(row['empresa_concesionaria'] || '').trim(),
            address: String(row['direccion_cce'] || '').trim(),
            notes: String(row['Notas'] || '').trim(), // Usar 'Notas' si existe, o 'observaciones' si es el preferido
            cce: String(row['cce'] || '').trim(),
            marquesina: String(row['marquesina'] || '').trim(),
            
            status: 'unknown', 
            lastStatusUpdate: null, 
            fecha_importacion: todayFormatted,
            importado_por: "currentUser", 
            importe_mensual_original: String(importe_mensual_valor_mapeado || ''),
            installationDate: piv_instalado_converted || ultima_instalacion_converted || null,
          };
          
            billingStats.totalPanels++;
            if (importe_mensual_final > 0) {
                billingStats.panelesConImporte++;
                billingStats.importeTotalMensual += importe_mensual_final;
                if (importe_mensual_final < billingStats.importeMinimo) billingStats.importeMinimo = importe_mensual_final;
                if (importe_mensual_final > billingStats.importeMaximo) billingStats.importeMaximo = importe_mensual_final;
            } else {
                billingStats.panelesSinImporte++;
            }
          
          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          
          if (piv_desinstalado_converted) {
            newEventsToCreate.push({
              id: crypto.randomUUID(),
              panelId: codigo_parada,
              tipo: "DESINSTALACION",
              fecha: piv_desinstalado_converted,
            });
          }
          if (piv_reinstalado_converted) {
            const desinstallDateObj = parseAndValidateDateFromBillingUtils(piv_desinstalado_converted);
            const reinstallDateObj = parseAndValidateDateFromBillingUtils(piv_reinstalado_converted);
            
            if (reinstallDateObj && (!desinstallDateObj || reinstallDateObj >= desinstallDateObj)) {
              newEventsToCreate.push({
                id: crypto.randomUUID(),
                panelId: codigo_parada,
                tipo: "REINSTALACION",
                fecha: piv_reinstalado_converted,
              });
            } else if (reinstallDateObj && desinstallDateObj && reinstallDateObj < desinstallDateObj) {
                errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'piv_reinstalado' ("${piv_reinstalado_valor_mapeado}") es anterior a 'piv_desinstalado'. Evento de reinstalación omitido o podría necesitar revisión manual.`);
            }
          }
        });

        // console.log("First panel object to be added:", newPanelsToImport.length > 0 ? newPanelsToImport[0] : "No panels to import");

        const panelAddPromises = newPanelsToImport.map(panel => addPanel(panel));
        const panelAddResults = await Promise.all(panelAddPromises);
        addedCount = panelAddResults.filter(r => r.success).length;


        if (newEventsToCreate.length > 0) {
          const eventAddPromises = newEventsToCreate.map(event => addPanelEvent(event)); // addPanelEvent ya llama a refreshPanelStatus
          await Promise.all(eventAddPromises);
        } else {
          // Si no hay eventos creados a partir de fechas PIV, aún necesitamos refrescar el estado de los paneles recién añadidos
          // ya que addPanel solo pone un estado muy básico.
          newPanelsToImport.forEach(p => refreshPanelStatus(p.codigo_parada));
        }
        
    } else { // fileType === 'monthly' (importación de eventos)
        const newEventsToImport: PanelEvent[] = [];
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));
        const headerMapping: { [key: string]: keyof PanelEvent | string } = {
            'panelid': 'panelId',
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
                    // Si no se puede determinar el tipo por el estado nuevo/anterior, y no vino explícito, es un problema.
                    errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow}): No se pudo determinar tipo de evento (DESINSTALACION/REINSTALACION). newStatus: ${panelEvent.newStatus}, oldStatus: ${panelEvent.oldStatus}. El evento no será importado.`);
                    skippedCount++;
                    return;
                }
                panelEvent.tipo = tipoEventoDeterminado;
            }
            // Los campos oldStatus y newStatus no son parte del modelo PanelEvent final, se usan solo para determinar 'tipo'
            delete panelEvent.oldStatus;
            delete panelEvent.newStatus;
            
            newEventsToImport.push(panelEvent as PanelEvent);
        });

        let successfulEventAdds = 0;
        if (newEventsToImport.length > 0) {
            const eventAddPromises = newEventsToImport.map(event => addPanelEvent(event));
            const eventAddResults = await Promise.all(eventAddPromises);
            successfulEventAdds = eventAddResults.filter(r => r.success).length;
        }
        // `addPanelEvent` ya llama a `refreshPanelStatus`, por lo que los estados de los paneles afectados se actualizarán.
        addedCount += successfulEventAdds; // 'addedCount' aquí se refiere a eventos añadidos
    }

    const opSuccess = addedCount > 0 || (fileType === 'initial' && newPanelsToImport.length > 0 && skippedCount < processedCountFromFile);
    let opMessage = `Registros procesados desde archivo: ${processedCountFromFile}. `;
    if (fileType === 'initial') {
        opMessage += `Paneles ${newPanelsToImport.length > addedCount ? 'intentados' : 'añadidos'}: ${addedCount}. `;
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
    
    // console.log("Final import result:", { success: opSuccess, message: opMessage, errors, addedCount, skippedCount });

    return {
        success: opSuccess,
        message: opMessage,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined, 
        addedCount,
        skippedCount,
        processedCount: jsonData.length, 
        billingStats: fileType === 'initial' ? billingStats : undefined
    };
  }, [panels, panelEvents, refreshPanelStatus, addPanel, addPanelEvent, getPanelById, getEventsForPanel]); // Incluir addPanel y addPanelEvent aquí

  const deletePanel = useCallback(async (panelId: string): Promise<DataOperationResult> => {
    return { success: false, message: "Función de eliminación no implementada." };
  }, []);

  const deletePanelEvent = useCallback(async (eventId: string): Promise<DataOperationResult> => {
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

const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
  
  const datePart = dateStr.trim().substring(0, 10); 

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
    return false;
  }
  const dateObj = parseISO(datePart);
  return isValid(dateObj) && formatDateFnsInternal(dateObj, 'yyyy-MM-dd') === datePart;
};
