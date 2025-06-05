
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
        // console.warn(`[isValidDateString] Regex failed for datePart: '${datePart}' from original: '${dateStr}'`);
        return false;
    }
    
    const dateObj = parseISO(datePart);
    const isValidDate = isValid(dateObj);
    // Ensure that when formatted back, it matches the input part, to catch things like "2023-02-30" which parseISO might adjust.
    const isSameWhenFormatted = isValidDate && formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === datePart;
    
    return isSameWhenFormatted;
};

/**
 * Parses a "YYYY-MM-DD" string (or the date part of "YYYY-MM-DD HH:MM:SS") into a UTC Date object.
 * Returns null if the date string is invalid or cannot be parsed.
 * Includes robust checking of year, month, day components after parsing.
 * @param dateStr The date string to validate and parse.
 * @returns A Date object or null.
 */
export const parseAndValidateDate = (dateStr: any): Date | null => {
  if (!isValidDateString(dateStr)) { // isValidDateString handles undefined, null, empty, format, and basic validity.
    // console.warn(`[parseAndValidateDate] isValidDateString returned false for: '${dateStr}'`);
    return null;
  }
  
  try {
    const datePart = (dateStr as string).trim().substring(0, 10); // Ensured by isValidDateString
    const [year, month, day] = datePart.split('-').map(Number);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      // console.warn(`[parseAndValidateDate] Invalid components after split: ${datePart}`);
      return null;
    }
    
    // Create Date in UTC to avoid timezone issues with date comparisons
    const date = new Date(Date.UTC(year, month - 1, day)); // month is 0-indexed
    
    // Final check for validity and component integrity (e.g., "2023-02-30" would have been caught by isValidDateString's format check)
    // This check ensures Date constructor didn't roll over (e.g. March 0 becomes Feb 28/29)
    if (isValid(date) && 
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 && // month is 0-indexed
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
 *   Uses `parseAndValidateDate` for robust parsing.
 * - Day of Installation (`piv_instalado`): IS billable.
 * - Day of Desinstallation (`piv_desinstalado`): IS billable. Panel considered active for this entire day.
 * - Day of Reinstallation (`piv_reinstalado`): IS billable.
 * - `piv_instalado` Mandatory: If `panel.piv_instalado` is missing/invalid, 0 billable days are returned.
 * - Logic Hierarchy for each day in the month:
 *   1. No `piv_instalado`: 0 days.
 *   2. If `piv_desinstalado` exists:
 *      a. If `piv_reinstalado` exists AND `piv_reinstalado >= piv_desinstalado` (logical sequence):
 *         Active if (day is in `[piv_instalado, piv_desinstalado]` inclusive) OR (day is >= `piv_reinstalado`).
 *      b. Else (only `piv_desinstalado` or `piv_reinstalado` is before `piv_desinstalado`):
 *         Active if day is in `[piv_instalado, piv_desinstalado]` inclusive.
 *   3. Else (no `piv_desinstalado`):
 *      a. If `piv_reinstalado` exists:
 *         Active if day is >= `piv_reinstalado` (and also >= `piv_instalado`).
 *      b. Else (only `piv_instalado` exists):
 *         Active if day is >= `piv_instalado`.
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

    // The panel must at least be on or after its initial installation date to be considered.
    if (currentDate < installDate) {
        isActiveToday = false;
    } else {
        // Default to active if past install date, specific conditions below will override
        isActiveToday = true; 

        if (desinstallDate) {
            // Desinstallation date exists
            if (reinstallDate && reinstallDate >= desinstallDate) {
                // All three dates exist and reinstall is on or after desinstall (logical sequence)
                // Active if (within first period [install, desinstall]) OR (on or after reinstall)
                if (!((currentDate >= installDate && currentDate <= desinstallDate) || (currentDate >= reinstallDate))) {
                    isActiveToday = false;
                }
            } else {
                // Only install and desinstall are relevant (or reinstall is before desinstall)
                // Active if within [install, desinstall]
                if (!(currentDate >= installDate && currentDate <= desinstallDate)) {
                    isActiveToday = false;
                }
            }
        } else if (reinstallDate) {
            // No desinstall, but there is an install and a reinstall.
            // Active if on or after reinstallDate. (It's already known currentDate >= installDate from outer check)
            if (currentDate < reinstallDate) {
                isActiveToday = false; // Not yet reinstalled
            }
        } else {
            // Only installDate is present. (It's already known currentDate >= installDate from outer check)
            // isActiveToday remains true from the default assignment.
        }
    }
    
    if (isActiveToday) {
      billableDays++;
    }
  }
  // console.log(`[Panel ${panel.codigo_parada}] BillableDaysFromPivDates for ${year}-${String(month).padStart(2,'0')}: ${billableDays} days. install: ${panel.piv_instalado}, desinstall: ${panel.piv_desinstalado}, reinstall: ${panel.piv_reinstalado}`);
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
 *   UI shows "Actual Active Days / 30" (denominator always 30 for consistency in display of rate application).
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

  // Calculate actual activity days using the PIV date fields from the panel object
  const actualActivityDays = calculateBillableDaysFromPanelPivDates(panel, year, month);
  
  let daysForBillingAndDisplayNumerator: number;
  // Denominator for UI display is always 30 as per UX requirement for billing page
  const daysForBillingAndDisplayDenominator: number = DAYS_IN_STANDARD_MONTH; 

  // If panel was active for all natural days, bill for the standard 30 days.
  // Otherwise, bill for the actual number of active days.
  if (actualActivityDays >= actualDaysInBillingMonth) { 
    daysForBillingAndDisplayNumerator = DAYS_IN_STANDARD_MONTH;
  } else {
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
    totalDaysInMonth: daysForBillingAndDisplayDenominator, // For UI, consistently 30
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
  allEvents: PanelEvent[], // Kept for potential future if direct events are used for notes.
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
    let notesForDay = "";

    if (!installDate) {
        isBillableToday = false;
        effectiveStatusToday = 'unknown';
    } else {
        if (currentDate < installDate) {
            isBillableToday = false;
            effectiveStatusToday = 'pending_installation';
        } else {
            isBillableToday = true; // Assume active, specific conditions will set to false

            if (desinstallDate) {
                if (reinstallDate && reinstallDate >= desinstallDate) {
                    if (!((currentDate >= installDate && currentDate <= desinstallDate) || (currentDate >= reinstallDate))) {
                        isBillableToday = false;
                    }
                } else {
                    if (!(currentDate >= installDate && currentDate <= desinstallDate)) {
                        isBillableToday = false;
                    }
                }
            } else if (reinstallDate) {
                if (currentDate < reinstallDate) {
                    isBillableToday = false;
                }
            }
            // If only installDate, isBillableToday remains true
            effectiveStatusToday = isBillableToday ? 'installed' : 'removed';
        }
    }
    
    // Notes based on PIV fields
    if (effectiveStatusToday === 'pending_installation' && installDate) {
        notesForDay = `${statusTranslations.pending_installation} (Programada: ${formatDateFns(installDate, 'dd/MM/yyyy', { locale: es })})`;
    } else {
        notesForDay = statusTranslations[effectiveStatusToday] || effectiveStatusToday;
    }
    
    if (currentDate.getTime() === installDate?.getTime()) notesForDay = `PIV Instalado (${notesForDay})`;
    if (currentDate.getTime() === desinstallDate?.getTime() && isBillableToday) notesForDay = `PIV Desinstalado - Fin Día (${statusTranslations.installed})`; // Billable on desinstall day
    else if (currentDate.getTime() === desinstallDate?.getTime() && !isBillableToday) notesForDay = `PIV Desinstalado (${statusTranslations.removed})`;
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
