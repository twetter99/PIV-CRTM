
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv"; // Renamed to avoid conflict

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV

// Helper to format date to YYYY-MM-DD
const formatDate = (date: Date): string => date.toISOString().split('T')[0];
// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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
 * CASOS DE PRUEBA PARA calculateMonthlyBillingForPanel (asumiendo baseMonthlyAmount = 37.70):
 * - PIV instalado 30 días en un mes de 30 días = €37,70
 * - PIV instalado 15 días en un mes de 30 días = €18,85 (15 * (37.70 / 30))
 * - PIV instalado 1 día en un mes de 30 días = €1,26 (1 * (37.70 / 30))
 * - PIV no instalado (0 días) = €0,00
 * - PIV instalado 31 días en un mes de 31 días = €37,70 (máximo)
 * - PIV instalado 15 días en un mes de 31 días = €18.24 (15 * (37.70 / 31))
 * - PIV instalado 28 días en un mes de 28 días (Feb) = €37.70
 */
export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[],
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const daysInMonth = new Date(year, month, 0).getDate();

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: daysInMonth, amount: 0, panelDetails: undefined };
  }

  const historyForMonth = getPanelHistoryForBillingMonth(panelId, year, month, allEvents, allPanels);
  const billedDays = historyForMonth.filter(day => day.isBillable).length;

  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;

  let calculatedAmount = 0;
  if (billedDays > 0) {
    if (billedDays >= daysInMonth) { // Installed for the whole month or more (e.g. if month has 28 days and panel installed 28, 29, 30, or 31 days)
      calculatedAmount = baseMonthlyAmount;
    } else {
      const dailyRateForThisMonth = baseMonthlyAmount / daysInMonth;
      calculatedAmount = dailyRateForThisMonth * billedDays;
    }
  }

  return {
    panelId,
    year,
    month,
    billedDays,
    totalDaysInMonth: daysInMonth,
    amount: Math.round(calculatedAmount * 100) / 100, // Facturación proporcional redondeada
    panelDetails: panel,
  };
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

  const panelEvents = allEvents
    .filter(event => event.panelId === panelId)
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyHistory: DayStatus[] = [];
  let currentStatus: PivPanelStatus = 'unknown';

  // Determine status at the beginning of the month
  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);
  const eventsBeforeMonth = panelEvents.filter(event => parseDate(event.date) < monthStartDate);
  
  if (eventsBeforeMonth.length > 0) {
    currentStatus = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else if (panel.installationDate && isValidDateString(panel.installationDate) && parseDate(panel.installationDate) < monthStartDate) {
    // If installed before this month and no superseding events, assume initial status or 'installed'
    currentStatus = panel.status; // Or panel.status if it reflects the true initial status
    if (currentStatus === 'pending_installation' || currentStatus === 'unknown') currentStatus = 'installed'; // Default to installed if initial status is pending but installation date is past.
  } else if (panel.installationDate && isValidDateString(panel.installationDate) && parseDate(panel.installationDate).getUTCFullYear() === year && parseDate(panel.installationDate).getUTCMonth() + 1 === month) {
    // If installed this month, but before day 1 (should not happen if date is correct), or if it's pending and install date is in future.
    // This case is mostly handled by daily iteration.
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

    const eventsOnThisDay = panelEvents.filter(event => parseDate(event.date).getTime() === currentDate.getTime());

    if (eventsOnThisDay.length > 0) {
      currentStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus;
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else if (panel.installationDate && isValidDateString(panel.installationDate) && parseDate(panel.installationDate).getTime() === currentDate.getTime()) {
      // If today is the installation date and no other event, set to installed (or its initial imported status if not pending)
       if (panel.status !== 'removed' && panel.status !== 'maintenance') { // If it was imported as installed or pending
            currentStatus = 'installed';
            eventNotesForDay = eventNotesForDay ? eventNotesForDay + "; Panel Instalado" : "Panel Instalado";
       } else { // If imported as something else like removed/maintenance, that status persists until an event changes it
            currentStatus = panel.status;
             eventNotesForDay = eventNotesForDay ? eventNotesForDay + `; Estado inicial: ${statusTranslations[panel.status]}` : `Estado inicial: ${statusTranslations[panel.status]}`;
       }
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: currentStatus,
      isBillable: currentStatus === 'installed',
      eventNotes: eventNotesForDay || (currentStatus !== 'unknown' ? `Estado: ${statusTranslations[currentStatus]}` : 'Sin evento específico'),
    });
  }
  return dailyHistory;
}

// Helper to check if a string is a valid date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string') return false;
    // Regex to check for YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.sssZ
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(dateStr)) {
        return false;
    }
    const date = new Date(dateStr);
    // Check if the date object is valid and the parsed date string matches the input (to avoid issues with invalid dates like 2023-02-30)
    return !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr.substring(0,10));
};

