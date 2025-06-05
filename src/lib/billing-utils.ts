
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

/**
 * Validates and parses a date string (potentially "YYYY-MM-DD HH:MM:SS") into a UTC Date object.
 * Returns null if the date string is invalid or cannot be parsed.
 * @param dateStr The date string to validate and parse.
 * @returns A Date object or null.
 */
const parseAndValidateDate = (dateStr: any): Date | null => {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
    return null;
  }
  // isValidDateString already handles substring(0,10) internally for validation
  if (!isValidDateString(dateStr)) {
    return null;
  }
  
  try {
    // We are sure it's a valid "YYYY-MM-DD" (potentially with time part) due to isValidDateString
    const datePart = dateStr.trim().substring(0, 10);
    const [year, month, day] = datePart.split('-').map(Number);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      // console.warn(`[parseAndValidateDate] Invalid components after split: ${datePart}`);
      return null;
    }
    
    const date = new Date(Date.UTC(year, month - 1, day));
    // Final check to ensure the date components didn't roll over (e.g. 2023-02-30 -> 2023-03-02)
    // and that the created date matches the input date parts
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
 * POLICY DOCUMENTATION: Calculation of Billable Days from PIV-specific Dates
 * - Date Source: This function STRICTLY uses `panel.piv_instalado`, `panel.piv_desinstalado`, and `panel.piv_reinstalado`.
 *   It does NOT use `panel.installationDate` (general installation) or an event history for this calculation.
 *   These PIV-specific fields should represent the definitive billing cycle.
 * - Date Formatting: Expects date strings like "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS".
 *   Only the "YYYY-MM-DD" part is used. Invalid formats or empty PIV date fields will result in non-billable periods.
 * - Day of Installation (`piv_instalado`): IS facturable. If a panel is installed on day X, day X counts.
 * - Day of Desinstallation (`piv_desinstalado`): IS facturable. Panels are considered active for the entirety of their
 *   desinstallation day (e.g., assumed desinstalled at 23:59 for billing).
 * - `piv_instalado` is Mandatory: If `piv_instalado` is missing or invalid, the panel is NEVER facturable by this logic.
 * - Reinstallation (`piv_reinstalado`): If present and valid, billing resumes from this date (inclusive),
 *   only if `piv_reinstalado` is AFTER `piv_desinstalado`.
 */
function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  
  const pivInstallDate = parseAndValidateDate(panel.piv_instalado);
  const pivDesinstallDate = parseAndValidateDate(panel.piv_desinstalado);
  const pivReinstallDate = parseAndValidateDate(panel.piv_reinstalado);

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
        // Panel is considered active ON its desinstallation day. Inactive strictly AFTER.
        if (pivDesinstallDate && pivDesinstallDate >= pivInstallDate) {
            if (currentDate > pivDesinstallDate) { // Inactive strictly AFTER desinstallation day
                isEffectivelyInstalledToday = false; 
                
                // Rule 3: Consider PIV Reinstallation
                // Reinstallation must be after desinstallation to be valid.
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
 * - Zero Rate: If panel.importe_mensual is 0 or not set, MAX_MONTHLY_RATE is used.
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

  let daysForBillingAndDisplayNumerator: number;
  let daysForBillingAndDisplayDenominator: number;

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    // Panel active for the entire natural month, bill as a standard 30-day month
    // And display as "30 / 30"
    daysForBillingAndDisplayNumerator = DAYS_IN_STANDARD_MONTH;
    daysForBillingAndDisplayDenominator = DAYS_IN_STANDARD_MONTH;
  } else {
    // Panel active for part of the month
    // Bill for actual active days, display as "Actual Active / Natural Days in Month"
    daysForBillingAndDisplayNumerator = actualActivityDays;
    daysForBillingAndDisplayDenominator = actualDaysInBillingMonth;
  }
  
  // Use the panel's specific monthly rate if available and valid (from importe_mensual_original after parsing), otherwise use the max rate.
  // panel.importe_mensual is intentionally set to 0 during initial import for calculation standardization.
  // The original Excel value is in panel.importe_mensual_original.
  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual 
                              : MAX_MONTHLY_RATE;
  
  const dailyRate = finalBaseAmount / DAYS_IN_STANDARD_MONTH;
  const calculatedAmount = daysForBillingAndDisplayNumerator * dailyRate;
  const amount = parseFloat(calculatedAmount.toFixed(2));
  
  // console.log(`[BillingCalc ${panel.codigo_parada}] For ${year}-${String(month).padStart(2,'0')}: ActDays=${actualActivityDays}, NatDaysInM=${actualDaysInBillingMonth}, NumBill=${daysForBillingAndDisplayNumerator}, DenomUI=${daysForBillingAndDisplayDenominator}, BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
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

  const panelEventsForThisPanel = allEvents
    .filter(event => event.panelId === panelId && event.date && isValidDateString(event.date))
    .sort((a, b) => {
        const dateA = parseAndValidateDate(a.date)?.getTime() ?? 0;
        const dateB = parseAndValidateDate(b.date)?.getTime() ?? 0;
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateA - dateB;
    });

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];

  const pivInstallDateForHist = parseAndValidateDate(panel.piv_instalado);
  const pivDesinstallDateForHist = parseAndValidateDate(panel.piv_desinstalado);
  const pivReinstallDateForHist = parseAndValidateDate(panel.piv_reinstalado);

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
        const eventDate = parseAndValidateDate(event.date);
        if (!eventDate) return false;
        return formatDateFns(eventDate, 'yyyy-MM-dd', { locale: es }) === currentDateStr;
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

    
