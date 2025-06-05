
"use client";

import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import { ALL_PANEL_STATUSES } from '@/types/piv';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { format, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFnsDateFns, format as formatDateFnsInternal } from 'date-fns'; // Renamed to avoid conflict
import * as XLSX from 'xlsx'; // Importar XLSX para SSF
import { parseAndValidateDate as parseAndValidateDateFromBillingUtils } from '@/lib/billing-utils'; // Renombrar para claridad

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
        // XLSX.SSF.parse_date_code es más robusto para convertir números de serie de Excel.
        // Devuelve un objeto con y, m, d, etc. (año, mes, día)
        const excelDate = XLSX.SSF.parse_date_code(serial);
        if (excelDate && typeof excelDate.y === 'number' && typeof excelDate.m === 'number' && typeof excelDate.d === 'number') {
            // El mes (m) en parse_date_code es 1-indexado. El constructor de Date JS espera 0-indexado para mes.
            const date = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d, excelDate.H || 0, excelDate.M || 0, excelDate.S || 0));
            return isValid(date) ? date : undefined;
        }
    } catch (e) {
        // console.warn(`Error converting Excel serial date ${serial}:`, e);
        return undefined;
    }
    // console.warn(`Could not parse Excel serial date ${serial} with XLSX.SSF.parse_date_code.`);
    return undefined;
};


