
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70;
const DAYS_IN_STANDARD_MONTH = 30;


/**
 * Validates if a string is a valid date in "YYYY-MM-DD" format.
 * Robust to inputs like "YYYY-MM-DD HH:MM:SS" by checking only the first 10 characters.
 * @param dateStr The date string to validate.
 * @returns True if the string's date part is a valid "YYYY-MM-DD" date, false otherwise.
 */
export const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    const datePart = dateStr.trim().substring(0, 10); 
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
        return false;
    }
    const dateObj = parseISO(datePart);
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd') === datePart;
};

/**
 * Parses a "YYYY-MM-DD" string (or the date part of "YYYY-MM-DD HH:MM:SS") into a UTC Date object.
 * Returns null if the date string is invalid or cannot be parsed.
 * @param dateStr The date string to validate and parse.
 * @returns A Date object or null.
 */
export const parseAndValidateDate = (dateStr: any): Date | null => {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
    return null;
  }
  
  const datePart = dateStr.trim().substring(0, 10);
  if (!isValidDateString(datePart)) { // isValidDateString ya valida el formato YYYY-MM-DD
    // console.warn(`[parseAndValidateDate] Invalid date string format or content: '${dateStr}' (checked part: '${datePart}')`);
    return null;
  }
  
  try {
    const [year, month, day] = datePart.split('-').map(Number);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      // console.warn(`[parseAndValidateDate] Invalid components after split: ${datePart}`);
      return null;
    }
    
    // Create Date in UTC to avoid timezone issues with date comparisons
    const date = new Date(Date.UTC(year, month - 1, day));
    
    if (isValid(date) && 
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day) {
      return date;
    } else {
      // console.warn(`[parseAndValidateDate] Date object invalid or components rolled over for: ${datePart}`);
      return null;
    }
  } catch (error) {
    // console.warn(`[parseAndValidateDate] Error parsing date string: '${dateStr}'`, error);
    return null;
  }
};


export interface BillingRecord {
  panelId: string;
  year: number;
  month: number;
  billedDays: number;
  totalDaysInMonth: number;
  amount: number;
  panelDetails?: Panel;
}


/**
 * POLICY DOCUMENTATION: Date Handling & Billing Logic for calculateBillableDaysUsingHistory
 * - Date Source: This function uses `panel.piv_instalado` for the initial installation.
 *   Subsequent periods of activity/inactivity are determined by an ordered list of `panelEvents`
 *   (DESINSTALACION, REINSTALACION).
 * - Date Formatting: Expects date strings as "YYYY-MM-DD". parseAndValidateDate handles trimming time.
 * - Day of Installation (`piv_instalado`): IS billable.
 * - Day of Desinstallation (from event): IS billable. Panel considered active for the entirety of this day.
 * - Day of Reinstallation (from event): IS billable.
 * - `piv_instalado` is Mandatory: If `panel.piv_instalado` is missing/invalid, 0 billable days.
 * - Multiple Events: Handles multiple desinstall/reinstall cycles within the month based on sorted events.
 */
