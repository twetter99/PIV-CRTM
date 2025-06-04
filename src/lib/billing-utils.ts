
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV
const DAYS_IN_STANDARD_MONTH = 30; // Base para tarifa DIARIA (e.g. 37.70 / 30)

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
    const dateObj = parseISO(dateStr.substring(0,10)); 
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
 * - PIV instalado 31 días en un mes de 31 días = €37,70 (máximo, ya que se cobra el baseMonthlyAmount)
 * - PIV instalado 28 días en un mes de 28 días (Feb) = €37.70 (máximo)
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
 * - PIV Desinstalado: 2025-06-20 (No se factura el día 20)
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 19 días facturables (1 al 19) = 19 * (37.70/30) ~= €23.88
 *
 * CASO 3 - PIV desinstalado y reinstalado:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-10 (No se factura el día 10)
 * - PIV Reinstalado: 2025-06-25 (Se factura el día 25)
 * - Resultado Junio 2025: 9 días (1-9) + 6 días (25-30) = 15 días ~= €18.85
 *
 * CASO 4 - PIV instalado durante el mes:
 * - PIV Instalado: 2025-06-15 (Se factura el día 15)
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 16 días (15-30) = 16 * (37.70/30) ~= €20.11
 */
export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, // 1-12
  // allEvents: PanelEvent[], // No longer directly used for billedDays calculation here
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonth(new Date(Date.UTC(year, month - 1, 1)));

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

  return parseFloat(proportionalAmount.toFixed(2));
}