const convertToYYYYMMDD = (dateInput: any): string | undefined => {
  if (dateInput === null || dateInput === undefined || String(dateInput).trim() === "" || String(dateInput).trim().toLowerCase() === "nan") {
    return undefined;
  }

  let date: Date | undefined;
  let originalDateInputValue = String(dateInput).trim(); 

  if (dateInput instanceof Date) { // Si ya es un objeto Date (gracias a cellDates:true)
    if (isValid(dateInput)) {
      date = dateInput;
    } else {
        // console.warn(`convertToYYYYMMDD: Invalid Date object received: ${dateInput}`);
        return undefined;
    }
  } else if (typeof dateInput === 'number') { // Si es un número (posiblemente serie Excel si cellDates:false o falló)
    date = convertExcelSerialToDate(dateInput);
    if (!date || !isValid(date)) {
        // console.warn(`convertToYYYYMMDD: Invalid Excel serial date: ${dateInput}`);
        return undefined;
    }
  } else if (typeof dateInput === 'string') {
    let datePartToParse = originalDateInputValue;
    // Si es YYYY-MM-DD HH:MM:SS (o similar), tomar solo la parte de fecha
    if (datePartToParse.length > 10 && datePartToParse.charAt(4) === '-' && datePartToParse.charAt(7) === '-') {
        datePartToParse = datePartToParse.substring(0, 10);
    }
    
    // Intentar parsear como YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePartToParse)) {
        let parsedDate = parseISO(datePartToParse); 
        if (isValid(parsedDate) && formatDateFnsInternal(parsedDate, 'yyyy-MM-dd') === datePartToParse) {
            date = parsedDate;
        } else {
            // console.warn(`convertToYYYYMMDD: Invalid YYYY-MM-DD string: ${datePartToParse}`);
        }
    }
    
    if (!date) { // Si no era YYYY-MM-DD o falló, intentar DD-MM-YY o DD/MM/YY o DD.MM.YY etc.
        const parts = datePartToParse.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (parts) {
            let day_val, month_val, year_val;
            const part1 = parseInt(parts[1], 10);
            const part2 = parseInt(parts[2], 10);
            let part3 = parseInt(parts[3], 10);

            if (parts[3].length === 2) { 
                year_val = part3 < 70 ? 2000 + part3 : 1900 + part3; // Asumir siglo
            } else if (parts[3].length === 4) {
                year_val = part3;
            } else {
                return undefined;
            }
            
            // Heurística para DD/MM vs MM/DD. Si no es ambiguo, usarlo. Si es ambiguo, asumir DD/MM.
            if (part1 > 12 && part2 <=12) { day_val = part1; month_val = part2; } // DD/MM
            else if (part2 > 12 && part1 <=12) { month_val = part1; day_val = part2; } // MM/DD
            else { day_val = part1; month_val = part2; } // Ambiguo o ambos <=12, asumir DD/MM

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
      
      const panelPivInstaladoDate = parseAndValidateDateFromBillingUtils(panelToUpdate.piv_instalado);
      let newStatus: PanelStatus = panelPivInstaladoDate ? 'pending_installation' : 'unknown';
      let newLastStatusUpdate: string | null = panelToUpdate.piv_instalado || null;

      if (panelPivInstaladoDate && new Date() >= panelPivInstaladoDate) {
        newStatus = 'installed'; 
      }
      
      const sortedEvents = [...eventsForPanel]
        .filter(e => parseAndValidateDateFromBillingUtils(e.fecha))
        .sort((a, b) => {
            const dateA = parseAndValidateDateFromBillingUtils(a.fecha)!.getTime();
            const dateB = parseAndValidateDateFromBillingUtils(b.fecha)!.getTime();
            return dateB - dateA; 
        });

      if (sortedEvents.length > 0) {
        const latestEvent = sortedEvents[0];
        const latestEventDate = parseAndValidateDateFromBillingUtils(latestEvent.fecha);

        if (latestEventDate) {
            newLastStatusUpdate = latestEvent.fecha;
            if (latestEvent.tipo === "DESINSTALACION") {
                newStatus = 'removed';
            } else if (latestEvent.tipo === "REINSTALACION") {
                newStatus = 'installed';
            }
        }
      } else if (panelPivInstaladoDate) { 
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
  }, []);

  const addPanel = useCallback(async (panel: Panel): Promise<DataOperationResult> => {
    if (panels.some(p => p.codigo_parada === panel.codigo_parada)) {
      return { success: false, message: `El panel con código ${panel.codigo_parada} ya existe.` };
    }
    const panelPivInstaladoDate = parseAndValidateDateFromBillingUtils(panel.piv_instalado);
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

    let latestEventsForPanel: PanelEvent[];
    setPanelEvents(prevEvents => {
      const updatedEvents = [...prevEvents, newEventWithId];
      latestEventsForPanel = updatedEvents.filter(e => e.panelId === newEventWithId.panelId);
      return updatedEvents.sort((a,b) => { 
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
      affectedPanelId = updates.panelId || originalEvent.panelId; 
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
    // let firstPanelMappedForDebug: Panel | null = null; 

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


    if (fileType === 'initial') {
        const newPanelsToImport: Panel[] = [];
        const newEventsToCreate: PanelEvent[] = [];
        const importedPanelIdsInFile = new Set<string>();
        const currentPanelIdsSet = new Set(panels.map(p => p.codigo_parada));
        
        // console.log("Primeras 2 filas de jsonData (mappedData ANTES de procesar en DataProvider):", jsonData.slice(0,2));


        initialFilteredData.forEach((row, index) => {
          const rowIndexForError = index + 6; // Asumiendo cabeceras en fila 5

          // Utilizar las claves MAPEADAS que vienen de mapAndEnsureColumns
          const codigo_parada_raw = row['Código parada']; 
          const codigo_parada = codigo_parada_raw !== undefined && codigo_parada_raw !== null ? String(codigo_parada_raw).trim() : "";

          if (!codigo_parada) {
            errors.push(`Fila ${rowIndexForError}: 'Código parada' (mapeado) es obligatorio y no puede estar vacío.`);
            skippedCount++;
            return;
          }

          if (currentPanelIdsSet.has(codigo_parada) || importedPanelIdsInFile.has(codigo_parada)) {
            errors.push(`Fila ${rowIndexForError}: El panel con ID '${codigo_parada}' ya existe o está duplicado en el archivo. Omitido.`);
            skippedCount++;
            return;
          }
          
          // Acceder a las fechas usando las claves MAPEADAS
          const piv_instalado_valor_mapeado = row['PIV Instalado'];
          const piv_desinstalado_valor_mapeado = row['PIV Desinstalado'];
          const piv_reinstalado_valor_mapeado = row['PIV Reinstalado'];
          const ultima_instalacion_valor_mapeado = row['Última instalación/reinstalación'];


          const piv_instalado_converted = convertToYYYYMMDD(piv_instalado_valor_mapeado);
          const piv_desinstalado_converted = convertToYYYYMMDD(piv_desinstalado_valor_mapeado);
          const piv_reinstalado_converted = convertToYYYYMMDD(piv_reinstalado_valor_mapeado);
          const ultima_instalacion_converted = convertToYYYYMMDD(ultima_instalacion_valor_mapeado);
          
          if (!piv_instalado_converted) {
            if (piv_instalado_valor_mapeado && String(piv_instalado_valor_mapeado).trim() !== '') {
                 errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'PIV Instalado' ("${piv_instalado_valor_mapeado}") es inválida. Se asignará Nulo. El panel no será facturable.`);
            } else {
                 // console.warn(`Panel ${codigo_parada} no tiene fecha de instalación ('PIV Instalado') válida. No será facturable.`);
            }
          }
          
          const importe_mensual_valor_mapeado = row['Importe Mensual']; // Usar clave mapeada
          let importe_mensual_final = 37.7; // Valor por defecto
          if (importe_mensual_valor_mapeado !== null && importe_mensual_valor_mapeado !== undefined && String(importe_mensual_valor_mapeado).trim() !== '') {
              const parsedAmount = parseFloat(String(importe_mensual_valor_mapeado).replace(',', '.'));
              if (!isNaN(parsedAmount) && parsedAmount >= 0) {
                  importe_mensual_final = parsedAmount;
              } else {
                  errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'Importe Mensual' ("${importe_mensual_valor_mapeado}") es inválido. Usando por defecto ${importe_mensual_final}.`);
              }
          }


          const newPanel: Panel = {
            codigo_parada: codigo_parada,
            piv_instalado: piv_instalado_converted!, 
            piv_desinstalado: piv_desinstalado_converted,
            piv_reinstalado: piv_reinstalado_converted,
            importe_mensual: importe_mensual_final,
            
            tipo_piv: String(row['Tipo PIV'] || '').trim(),
            industrial: String(row['Industrial'] || '').trim(),
            empresa_concesionaria: String(row['Empresas concesionarias'] || '').trim(),
            municipio_marquesina: String(row['Municipio Marquesina'] || '').trim(),
            codigo_marquesina: String(row['Código Marquesina'] || '').trim(),
            direccion_cce: String(row['Direccion CCE (Clear Channel)'] || '').trim(),
            vigencia: String(row['Vigencia'] || '').trim(),
            ultima_instalacion_o_reinstalacion: ultima_instalacion_converted,
            
            municipality: String(row['Municipio Marquesina'] || '').trim(),
            client: String(row['Empresas concesionarias'] || '').trim(),
            address: String(row['Direccion CCE (Clear Channel)'] || '').trim(),
            
            status: piv_instalado_converted ? 'pending_installation' : 'unknown', 
            lastStatusUpdate: piv_instalado_converted, 
            fecha_importacion: new Date().toISOString().split('T')[0],
            importado_por: "currentUser", 
            importe_mensual_original: String(importe_mensual_valor_mapeado || ''),
            installationDate: piv_instalado_converted || ultima_instalacion_converted,
            
            // Mapear otros campos si existen en 'row' con sus claves mapeadas
            marquesina: String(row['Marquesina'] || row['marquesina'] || '').trim(), // Asumiendo posible clave 'Marquesina'
            cce: String(row['CCE'] || row['Cce'] || row['cce'] || '').trim(), // Asumiendo posibles claves 'CCE' o 'cce'
            notes: String(row['Notas'] || row['notas'] || '').trim(), // Asumiendo posible clave 'Notas'
          };
          
          // Lógica de billingStats (actualizar con importe_mensual_final)
            billingStats.totalPanels++;
            if (importe_mensual_final > 0) {
                billingStats.panelesConImporte++;
                billingStats.importeTotalMensual += importe_mensual_final;
                if (importe_mensual_final < billingStats.importeMinimo) billingStats.importeMinimo = importe_mensual_final;
                if (importe_mensual_final > billingStats.importeMaximo) billingStats.importeMaximo = importe_mensual_final;
            } else {
                billingStats.panelesSinImporte++;
            }
            // ... (manejo de errores de formato importe si es necesario) ...
          
          newPanelsToImport.push(newPanel);
          importedPanelIdsInFile.add(codigo_parada);
          addedCount++;
          // if (!firstPanelMappedForDebug) {
          //   firstPanelMappedForDebug = { ...newPanel }; // Clonar para el log
          // }

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
            const installDateObj = parseAndValidateDateFromBillingUtils(piv_instalado_converted);

            if (reinstallDateObj && desinstallDateObj && reinstallDateObj > desinstallDateObj) {
              newEventsToCreate.push({
                id: crypto.randomUUID(),
                panelId: codigo_parada,
                tipo: "REINSTALACION",
                fecha: piv_reinstalado_converted,
              });
            } else if (reinstallDateObj && !desinstallDateObj && installDateObj && reinstallDateObj > installDateObj ) {
               newEventsToCreate.push({
                id: crypto.randomUUID(),
                panelId: codigo_parada,
                tipo: "REINSTALACION", 
                fecha: piv_reinstalado_converted,
                notes: "Reinstalación (sin desinstalación previa registrada, posterior a instalación inicial)."
              });
            } else if (reinstallDateObj && installDateObj && reinstallDateObj < installDateObj) {
                errors.push(`Fila ${rowIndexForError} (Panel ${codigo_parada}): 'PIV Reinstalado' ("${piv_reinstalado_valor_mapeado}") es anterior a 'PIV Instalado'. Evento de reinstalación omitido.`);
            }
          }
        });

        if (newPanelsToImport.length > 0) {
          setPanels(prev => [...prev, ...newPanelsToImport].sort((a, b) => a.codigo_parada.localeCompare(b.codigo_parada)));
          // console.log(`[Importación Inicial] Paneles añadidos al estado: ${newPanelsToImport.length}.`);
          // if(firstPanelMappedForDebug) console.log('Primer panel mapeado en DataProvider:', firstPanelMappedForDebug);
        }
        if (newEventsToCreate.length > 0) {
          setPanelEvents(prevEvents => [...prevEvents, ...newEventsToCreate].sort((a,b) => {
             const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
             const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
             return dateA - dateB; 
          }));
          // console.log(`[Importación Inicial] Eventos PIV creados y añadidos: ${newEventsToCreate.length}`);
        }
        
        const panelIdsToRefresh = new Set([...newPanelsToImport.map(p => p.codigo_parada), ...newEventsToCreate.map(e => e.panelId)]);
        panelIdsToRefresh.forEach(pid => {
            const currentPanel = getPanelById(pid); 
            const eventsForThisPanel = getEventsForPanel(pid); 
            if(currentPanel) refreshPanelStatus(pid, eventsForThisPanel);
        });

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
                  // eventStatusValueMapping debe existir y ser robusto
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
                    errors.push(`Fila ${rowIndexForError} (Evento Panel ${panelIdFromRow}): No se pudo determinar tipo de evento. newStatus: ${panelEvent.newStatus}, oldStatus: ${panelEvent.oldStatus}.`);
                    skippedCount++;
                    return;
                }
                panelEvent.tipo = tipoEventoDeterminado;
            }
            delete panelEvent.oldStatus;
            delete panelEvent.newStatus;
            
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

    const opSuccess = addedCount > 0 || (fileType === 'initial' && newPanelsToImport.length > 0);
    let opMessage = `Registros procesados desde archivo: ${processedCountFromFile}. Añadidos: ${addedCount}. Omitidos: ${skippedCount}.`;
    if (errors.length > 0) {
        opMessage += ` Errores/Advertencias: ${errors.length}. Revise los detalles y la consola. Primeros errores: ${errors.slice(0,5).join('; ')}`;
    } else if (addedCount > 0) {
        opMessage += fileType === 'initial' ? ' Importación de paneles completada.' : ' Importación de eventos completada.';
    } else if (fileType === 'initial' && newPanelsToImport.length > 0 && addedCount === 0 && skippedCount === newPanelsToImport.length) {
         opMessage = `Se procesaron ${processedCountFromFile} paneles del archivo, pero todos fueron omitidos debido a duplicados o errores.`;
    }
     else {
        opMessage = `No se ${fileType === 'initial' ? 'importaron paneles nuevos válidos' : 'importaron eventos nuevos válidos'}. Verifique el archivo y los logs.`;
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
  }, [panels, panelEvents, refreshPanelStatus, getPanelById, getEventsForPanel]); 

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


const isValidDateString = (dateStr: any): dateStr is string => {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
  
  const datePart = dateStr.trim().substring(0, 10); 

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
    return false;
  }
  const dateObj = parseISO(datePart);
  return isValid(dateObj) && formatDateFnsInternal(dateObj, 'yyyy-MM-dd') === datePart;
};

const eventStatusValueMapping: { [key: string]: PanelStatus } = {
  'instalado': 'installed',
  'eliminado': 'removed',
  'mantenimiento': 'maintenance',
  'pendiente instalacion': 'pending_installation',
  'pendiente instalación': 'pending_installation', // con tilde
  'pendiente eliminacion': 'pending_removal',
  'pendiente eliminación': 'pending_removal', // con tilde
  'desconocido': 'unknown',
  'ok': 'installed', // Vigencia
  'en rev.': 'maintenance', // Vigencia
  'desinstalado': 'removed', // Vigencia
  'pendiente': 'pending_installation', // Vigencia (genérico)
};


    