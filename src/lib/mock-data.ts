import type { Panel, PanelEvent } from '@/types/piv';

const today = new Date();
const yesterday = new Date(new Date().setDate(today.getDate() - 1));
const fiveDaysAgo = new Date(new Date().setDate(today.getDate() - 5));
const tenDaysAgo = new Date(new Date().setDate(today.getDate() - 10));
const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
const sixtyDaysAgo = new Date(new Date().setDate(today.getDate() - 60));

const formatDate = (date: Date): string => date.toISOString().split('T')[0];

export const MOCK_PANELS: Panel[] = [
  {
    codigo_parada: 'P001',
    municipality: 'Ciudad A',
    client: 'Cliente X',
    address: 'C/ Principal 123, Ciudad A',
    installationDate: formatDate(thirtyDaysAgo),
    status: 'installed',
    notes: 'Panel estándar, zona de alto tráfico',
    lastStatusUpdate: formatDate(thirtyDaysAgo),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P002',
    municipality: 'Ciudad B',
    client: 'Cliente Y',
    address: 'Av. Roble 456, Ciudad B',
    installationDate: formatDate(sixtyDaysAgo),
    status: 'installed',
    notes: 'Panel digital de gran formato',
    lastStatusUpdate: formatDate(sixtyDaysAgo),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P003',
    municipality: 'Ciudad A',
    client: 'Cliente X',
    address: 'Paseo del Pino 789, Ciudad A',
    installationDate: formatDate(tenDaysAgo),
    status: 'removed',
    notes: 'Retirado temporalmente por obras',
    lastStatusUpdate: formatDate(fiveDaysAgo),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P004',
    municipality: 'Ciudad C',
    client: 'Cliente Z',
    address: 'Camino del Olmo 101, Ciudad C',
    installationDate: formatDate(new Date(new Date().setDate(today.getDate() - 120))),
    status: 'maintenance',
    notes: 'Mantenimiento programado para reemplazo de pantalla',
    lastStatusUpdate: formatDate(yesterday),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P005',
    municipality: 'Ciudad B',
    client: 'Cliente Y',
    address: 'Plaza del Arce 202, Ciudad B',
    status: 'pending_installation',
    notes: 'Esperando permiso municipal para instalación',
    lastStatusUpdate: formatDate(today),
    latitude: 34.0522,
    longitude: -118.2437,
  },
];

export const MOCK_PANEL_EVENTS: PanelEvent[] = [
  {
    id: 'evt1',
    panelId: 'P001',
    date: formatDate(thirtyDaysAgo),
    oldStatus: 'pending_installation',
    newStatus: 'installed',
    notes: 'Instalación inicial completada con éxito.',
  },
  {
    id: 'evt2',
    panelId: 'P002',
    date: formatDate(sixtyDaysAgo),
    oldStatus: 'pending_installation',
    newStatus: 'installed',
    notes: 'Instalado según nuevo calendario de contrato.',
  },
  {
    id: 'evt3',
    panelId: 'P003',
    date: formatDate(tenDaysAgo),
    oldStatus: 'pending_installation',
    newStatus: 'installed',
    notes: 'Instalación temporal para festival de la ciudad.',
  },
  {
    id: 'evt4',
    panelId: 'P003',
    date: formatDate(fiveDaysAgo),
    oldStatus: 'installed',
    newStatus: 'removed',
    notes: 'Festival finalizado, panel retirado según lo planeado.',
  },
  {
    id: 'evt5',
    panelId: 'P004',
    date: formatDate(yesterday),
    oldStatus: 'installed',
    newStatus: 'maintenance',
    notes: 'Revisión rutinaria, calibración de pantalla realizada.',
  },
  { 
    id: 'evt6',
    panelId: 'P001',
    date: formatDate(fiveDaysAgo),
    oldStatus: 'installed',
    newStatus: 'maintenance',
    notes: 'Problema de conectividad de red solucionado.',
  },
  {
    id: 'evt7',
    panelId: 'P001',
    date: formatDate(yesterday),
    oldStatus: 'maintenance',
    newStatus: 'installed',
    notes: 'Panel nuevamente en línea después del mantenimiento.',
  }
];
