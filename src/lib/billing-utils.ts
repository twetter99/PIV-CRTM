
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
    
    // Take only the first 10 characters for "YYYY-MM-DD" part
    const datePart = dateStr.trim().substring(0, 10); 

    // Regex check for YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
        // console.warn(`[isValidDateString] Regex failed for datePart: '${datePart}' from original: '${dateStr}'`);
        return false;
    }
    
    // Check if it's a valid date using date-fns
    const dateObj = parseISO(datePart);
    const isValidDate = isValid(dateObj);
    const isSameWhenFormatted = formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === datePart;

    // if (!isValidDate) console.warn(`[isValidDateString] date-fns isValid failed for datePart: '${datePart}'`);
    // if (isValidDate && !isSameWhenFormatted) console.warn(`[isValidDateString] date-fns format mismatch for datePart: '${datePart}'`);
    
    return isValidDate && isSameWhenFormatted;
};

/**
 * Parses a "YYYY-MM-DD" string (or the date part of "YYYY-MM-DD HH:MM:SS") into a UTC Date object.
 * Returns null if the date string is invalid or cannot be parsed.
 * @param dateStr The date string to validate and parse.
 * @returns A Date object or null.
 */
export const parseAndValidateDate = (dateStr: any): Date | null => {
  if (!isValidDateString(dateStr)) { // isValidDateString already handles undefined, null, empty strings, and format.
    // console.warn(`[parseAndValidateDate] isValidDateString returned false for: '${dateStr}'`);
    return null;
  }
  
  try {
    // isValidDateString confirmed dateStr is a string and its first 10 chars are YYYY-MM-DD
    const datePart = (dateStr as string).trim().substring(0, 10);
    const [year, month, day] = datePart.split('-').map(Number);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      // console.warn(`[parseAndValidateDate] Invalid components after split: ${datePart}`);
      return null;
    }
    
    // Create Date in UTC to avoid timezone issues with date comparisons
    const date = new Date(Date.UTC(year, month - 1, day));
    
    // Final check for validity and component integrity (e.g. "2023-02-30" would be invalid)
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
 * POLICY DOCUMENTATION: Date Handling & Billing Logic for calculateBillableDaysFromPanelPivDates
 * Calculates active billable days for a panel in a given month based on its PIV date fields.
 * - Date Source: Relies on `panel.piv_instalado`, `panel.piv_desinstalado`, and `panel.piv_reinstalado`.
 * - Date Formatting: Expects date strings as "YYYY-MM-DD" (or "YYYY-MM-DD HH:MM:SS", will take first 10 chars).
 * - Day of Installation (`piv_instalado`): IS billable.
 * - Day of Desinstallation (`piv_desinstalado`): IS billable. Panel considered active for this entire day.
 * - Day of Reinstallation (`piv_reinstalado`): IS billable.
 * - `piv_instalado` Mandatory: If `panel.piv_instalado` is missing/invalid, 0 billable days are returned.
 * - Logic Hierarchy:
 *   1. No `piv_instalado`: 0 days.
 *   2. All three dates present (`inst`, `desinst`, `reinst` where `reinst > desinst`):
 *      Active if (day is in `[inst, desinst]` inclusive) OR (day is >= `reinst`).
 *   3. `inst` and `desinst` present (no `reinst`, or `reinst` is not after `desinst`):
 *      Active if day is in `[inst, desinst]` inclusive.
 *   4. `inst` and `reinst` present (no `desinst`):
 *      Active if day is >= `reinst`. (The period from `inst` to `reinst-1` is NOT billed).
 *   5. Only `inst` present:
 *      Active if day is >= `inst`.
 */
export function calculateBillableDaysFromPanelPivDates(
  panel: Panel,
  year: number,
  month: number 
): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  
  const installDate = parseAndValidateDate(panel.piv_instalado);
  const desinstallDate = parseAndValidateDate(panel.piv_desinstalado);
  const reinstallDate = parseAndValidateDate(panel.piv_reinstalado);

  if (!installDate) {
    // console.log(`[Panel ${panel.codigo_parada}] BillableDaysFromPivDates: No valid piv_instalado. Days: 0.`);
    return 0;
  }

  let billableDays = 0;

  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isActiveToday = false;

    // Apply hierarchical rules based on available PIV dates
    if (desinstallDate && reinstallDate) { // Potentially all three dates case
        if (reinstallDate > desinstallDate) { // Logical sequence for desinstall and reinstall
            if ((currentDate >= installDate && currentDate <= desinstallDate) || (currentDate >= reinstallDate)) {
                isActiveToday = true;
            }
        } else { // Reinstall date is not after desinstall date, treat as if no valid reinstall for this logic
            if (currentDate >= installDate && currentDate <= desinstallDate) {
                isActiveToday = true;
            }
            // console.warn(`Panel ${panel.codigo_parada} for ${year}-${month}: Reinstall date '${panel.piv_reinstalado}' is not after desinstall date '${panel.piv_desinstalado}'. Reinstallation ignored for this billing period calculation.`);
        }
    } else if (desinstallDate) { // Install and Desinstall only
        if (currentDate >= installDate && currentDate <= desinstallDate) {
            isActiveToday = true;
        }
    } else if (reinstallDate) { // Install and Reinstall only (no desinstall)
        // Rule: "Si [reinstalado] ... se facturarán los días desde la fecha de reinstalación"
        // This means the original installDate before this reinstallDate is not billed if they differ.
        if (currentDate >= reinstallDate) {
            isActiveToday = true;
        }
        // If installDate was "2023-01-01" and reinstallDate "2023-01-15", days 1-14 are not active by this rule.
    } else { // Only Install date is present
        if (currentDate >= installDate) {
            isActiveToday = true;
        }
    }
    
    if (isActiveToday) {
      billableDays++;
    }
  }
  // console.log(`[Panel ${panel.codigo_parada}] BillableDaysFromPivDates for ${year}-${String(month).padStart(2,'0')}: ${billableDays} days.`);
  return billableDays;
}


