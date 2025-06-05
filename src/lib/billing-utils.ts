
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70;
const DAYS_IN_STANDARD_MONTH = 30;

// POLICY DOCUMENTATION: Date Handling
// Dates from Excel might come as "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD".
// All date parsing functions should robustly handle this by taking the first 10 characters ("YYYY-MM-DD").

/**
 * Checks if a string is a valid date in "YYYY-MM-DD" format (first 10 chars).
 * @param dateStr The date string to validate.
 * @returns True if the string is a valid date, false otherwise.
 */
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    const datePart = dateStr.substring(0, 10); // Work with the date part only
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { // Strict check for YYYY-MM-DD format
        return false;
    }
    const dateObj = parseISO(datePart);
    // Ensure that parseISO result matches the input string date part after formatting back
    // This catches invalid dates like "2023-02-30" which parseISO might adjust.
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd') === datePart;
};

/**
 * Parses a "YYYY-MM-DD" string (or the date part of "YYYY-MM-DD HH:MM:SS") into a UTC Date object.
 * Only considers the first 10 characters.
 * @param dateString The date string to parse.
 * @returns A Date object, or throws if parsing fails.
 */
const parseDate = (dateString: string): Date => {
  const datePart = dateString.substring(0, 10); // Extract "YYYY-MM-DD"
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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
 * POLICY DOCUMENTATION: Calculation of Billable Days
 * - Day of Installation: IS facturable. If a panel is installed on day X, day X counts.
 * - Day of Desinstallation: IS facturable. Panels are considered active for the entirety of their desinstallation day (e.g., desinstalled at 23:59).
 * - Multiple Events: This function relies on `panel.piv_instalado`, `panel.piv_desinstalado`, `panel.piv_reinstalado`.
 *   These fields should represent the primary billing cycle. Complex, multiple on/off events within a short period might require
 *   these fields to be updated to reflect the 'effective' latest billing cycle or for this function to be redesigned
 *   to process a full event history for the panel.
 * - Source of Truth: The PIV-specific date fields (`piv_instalado`, `piv_desinstalado`, `piv_reinstalado`) are prioritized.
 */
function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  
  // Ensure we only use the date part (YYYY-MM-DD) for parsing
  const pivInstallStr = panel.piv_instalado ? panel.piv_instalado.substring(0, 10) : null;
  const pivDesinstallStr = panel.piv_desinstalado ? panel.piv_desinstalado.substring(0, 10) : null;
  const pivReinstallStr = panel.piv_reinstalado ? panel.piv_reinstalado.substring(0, 10) : null;

  const pivInstallDate = pivInstallStr && isValidDateString(pivInstallStr)
    ? parseDate(pivInstallStr)
    : null;
  const pivDesinstallDate = pivDesinstallStr && isValidDateString(pivDesinstallStr)
    ? parseDate(pivDesinstallStr)
    : null;
  const pivReinstallDate = pivReinstallStr && isValidDateString(pivReinstallStr)
    ? parseDate(pivReinstallStr)
    : null;

  // If "PIV Instalado" is empty or invalid, the panel is never facturable based on these fields.
  if (!pivInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] PIV Billing: No valid piv_instalado date. Billable days: 0.`);
    return 0;
  }
  
  // console.log(`[Panel ${panel.codigo_parada}] PIV Billing for ${year}-${String(month).padStart(2,'0')}: (Nat Days In Month: ${actualDaysInBillingMonth})`, {
  //   piv_instalado_raw: panel.piv_instalado,
  //   piv_desinstalado_raw: panel.piv_desinstalado,
  //   piv_reinstalado_raw: panel.piv_reinstalado,
  //   parsed_pivInstallDate: pivInstallDate ? formatDateFns(pivInstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  //   parsed_pivDesinstallDate: pivDesinstallDate ? formatDateFns(pivDesinstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  //   parsed_pivReinstallDate: pivReinstallDate ? formatDateFns(pivReinstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  // });

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    // Rule 1: Must be on or after PIV Installation Date
    if (currentDate >= pivInstallDate) {
        isEffectivelyInstalledToday = true; 

        // Rule 2: Consider PIV Desinstallation
        // Panel is considered active ON its desinstallation day. Inactive AFTER.
        if (pivDesinstallDate && pivDesinstallDate >= pivInstallDate) {
            if (currentDate > pivDesinstallDate) { // Inactive strictly AFTER desinstallation day
                isEffectivelyInstalledToday = false; 
                
                // Rule 3: Consider PIV Reinstallation
                if (pivReinstallDate && pivReinstallDate > pivDesinstallDate) {
                    if (currentDate >= pivReinstallDate) {
                        isEffectivelyInstalledToday = true; 
                    }
                }
            }
        }
    }

    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
  }
  // console.log(`[Panel ${panel.codigo_parada}] PIV Billing Result for ${year}-${String(month).padStart(2,'0')}: ${billableDays} active days out of ${actualDaysInBillingMonth}`);
  return billableDays;
}


/**
 * POLICY DOCUMENTATION: Monthly Billing Calculation & UI Display
 * - Billing Standard: A standard billing month has 30 days (DAYS_IN_STANDARD_MONTH).
 * - Daily Rate: Calculated as MAX_MONTHLY_RATE / DAYS_IN_STANDARD_MONTH.
 * - Full Month Activity: If a panel is active for all natural days of a month (e.g., 31 days in May, 28 in Feb),
 *   it is billed for 30 standard days. UI shows "30 / 30". Amount = MAX_MONTHLY_RATE.
 * - Partial Month Activity: If a panel is active for fewer than the natural days of a month (due to mid-month
 *   installation/desinstallation), it is billed for the actual number of active days.
 *   UI shows "Actual Active Days / Natural Days in Month" (e.g., "15 / 31").
 *   Amount = Actual Active Days * Daily Rate.
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

  const actualActivityDays = calculateBillableDaysFromPIVDates(panel, year, month);

  let daysForBillingNumerator: number;
  let daysForBillingDenominator: number; // For UI display denominator

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    // Panel active for the entire natural month, bill as a standard 30-day month
    daysForBillingNumerator = DAYS_IN_STANDARD_MONTH;
    daysForBillingDenominator = DAYS_IN_STANDARD_MONTH; // UI shows "30 / 30"
  } else {
    // Panel active for part of the month
    daysForBillingNumerator = actualActivityDays;
    daysForBillingDenominator = actualDaysInBillingMonth; // UI shows "X / NaturalDays"
  }

  // Use the panel's specific monthly rate if available and valid, otherwise use the max rate
  // Note: panel.importe_mensual is set to 0 during import in DataProvider; this logic relies on MAX_MONTHLY_RATE.
  // If panel.importe_mensual were to be used, it should be parsed and validated.
  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual 
                              : MAX_MONTHLY_RATE;
  
  const dailyRate = finalBaseAmount / DAYS_IN_STANDARD_MONTH;
  const calculatedAmount = daysForBillingNumerator * dailyRate;
  const amount = parseFloat(calculatedAmount.toFixed(2));
  
  // console.log(`[BillingCalc ${panel.codigo_parada}] For ${year}-${String(month).padStart(2,'0')}: ActDays=${actualActivityDays}, NatDaysInM=${actualDaysInBillingMonth}, NumBill=${daysForBillingNumerator}, DenomUI=${daysForBillingDenominator}, BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
  return {
    panelId,
    year,
    month,
    billedDays: daysForBillingNumerator, 
    totalDaysInMonth: daysForBillingDenominator, 
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

  const panelEventsForThisPanel = allEvents
    .filter(event => event.panelId === panelId && event.date && isValidDateString(event.date))
    .sort((a, b) => {
        // Ensure dates are parsed correctly (substring for safety)
        const dateAStr = a.date ? a.date.substring(0,10) : null;
        const dateBStr = b.date ? b.date.substring(0,10) : null;
        if (!dateAStr || !dateBStr) return 0;
        const dateA = parseDate(dateAStr).getTime();
        const dateB = parseDate(dateBStr).getTime();
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB;
    });

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];

  // Use substring for safety, similar to calculateBillableDaysFromPIVDates
  const pivInstallStrHist = panel.piv_instalado ? panel.piv_instalado.substring(0, 10) : null;
  const pivDesinstallStrHist = panel.piv_desinstalado ? panel.piv_desinstalado.substring(0, 10) : null;
  const pivReinstallStrHist = panel.piv_reinstalado ? panel.piv_reinstalado.substring(0, 10) : null;

  const pivInstallDateForHist = pivInstallStrHist && isValidDateString(pivInstallStrHist) ? parseDate(pivInstallStrHist) : null;
  const pivDesinstallDateForHist = pivDesinstallStrHist && isValidDateString(pivDesinstallStrHist) ? parseDate(pivDesinstallStrHist) : null;
  const pivReinstallDateForHist = pivReinstallStrHist && isValidDateString(pivReinstallStrHist) ? parseDate(pivReinstallStrHist) : null;

  const statusTranslations: Record<PivPanelStatus, string> = {
    installed: "Instalado",
    removed: "Eliminado",
    maintenance: "Mantenimiento",
    pending_installation: "Pendiente Instalación",
    pending_removal: "Pendiente Eliminación",
    unknown: "Desconocido",
  };

  for (let day = 1; day <= actualDaysInMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const currentDateStr = formatDateFns(currentDate, 'yyyy-MM-dd', { locale: es });

    let eventNotesForDay = "";
    let isBillableTodayBasedOnPIV = false;
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';

    if (pivInstallDateForHist) { 
        if (currentDate >= pivInstallDateForHist) {
            isBillableTodayBasedOnPIV = true;
            pivDerivedStatusToday = 'installed';

            if (pivDesinstallDateForHist && pivDesinstallDateForHist >= pivInstallDateForHist) {
                 // Day of deinstall is billable, inactive strictly AFTER
                if (currentDate > pivDesinstallDateForHist) { 
                    isBillableTodayBasedOnPIV = false;
                    pivDerivedStatusToday = 'removed';

                    if (pivReinstallDateForHist && pivReinstallDateForHist > pivDesinstallDateForHist) {
                        if (currentDate >= pivReinstallDateForHist) {
                            isBillableTodayBasedOnPIV = true;
                            pivDerivedStatusToday = 'installed';
                        }
                    }
                }
            }
        } else { 
             pivDerivedStatusToday = 'pending_installation';
             isBillableTodayBasedOnPIV = false;
        }
    } else { 
        pivDerivedStatusToday = panel.status || 'unknown'; 
        isBillableTodayBasedOnPIV = false;
    }


    let finalStatusForDisplay = pivDerivedStatusToday;
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => {
        const eventDateStr = event.date ? event.date.substring(0,10) : null;
        if (!eventDateStr) return false;
        return formatDateFns(parseDate(eventDateStr), 'yyyy-MM-dd', { locale: es }) === currentDateStr;
    });

    if (eventsOnThisDay.length > 0) {
      const latestEventToday = eventsOnThisDay[eventsOnThisDay.length - 1];
      finalStatusForDisplay = latestEventToday.newStatus; 
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'Inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = statusTranslations[finalStatusForDisplay] || finalStatusForDisplay;
      if (finalStatusForDisplay === 'pending_installation' && pivInstallDateForHist && currentDate < pivInstallDateForHist) {
          eventNotesForDay = `Pendiente Instalación (Programada: ${formatDateFns(pivInstallDateForHist, 'dd/MM/yyyy', { locale: es })})`;
      }
    }

    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDisplay,
      isBillable: isBillableTodayBasedOnPIV,
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}

    