
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonth } from 'date-fns'; // Renombrado para evitar conflicto
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV
const DAYS_IN_STANDARD_MONTH = 30; // Base para tarifa DIARIA

// Helper to format date to YYYY-MM-DD (UTC)
const formatDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// Helper to check if a string is a valid date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return false;
    }
    // Check if parsing and re-formatting matches (handles invalid dates like 2023-02-30)
    const dateObj = parseISO(dateStr.substring(0,10)); // Use parseISO for robustness
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd') === dateStr.substring(0,10);
};


export interface BillingRecord {
  panelId: string;
  year: number;
  month: number; // 1-12
  billedDays: number;
  totalDaysInMonth: number;
  amount: number; // Calculated amount in EUR
  panelDetails?: Panel;
}

/**
 * CASOS DE PRUEBA (basado en MAX_MONTHLY_RATE = 37.70 y DAYS_IN_STANDARD_MONTH = 30 para tarifa diaria):
 * - PIV instalado 30 días en un mes de 30 días = €37,70
 * - PIV instalado 15 días en un mes de 30 días = €18,85 (15 * (37.70 / 30))
 * - PIV instalado 1 día en un mes de 30 días = €1,26 (1 * (37.70 / 30))
 * - PIV no instalado (0 días) = €0,00
 * - PIV instalado 31 días en un mes de 31 días = €37,70 (máximo)
 * - PIV instalado 28 días en un mes de 28 días (Feb) = €37.70
 *
 * CASOS DE PRUEBA REALES (ejemplos para Junio = 30 días):
 *
 * CASO 1 - PIV instalado todo el mes:
 * - PIV Instalado: 2024-05-15 (antes del mes)
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 30 días facturables = €37,70
 *
 * CASO 2 - PIV desinstalado en el mes:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-20
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 19 días facturables (del 1 al 19 inclusive) = 19 * (37.70/30) ~= €23.88
 *
 * CASO 3 - PIV desinstalado y reinstalado:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-10
 * - PIV Reinstalado: 2025-06-25
 * - Resultado Junio 2025: 9 días (1-9) + 6 días (25-30) = 15 días ~= €18.85
 *
 * CASO 4 - PIV instalado durante el mes:
 * - PIV Instalado: 2025-06-15
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 16 días (15-30) = 16 * (37.70/30) ~= €20.11
 */
export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[], // Kept for signature compatibility, not primary for billedDays if PIV dates are used
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonth(new Date(year, month - 1));

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const billedDays = calculateBillableDaysFromPIVDates(panel, year, month);

  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;

  const amount = calculateProportionalBilling(billedDays, baseMonthlyAmount, DAYS_IN_STANDARD_MONTH, actualDaysInBillingMonth);

  return {
    panelId,
    year,
    month,
    billedDays,
    totalDaysInMonth: actualDaysInBillingMonth,
    amount,
    panelDetails: panel,
  };
}

function calculateProportionalBilling(
  daysInstalled: number,
  baseMonthlyAmount: number,
  daysForDailyRate: number, // e.g., 30 (DAYS_IN_STANDARD_MONTH)
  actualDaysInBillingMonth: number // e.g., 28, 29, 30, 31
): number {
  if (daysInstalled <= 0) return 0;

  // Si estuvo instalado todos los días del mes actual, cobrar el importe mensual completo
  if (daysInstalled >= actualDaysInBillingMonth) {
    return parseFloat(baseMonthlyAmount.toFixed(2));
  }

  const dailyRate = baseMonthlyAmount / daysForDailyRate;
  const proportionalAmount = daysInstalled * dailyRate;

  // Redondear a 2 decimales
  return parseFloat(proportionalAmount.toFixed(2));
}

function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonth(new Date(year, month - 1));
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));
  
  console.log(`[Debug ${panel.codigo_parada}] Calculating for ${year}-${month} (Days in month: ${actualDaysInBillingMonth})`);
  console.log(`[Debug ${panel.codigo_parada}] Raw Dates: PIV_Inst: ${panel.piv_instalado}, PIV_Desinst: ${panel.piv_desinstalado}, PIV_Reinst: ${panel.piv_reinstalado}, Panel.InstDate: ${panel.installationDate}, Panel.Status: ${panel.status}`);

  let effectiveInstallDate: Date | null = null;

  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    effectiveInstallDate = parseDate(panel.piv_instalado);
    console.log(`[Debug ${panel.codigo_parada}] Using piv_instalado: ${formatDate(effectiveInstallDate)}`);
  } else if (panel.status === 'installed' && panel.installationDate && isValidDateString(panel.installationDate)) {
    effectiveInstallDate = parseDate(panel.installationDate);
    console.log(`[Debug ${panel.codigo_parada}] Using panel.installationDate (fallback1): ${formatDate(effectiveInstallDate)}`);
  } else if (panel.status === 'installed') {
    effectiveInstallDate = monthStartDate; // Fallback for active panels without explicit install dates
    console.log(`[Debug ${panel.codigo_parada}] Using monthStartDate (fallback2 - status 'installed' but no valid PIV/Inst date): ${formatDate(effectiveInstallDate)}`);
  }

  if (!effectiveInstallDate) {
    console.log(`[Debug ${panel.codigo_parada}] No effectiveInstallDate determined. Returning 0 billable days.`);
    return 0;
  }
   console.log(`[Debug ${panel.codigo_parada}] Final effectiveInstallDate: ${formatDate(effectiveInstallDate)}`);


  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  if (desinstallDateObj) console.log(`[Debug ${panel.codigo_parada}] Parsed desinstallDateObj: ${formatDate(desinstallDateObj)}`);
  if (reinstallDateObj) console.log(`[Debug ${panel.codigo_parada}] Parsed reinstallDateObj: ${formatDate(reinstallDateObj)}`);

  let billableDays = 0;

  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isInstalledOnThisDay = false;

    // Panel is potentially active if currentDate is on or after effectiveInstallDate
    if (currentDate >= effectiveInstallDate) {
      isInstalledOnThisDay = true; // Assume installed

      // Check for desinstallation
      if (desinstallDateObj && currentDate >= desinstallDateObj) {
        isInstalledOnThisDay = false; // It was desinstalled on or before this day

        // Check for reinstallation after desinstallation
        if (reinstallDateObj && currentDate >= reinstallDateObj && reinstallDateObj > desinstallDateObj) {
          isInstalledOnThisDay = true; // It was reinstalled on or before this day, and after the desinstallation
        }
      }
    }
    
    // console.log(`[Debug ${panel.codigo_parada}] Day ${day} (${formatDate(currentDate)}): isInstalledOnThisDay = ${isInstalledOnThisDay}`);
    if (isInstalledOnThisDay) {
      billableDays++;
    }
  }
  
  console.log(`[Debug ${panel.codigo_parada}] Total billableDays for ${year}-${month}: ${billableDays}`);
  return billableDays;
}


