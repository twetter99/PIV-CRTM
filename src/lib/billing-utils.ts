import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv"; // Renamed to avoid conflict

const DAILY_RATE = 10; // Tarifa diaria por panel (ejemplo)

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
  let currentStatus: PivPanelStatus = 'unknown';

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
    const eventsOnThisDay = panelEvents.filter(event => parseDate(event.date).getTime() === currentDate.getTime());

    if (eventsOnThisDay.length > 0) {
      currentStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus;
    } else {
      const eventsUpToThisDayInMonth = panelEvents.filter(event => {
        const eventDate = parseDate(event.date);
        return eventDate >= monthStartDate && eventDate < currentDate; 
      });
      if (eventsUpToThisDayInMonth.length > 0) {
        currentStatus = eventsUpToThisDayInMonth[eventsUpToThisDayInMonth.length - 1].newStatus;
      }
      if(panel.installationDate && parseDate(panel.installationDate).getTime() === currentDate.getTime() && currentStatus === 'unknown'){
        currentStatus = 'installed';
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
    amount: billedDays * DAILY_RATE, // Amount is now in EUR
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

  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);
  const eventsBeforeMonth = panelEvents.filter(event => parseDate(event.date) < monthStartDate);
  
  if (eventsBeforeMonth.length > 0) {
    currentStatus = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else if (panel.installationDate && parseDate(panel.installationDate) < monthStartDate) {
     if(panel.status === 'installed') currentStatus = 'installed';
  } else if (panel.installationDate && parseDate(panel.installationDate) >= monthStartDate && parseDate(panel.installationDate) < new Date(year, month, 1)) {
    currentStatus = 'installed';
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
    } else {
      const eventsUpToThisDayInMonth = panelEvents.filter(event => {
        const eventDate = parseDate(event.date);
        return eventDate >= monthStartDate && eventDate < currentDate;
      });
      if (eventsUpToThisDayInMonth.length > 0) {
        currentStatus = eventsUpToThisDayInMonth[eventsUpToThisDayInMonth.length - 1].newStatus;
      }
      if(panel.installationDate && parseDate(panel.installationDate).getTime() === currentDate.getTime() && currentStatus === 'unknown'){
        currentStatus = 'installed';
        eventNotesForDay = "Panel Instalado";
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
