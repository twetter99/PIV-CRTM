import type { Panel, PanelEvent, BillingRecord, PanelStatus } from "@/types/piv";

const DAILY_RATE = 10; // Example daily rate per panel, move to config/settings later

// Helper to format date to YYYY-MM-DD
const formatDate = (date: Date): string => date.toISOString().split('T')[0];
// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};


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

  const panelEvents = allEvents
    .filter(event => event.panelId === panelId)
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  let billedDays = 0;
  let currentStatus: PanelStatus = 'unknown';

  // Determine status at the beginning of the month
  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);
  const eventsBeforeMonth = panelEvents.filter(event => parseDate(event.date) < monthStartDate);
  
  if (eventsBeforeMonth.length > 0) {
    currentStatus = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else if (panel.installationDate && parseDate(panel.installationDate) < monthStartDate) {
    // If no events before month, but panel was installed before month.
    // This assumes the panel.status reflects the status post-installation if no other events.
    currentStatus = panel.status; // Or more specifically 'installed' if installation implies it.
                                  // Let's be explicit: if it's installed before month and panel.status is installed.
    if(panel.status === 'installed') currentStatus = 'installed';
  } else if (panel.installationDate && parseDate(panel.installationDate) >= monthStartDate && parseDate(panel.installationDate) < new Date(year, month, 1)) {
    // Installed within the first day of the month but before any events of the month.
    currentStatus = 'installed'; // Assume installed on installationDate
  }


  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = parseDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    const eventsOnThisDay = panelEvents.filter(event => parseDate(event.date).getTime() === currentDate.getTime());

    if (eventsOnThisDay.length > 0) {
      currentStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus; // Status at END of this day
    } else {
      // If no event on this day, status carries over from previous day.
      // But we need to check if an event occurred *before* this day but *within* the month.
      const eventsUpToThisDayInMonth = panelEvents.filter(event => {
        const eventDate = parseDate(event.date);
        return eventDate >= monthStartDate && eventDate < currentDate; 
      });
      if (eventsUpToThisDayInMonth.length > 0) {
        currentStatus = eventsUpToThisDayInMonth[eventsUpToThisDayInMonth.length - 1].newStatus;
      }
      // If panel installed on this day, and currentStatus is not set by an event
      if(panel.installationDate && parseDate(panel.installationDate).getTime() === currentDate.getTime() && currentStatus === 'unknown'){
        currentStatus = 'installed'; // Or panel.initialStatus if such field exists
      }
    }
    
    if (currentStatus === 'installed') {
      billedDays++;
    }
  }

  return {
    panelId,
    year,
    month,
    billedDays,
    totalDaysInMonth: daysInMonth,
    amount: billedDays * DAILY_RATE,
    panelDetails: panel,
  };
}


export interface DayStatus {
  date: string; // YYYY-MM-DD
  status: PanelStatus;
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
  let currentStatus: PanelStatus = 'unknown';

  // Determine status at the beginning of the month
  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);
  const eventsBeforeMonth = panelEvents.filter(event => parseDate(event.date) < monthStartDate);
  
  if (eventsBeforeMonth.length > 0) {
    currentStatus = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else if (panel.installationDate && parseDate(panel.installationDate) < monthStartDate) {
     if(panel.status === 'installed') currentStatus = 'installed';
  } else if (panel.installationDate && parseDate(panel.installationDate) >= monthStartDate && parseDate(panel.installationDate) < new Date(year, month, 1)) {
    currentStatus = 'installed';
  }


  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = parseDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    const currentDateStr = formatDate(currentDate);
    let eventNotesForDay = "";

    const eventsOnThisDay = panelEvents.filter(event => parseDate(event.date).getTime() === currentDate.getTime());

    if (eventsOnThisDay.length > 0) {
      currentStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus;
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${e.oldStatus || 'initial'} -> ${e.newStatus}`).join('; ');
    } else {
      // Status carries over, check if any event occurred before this day in month
      const eventsUpToThisDayInMonth = panelEvents.filter(event => {
        const eventDate = parseDate(event.date);
        return eventDate >= monthStartDate && eventDate < currentDate;
      });
      if (eventsUpToThisDayInMonth.length > 0) {
        currentStatus = eventsUpToThisDayInMonth[eventsUpToThisDayInMonth.length - 1].newStatus;
      }
      if(panel.installationDate && parseDate(panel.installationDate).getTime() === currentDate.getTime() && currentStatus === 'unknown'){
        currentStatus = 'installed';
        eventNotesForDay = "Panel Installed";
      }
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: currentStatus,
      isBillable: currentStatus === 'installed',
      eventNotes: eventNotesForDay || (currentStatus !== 'unknown' ? `Status: ${currentStatus}` : 'No specific event'),
    });
  }
  return dailyHistory;
}