export interface DayStatus {
  date: string; // YYYY-MM-DD
  status: PivPanelStatus;
  isBillable: boolean;
  eventNotes?: string;
}

export function getPanelHistoryForBillingMonth(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[],
  allPanels: Panel[]
): DayStatus[] {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  if (!panel) return [];

  const panelEventsForThisPanel = allEvents
    .filter(event => event.panelId === panelId)
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()); // Ascendente

  const daysInMonth = getDaysInActualMonth(new Date(year, month - 1));
  const dailyHistory: DayStatus[] = [];
  let currentStatus: PivPanelStatus = 'unknown'; 
  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);

  // Determine initial status at the beginning of the month
  const eventsBeforeMonth = panelEventsForThisPanel.filter(event => parseDate(event.date) < monthStartDate);
  if (eventsBeforeMonth.length > 0) {
    currentStatus = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else {
    // No PanelEvents before the month, try to derive from PIV dates or panel.installationDate
    let initialEffectiveDate: Date | null = null;
    if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) initialEffectiveDate = parseDate(panel.piv_instalado);
    else if (panel.installationDate && isValidDateString(panel.installationDate)) initialEffectiveDate = parseDate(panel.installationDate);

    if (initialEffectiveDate && initialEffectiveDate < monthStartDate) {
      currentStatus = 'installed'; // Base assumption
      const desinstallDatePiv = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
      const reinstallDatePiv = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

      if (desinstallDatePiv && desinstallDatePiv < monthStartDate) {
        currentStatus = 'removed';
        if (reinstallDatePiv && reinstallDatePiv > desinstallDatePiv && reinstallDatePiv < monthStartDate) {
          currentStatus = 'installed';
        }
      }
    } else {
      // If installation is during or after this month, or no clear date, use panel.status (from Vigencia)
      currentStatus = panel.status;
    }
  }


  const statusTranslations: Record<PivPanelStatus, string> = {
    installed: "Instalado",
    removed: "Eliminado",
    maintenance: "Mantenimiento",
    pending_installation: "Pendiente Instalación",
    pending_removal: "Pendiente Eliminación",
    unknown: "Desconocido",
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = parseDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    const currentDateStr = formatDate(currentDate);
    let eventNotesForDay = "";

    // Apply PanelEvents for the current day (these override PIV date derived status for this view)
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDate(parseDate(event.date)) === currentDateStr);
    if (eventsOnThisDay.length > 0) {
      currentStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus; 
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      // If no PanelEvents, determine status based on PIV dates for this specific day
      let statusFromPivDates = panel.status; // Default to overall panel status

      let dayEffectiveInstallDate: Date | null = null;
      if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) dayEffectiveInstallDate = parseDate(panel.piv_instalado);
      else if (panel.installationDate && isValidDateString(panel.installationDate)) dayEffectiveInstallDate = parseDate(panel.installationDate);
      
      if (dayEffectiveInstallDate && currentDate >= dayEffectiveInstallDate) {
          statusFromPivDates = 'installed';
          const desDate = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
          const reinDate = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;
          if (desDate && currentDate >= desDate) {
              statusFromPivDates = 'removed';
              if(reinDate && currentDate >= reinDate && reinDate > desDate) {
                  statusFromPivDates = 'installed';
              }
          }
      } else if (dayEffectiveInstallDate && currentDate < dayEffectiveInstallDate) {
           // Not yet installed based on PIV/installation date
           statusFromPivDates = panel.status === 'installed' ? 'pending_installation' : panel.status;
      }
      currentStatus = statusFromPivDates;
      eventNotesForDay = currentStatus !== 'unknown' ? `Estado PIV: ${statusTranslations[currentStatus]}` : 'Sin evento específico';
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: currentStatus,
      isBillable: currentStatus === 'installed',
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}

    