export function calculateBillableDaysUsingHistory(
  panel: Panel,
  year: number,
  month: number,
  eventsForPanel: PanelEvent[] // Eventos ordenados por fecha ASC para este panel
): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const initialInstallDate = parseAndValidateDate(panel.piv_instalado);

  if (!initialInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] BillableDaysUsingHistory: No valid piv_instalado. Days: 0.`);
    return 0;
  }

  let billableDays = 0;

  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    if (currentDate < initialInstallDate) {
      isEffectivelyInstalledToday = false; // Aún no instalado
    } else {
      // Por defecto, está instalado si es igual o posterior a la fecha de instalación inicial
      isEffectivelyInstalledToday = true; 
      
      // Aplicar eventos para determinar el estado real del día
      // Los eventos deben estar ordenados por fecha ASC
      let lastEventStatusIsInstalled = true; // Estado después de la instalación inicial

      for (const event of eventsForPanel) {
        const eventDate = parseAndValidateDate(event.fecha);
        if (!eventDate || eventDate > currentDate) {
          // Evento futuro o inválido, no afecta al estado de hoy todavía
          break; 
        }

        // El evento es hoy o en el pasado y afecta el estado desde eventDate en adelante
        if (event.tipo === "DESINSTALACION") {
          // Si el evento de desinstalación es HOY, el panel SÍ está activo hoy.
          // Se vuelve inactivo el DÍA DESPUÉS de la desinstalación.
          // Por tanto, si eventDate < currentDate, el panel estuvo desinstalado.
          if (eventDate < currentDate) {
            lastEventStatusIsInstalled = false;
          } else { // eventDate === currentDate
            lastEventStatusIsInstalled = true; // Activo el día de la desinstalación
          }
        } else if (event.tipo === "REINSTALACION") {
          // Si el evento de reinstalación es hoy o antes, está instalado.
           if (eventDate <= currentDate) {
             lastEventStatusIsInstalled = true;
           }
        }
      }
      isEffectivelyInstalledToday = lastEventStatusIsInstalled;
    }
    
    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
  }
  // console.log(`[Panel ${panel.codigo_parada}] BillableDaysUsingHistory for ${year}-${String(month).padStart(2,'0')}: ${billableDays} days.`);
  return billableDays;
}


/**
 * POLICY DOCUMENTATION: Monthly Billing Calculation & UI Display (calculateMonthlyBillingForPanel)
 * - Billing Standard: A standard billing month has 30 days (DAYS_IN_STANDARD_MONTH).
 * - Daily Rate: Calculated as MAX_MONTHLY_RATE / DAYS_IN_STANDARD_MONTH.
 * - Full Month Activity: If a panel is active for all natural days of a month,
 *   it is billed for 30 standard days. UI shows "30 / 30". Amount = MAX_MONTHLY_RATE.
 * - Partial Month Activity: If a panel is active for fewer than the natural days,
 *   it is billed for the actual number of active days.
 *   UI shows "Actual Active Days / Natural Days in Month". Amount = Actual Active Days * Daily Rate.
 */
export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number,
  allEvents: PanelEvent[], 
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const eventsForThisPanel = allEvents.filter(e => e.panelId === panelId);
  const actualActivityDays = calculateBillableDaysUsingHistory(panel, year, month, eventsForThisPanel);
  
  let daysForBillingAndDisplayNumerator: number;
  let daysForBillingAndDisplayDenominator: number; // Para la UI

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    daysForBillingAndDisplayNumerator = DAYS_IN_STANDARD_MONTH;
    daysForBillingAndDisplayDenominator = DAYS_IN_STANDARD_MONTH; // Mostrar como "30/30"
  } else {
    daysForBillingAndDisplayNumerator = actualActivityDays;
    daysForBillingAndDisplayDenominator = actualDaysInBillingMonth; // Mostrar como "X / DíasRealesDelMes"
  }
  
  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual 
                              : MAX_MONTHLY_RATE;
  
  const dailyRate = finalBaseAmount / DAYS_IN_STANDARD_MONTH;
  const calculatedAmount = daysForBillingAndDisplayNumerator * dailyRate;
  const amount = parseFloat(calculatedAmount.toFixed(2));
  
  // console.log(`[BillingCalc ${panel.codigo_parada}] For ${year}-${String(month).padStart(2,'0')}: ActDays=${actualActivityDays}, NatDaysInM=${actualDaysInBillingMonth}, DaysForBillNum=${daysForBillingAndDisplayNumerator}, DaysForBillDenom=${daysForBillingAndDisplayDenominator}, BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
  return {
    panelId,
    year,
    month,
    billedDays: daysForBillingAndDisplayNumerator, 
    totalDaysInMonth: daysForBillingAndDisplayDenominator, 
    amount,
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
  month: number,
  allEvents: PanelEvent[],
  allPanels: Panel[]
): DayStatus[] {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  if (!panel) return [];

  const initialInstallDate = parseAndValidateDate(panel.piv_instalado);
  const eventsForThisPanel = allEvents
    .filter(event => event.panelId === panelId && parseAndValidateDate(event.fecha))
    .sort((a,b) => parseAndValidateDate(a.fecha)!.getTime() - parseAndValidateDate(b.fecha)!.getTime()); //ASC

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  
  const statusTranslations: Record<PivPanelStatus, string> = {
    'installed': 'Instalado',
    'removed': 'Eliminado',
    'maintenance': 'Mantenimiento',
    'pending_installation': 'Pendiente Instalación',
    'pending_removal': 'Pendiente Eliminación',
    'unknown': 'Desconocido'
  };

  for (let day = 1; day <= actualDaysInMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const currentDateStr = formatDateFns(currentDate, 'yyyy-MM-dd', { locale: es });

    let isBillableToday = false;
    let effectiveStatusToday: PivPanelStatus = 'unknown';
    let eventNotesForDay = "";

    if (!initialInstallDate) {
        effectiveStatusToday = 'unknown';
        isBillableToday = false;
    } else if (currentDate < initialInstallDate) {
        effectiveStatusToday = 'pending_installation';
        isBillableToday = false;
    } else { // currentDate >= initialInstallDate
        effectiveStatusToday = 'installed'; // Por defecto
        isBillableToday = true;

        let lastEventStatusIsInstalled = true;
        for (const event of eventsForThisPanel) {
            const eventDate = parseAndValidateDate(event.fecha);
            if (!eventDate || eventDate > currentDate) break;

            if (event.tipo === "DESINSTALACION") {
                // Si el evento de desinstalación es HOY, el panel SÍ está activo hoy.
                // Se vuelve inactivo el DÍA DESPUÉS de la desinstalación.
                if (eventDate < currentDate) {
                    lastEventStatusIsInstalled = false;
                } else { // eventDate === currentDate
                    lastEventStatusIsInstalled = true; 
                }
            } else if (event.tipo === "REINSTALACION") {
                 if (eventDate <= currentDate) {
                    lastEventStatusIsInstalled = true;
                 }
            }
        }
        isBillableToday = lastEventStatusIsInstalled;
        effectiveStatusToday = lastEventStatusIsInstalled ? 'installed' : 'removed';
    }
    
    // Notas de evento
    const eventsOnThisExactDay = eventsForThisPanel.filter(e => e.fecha === currentDateStr);
    if (eventsOnThisExactDay.length > 0) {
        eventNotesForDay = eventsOnThisExactDay.map(e => {
            const typeDisplay = e.tipo === "DESINSTALACION" ? "Desinstalación" : "Reinstalación";
            // Si el estado derivado ya es 'installed' o 'removed', no repetir "Instalado" o "Eliminado"
            // a menos que haya una nota específica del evento.
            let note = typeDisplay;
            if (e.notes) note += `: ${e.notes}`;
            else if (effectiveStatusToday === 'installed' && e.tipo === "REINSTALACION") note = "Reinstalado";
            else if (effectiveStatusToday === 'removed' && e.tipo === "DESINSTALACION") note = "Desinstalado";

            return note;
        }).join('; ');
        
        // El último evento del día podría definir el estado final visible si hay múltiples
        const lastEventTypeToday = eventsOnThisExactDay[eventsOnThisExactDay.length -1].tipo;
        effectiveStatusToday = lastEventTypeToday === "REINSTALACION" ? "installed" : "removed";

    } else {
        eventNotesForDay = statusTranslations[effectiveStatusToday] || effectiveStatusToday;
         if (effectiveStatusToday === 'pending_installation' && initialInstallDate && currentDate < initialInstallDate) {
          eventNotesForDay = `Pendiente Instalación (Programada: ${formatDateFns(initialInstallDate, 'dd/MM/yyyy', { locale: es })})`;
      }
    }
    // Si no hay instalación inicial, el estado no puede ser 'instalado' o 'removido' por defecto
     if (!initialInstallDate && (effectiveStatusToday === 'installed' || effectiveStatusToday === 'removed')) {
        effectiveStatusToday = 'unknown';
        isBillableToday = false; // Asegurar no facturable
    }


    dailyHistory.push({
      date: currentDateStr,
      status: effectiveStatusToday,
      isBillable: isBillableToday,
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}