/**
 * POLICY DOCUMENTATION: Monthly Billing Calculation & UI Display (calculateMonthlyBillingForPanel)
 * - Billing Standard: A standard billing month has 30 days (DAYS_IN_STANDARD_MONTH).
 * - Daily Rate: Calculated as (panel.importe_mensual || MAX_MONTHLY_RATE) / DAYS_IN_STANDARD_MONTH.
 * - Billable Days Source: Uses `calculateBillableDaysFromPanelPivDates`.
 * - Full Month Activity: If a panel is active for all natural days of a month
 *   (as determined by `calculateBillableDaysFromPanelPivDates`), it is billed for 30 standard days.
 *   UI shows "30 / 30". Amount = (panel.importe_mensual || MAX_MONTHLY_RATE).
 * - Partial Month Activity: If a panel is active for fewer than the natural days,
 *   it is billed for the actual number of active days.
 *   UI shows "Actual Active Days / 30". Amount = Actual Active Days * Daily Rate.
 */
export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number,
  allEvents: PanelEvent[], // Kept for potential future use or consistency, but not used by calculateBillableDaysFromPanelPivDates
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  // Calculate actual activity days using the PIV date fields from the panel object
  const actualActivityDays = calculateBillableDaysFromPanelPivDates(panel, year, month);
  
  let daysForBillingAndDisplayNumerator: number;
  // Denominator for UI display is always 30 as per new UX requirement
  const daysForBillingAndDisplayDenominator: number = DAYS_IN_STANDARD_MONTH; 

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    // If active for all natural days, bill for the standard 30 days.
    daysForBillingAndDisplayNumerator = DAYS_IN_STANDARD_MONTH;
  } else {
    // If active for partial month, bill for actual active days.
    daysForBillingAndDisplayNumerator = actualActivityDays;
  }
  
  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual 
                              : MAX_MONTHLY_RATE;
  
  const dailyRate = finalBaseAmount / DAYS_IN_STANDARD_MONTH;
  const calculatedAmount = daysForBillingAndDisplayNumerator * dailyRate;
  const amount = parseFloat(calculatedAmount.toFixed(2));
  
  // console.log(`[BillingCalc ${panel.codigo_parada}] For ${year}-${String(month).padStart(2,'0')}: ActualActDays=${actualActivityDays}, NatDaysInMonth=${actualDaysInBillingMonth}, BillableDaysNum=${daysForBillingAndDisplayNumerator}, DenomUI=${daysForBillingAndDisplayDenominator}, BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
  return {
    panelId,
    year,
    month,
    billedDays: daysForBillingAndDisplayNumerator, 
    totalDaysInMonth: daysForBillingAndDisplayDenominator, // For UI, always 30
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
  allEvents: PanelEvent[], // Unused for daily status logic if based on PIV fields
  allPanels: Panel[]
): DayStatus[] {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  if (!panel) return [];

  const installDate = parseAndValidateDate(panel.piv_instalado);
  const desinstallDate = parseAndValidateDate(panel.piv_desinstalado);
  const reinstallDate = parseAndValidateDate(panel.piv_reinstalado);

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  
  const statusTranslations: Record<PivPanelStatus, string> = {
    'installed': 'Instalado',
    'removed': 'Eliminado',
    'maintenance': 'Mantenimiento', // This status type is not directly derivable from PIV dates alone
    'pending_installation': 'Pendiente Instalación',
    'pending_removal': 'Pendiente Eliminación', // Not directly derivable
    'unknown': 'Desconocido'
  };

  for (let day = 1; day <= actualDaysInMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const currentDateStr = formatDateFns(currentDate, 'yyyy-MM-dd', { locale: es });

    let isBillableToday = false;
    let effectiveStatusToday: PivPanelStatus = 'unknown';
    let notesForDay = "";

    if (!installDate) {
        effectiveStatusToday = 'unknown';
        isBillableToday = false;
        notesForDay = statusTranslations.unknown;
    } else {
        // Determine isActiveToday using the same hierarchical logic as calculateBillableDaysFromPanelPivDates
        if (desinstallDate && reinstallDate) {
            if (reinstallDate > desinstallDate) {
                if ((currentDate >= installDate && currentDate <= desinstallDate) || (currentDate >= reinstallDate)) {
                    isBillableToday = true;
                }
            } else {
                if (currentDate >= installDate && currentDate <= desinstallDate) {
                    isBillableToday = true;
                }
            }
        } else if (desinstallDate) {
            if (currentDate >= installDate && currentDate <= desinstallDate) {
                isBillableToday = true;
            }
        } else if (reinstallDate) {
            if (currentDate >= reinstallDate) {
                isBillableToday = true;
            }
        } else { // Only Install date
            if (currentDate >= installDate) {
                isBillableToday = true;
            }
        }

        // Determine status based on isActiveToday and relation to installDate
        if (currentDate < installDate) {
            effectiveStatusToday = 'pending_installation';
            notesForDay = `${statusTranslations.pending_installation} (Programada: ${formatDateFns(installDate, 'dd/MM/yyyy', { locale: es })})`;
        } else {
            effectiveStatusToday = isBillableToday ? 'installed' : 'removed';
            notesForDay = statusTranslations[effectiveStatusToday];
        }
    }
    
    // Simplistic notes based on PIV fields for the day.
    // If specific events from PanelEvent[] were to be overlayed, this would be more complex.
    if (currentDate.getTime() === installDate?.getTime()) notesForDay = `PIV Instalado (${notesForDay})`;
    if (currentDate.getTime() === desinstallDate?.getTime()) notesForDay = `PIV Desinstalado (${notesForDay})`;
    if (currentDate.getTime() === reinstallDate?.getTime()) notesForDay = `PIV Reinstalado (${notesForDay})`;


    dailyHistory.push({
      date: currentDateStr,
      status: effectiveStatusToday,
      isBillable: isBillableToday,
      eventNotes: notesForDay,
    });
  }
  return dailyHistory;
}