function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonth(new Date(Date.UTC(year, month - 1, 1)));
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));

  let effectiveInstallDate: Date | null = null;

  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    effectiveInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.status === 'installed' && panel.installationDate && isValidDateString(panel.installationDate)) {
    effectiveInstallDate = parseDate(panel.installationDate);
     // console.log(`[Info ${panel.codigo_parada}] Using panel.installationDate ('${panel.installationDate}') as fallback for effectiveInstallDate. Panel status: ${panel.status}.`);
  } else if (panel.status === 'installed') {
    effectiveInstallDate = monthStartDate; // Fallback for active panels without other valid install dates
    console.warn(`[Warn ${panel.codigo_parada}] Panel status is 'installed' but no valid 'piv_instalado' or 'installationDate' found. Assuming installed from start of billing month ${year}-${month} for calculation. PIV Dates: inst='${panel.piv_instalado}', desinst='${panel.piv_desinstalado}', reinst='${panel.piv_reinstalado}'. PanelInstDate: '${panel.installationDate}'`);
  }

  if (!effectiveInstallDate) {
    // console.log(`[Debug ${panel.codigo_parada}] No effective install date. Panel status: ${panel.status}. PIV Inst: ${panel.piv_instalado}. Panel InstDate: ${panel.installationDate}. Returning 0 billable days.`);
    return 0;
  }

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  let billableDays = 0;
  // console.log(`[Trace ${panel.codigo_parada}] Start billing calc for ${year}-${month}. EffectiveInst: ${effectiveInstallDate ? formatDate(effectiveInstallDate) : 'N/A'}. Desinst: ${desinstallDateObj ? formatDate(desinstallDateObj) : 'N/A'}. Reinst: ${reinstallDateObj ? formatDate(reinstallDateObj) : 'N/A'}`);

  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    // Initial condition: must be on or after the effective installation date.
    if (currentDate >= effectiveInstallDate) {
      isEffectivelyInstalledToday = true; // Assume installed by default if past effective install date.

      // Check for desinstallation period.
      if (desinstallDateObj && currentDate >= desinstallDateObj) {
        // Panel entered a desinstalled state on or before today.
        isEffectivelyInstalledToday = false;

        // Check if it was reinstalled after this desinstallation.
        if (reinstallDateObj && reinstallDateObj > desinstallDateObj && currentDate >= reinstallDateObj) {
          // Panel was reinstalled after the desinstallation, and today is on or after that reinstallation.
          isEffectivelyInstalledToday = true;
        }
      }
    }
    
    // const panelIdForLog = ['10143', '11476', '16722'];
    // if (panelIdForLog.includes(panel.codigo_parada)) {
    //    console.log(`[Trace ${panel.codigo_parada}] Day ${formatDate(currentDate)}: effectiveInstallDate=${effectiveInstallDate ? formatDate(effectiveInstallDate) : 'null'}, desinstall=${desinstallDateObj ? formatDate(desinstallDateObj) : 'null'}, reinstall=${reinstallDateObj ? formatDate(reinstallDateObj) : 'null'} => installedToday=${isEffectivelyInstalledToday}`);
    // }

    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
  }
  // console.log(`[Debug ${panel.codigo_parada}] End billing calc. Total billableDays for ${year}-${month}: ${billableDays}/${actualDaysInBillingMonth}`);
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
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  const daysInMonth = getDaysInActualMonth(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  let currentStatusForDay: PivPanelStatus = 'unknown'; 
  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);

  // Determine initial status at the very beginning of the month (before day 1 processing)
  const eventsBeforeMonth = panelEventsForThisPanel.filter(event => parseDate(event.date) < monthStartDate);
  if (eventsBeforeMonth.length > 0) {
    currentStatusForDay = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else {
    // No PanelEvents before the month, derive from PIV dates or panel.installationDate
    let initialEffectiveDate: Date | null = null;
    if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
      initialEffectiveDate = parseDate(panel.piv_instalado);
    } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
      initialEffectiveDate = parseDate(panel.installationDate);
    }

    if (initialEffectiveDate) {
      if (initialEffectiveDate < monthStartDate) { // Installed before this month started
        currentStatusForDay = 'installed'; // Base assumption
        const desinstallPiv = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
        const reinstallPiv = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

        if (desinstallPiv && desinstallPiv < monthStartDate) {
          currentStatusForDay = 'removed';
          if (reinstallPiv && reinstallPiv > desinstallPiv && reinstallPiv < monthStartDate) {
            currentStatusForDay = 'installed';
          }
        }
      } else { // Installation is during or after this month
         currentStatusForDay = panel.status === 'installed' ? 'pending_installation' : panel.status;
      }
    } else { // No PIV or installationDate found
      currentStatusForDay = panel.status; // Fallback to general panel status
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
    
    // Temporarily hold the status from the previous day or initial calculation
    let dailyStatus = currentStatusForDay;

    // Override with PIV dates logic for the current day's status determination
    let pivEffectiveInstallDate: Date | null = null;
    if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) pivEffectiveInstallDate = parseDate(panel.piv_instalado);
    else if (panel.installationDate && isValidDateString(panel.installationDate)) pivEffectiveInstallDate = parseDate(panel.installationDate);
    else if (panel.status === 'installed') pivEffectiveInstallDate = monthStartDate; // Fallback if 'installed'

    if (pivEffectiveInstallDate && currentDate >= pivEffectiveInstallDate) {
        dailyStatus = 'installed';
        const desDate = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
        const reinDate = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;
        if (desDate && currentDate >= desDate) {
            dailyStatus = 'removed';
            if(reinDate && currentDate >= reinDate && reinDate > desDate) {
                dailyStatus = 'installed';
            }
        }
    } else if (pivEffectiveInstallDate && currentDate < pivEffectiveInstallDate) {
         dailyStatus = panel.status === 'installed' ? 'pending_installation' : panel.status;
    } else {
         dailyStatus = panel.status; // Fallback if no effective install date
    }
    
    // Apply PanelEvents for the current day - these can override PIV-derived status for this specific day's log
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDate(parseDate(event.date)) === currentDateStr);
    if (eventsOnThisDay.length > 0) {
      dailyStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus; 
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = dailyStatus !== 'unknown' ? `Estado PIV: ${statusTranslations[dailyStatus]}` : 'Sin evento específico';
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: dailyStatus,
      isBillable: dailyStatus === 'installed', // Billable if the final status for the day is 'installed'
      eventNotes: eventNotesForDay,
    });
    currentStatusForDay = dailyStatus; // Carry over to next day's initial status
  }
  return dailyHistory;
}
