// src/lib/mock-data.ts
import type { Panel, PanelEvent } from '@/types/piv';

const today = new Date();
const yesterday = new Date(new Date().setDate(today.getDate() - 1));
const fiveDaysAgo = new Date(new Date().setDate(today.getDate() - 5));
const tenDaysAgo = new Date(new Date().setDate(today.getDate() - 10));
const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
const sixtyDaysAgo = new Date(new Date().setDate(today.getDate() - 60));

// Helper to format date to YYYY-MM-DD
const formatDate = (date: Date): string => date.toISOString().split('T')[0];

export const MOCK_PANELS: Panel[] = [
  {
    codigo_parada: 'P001',
    municipality: 'City A',
    client: 'Client X',
    address: '123 Main St, City A',
    installationDate: formatDate(thirtyDaysAgo),
    status: 'installed',
    notes: 'Standard panel, high traffic area',
    lastStatusUpdate: formatDate(thirtyDaysAgo),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P002',
    municipality: 'City B',
    client: 'Client Y',
    address: '456 Oak Ave, City B',
    installationDate: formatDate(sixtyDaysAgo),
    status: 'installed',
    notes: 'Large format digital panel',
    lastStatusUpdate: formatDate(sixtyDaysAgo),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P003',
    municipality: 'City A',
    client: 'Client X',
    address: '789 Pine Ln, City A',
    installationDate: formatDate(tenDaysAgo),
    status: 'removed',
    notes: 'Temporary removal for construction',
    lastStatusUpdate: formatDate(fiveDaysAgo),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P004',
    municipality: 'City C',
    client: 'Client Z',
    address: '101 Elm Rd, City C',
    installationDate: formatDate(new Date(new Date().setDate(today.getDate() - 120))), // Older panel
    status: 'maintenance',
    notes: 'Scheduled maintenance for screen replacement',
    lastStatusUpdate: formatDate(yesterday),
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    codigo_parada: 'P005',
    municipality: 'City B',
    client: 'Client Y',
    address: '202 Maple Dr, City B',
    // No installationDate yet for pending
    status: 'pending_installation',
    notes: 'Awaiting city permit for installation',
    lastStatusUpdate: formatDate(today),
    latitude: 34.0522,
    longitude: -118.2437,
  },
];

export const MOCK_PANEL_EVENTS: PanelEvent[] = [
  {
    id: 'evt1', // Assuming IDs are strings, like UUIDs
    panelId: 'P001',
    date: formatDate(thirtyDaysAgo),
    oldStatus: 'pending_installation',
    newStatus: 'installed',
    notes: 'Initial installation completed successfully.',
  },
  {
    id: 'evt2',
    panelId: 'P002',
    date: formatDate(sixtyDaysAgo),
    oldStatus: 'pending_installation',
    newStatus: 'installed',
    notes: 'Installed as per new contract schedule.',
  },
  {
    id: 'evt3',
    panelId: 'P003',
    date: formatDate(tenDaysAgo),
    oldStatus: 'pending_installation',
    newStatus: 'installed',
    notes: 'Temporary installation for city festival.',
  },
  {
    id: 'evt4',
    panelId: 'P003',
    date: formatDate(fiveDaysAgo),
    oldStatus: 'installed',
    newStatus: 'removed',
    notes: 'Festival ended, panel removed as planned.',
  },
  {
    id: 'evt5',
    panelId: 'P004',
    date: formatDate(yesterday),
    oldStatus: 'installed',
    newStatus: 'maintenance',
    notes: 'Routine check, screen calibration performed.',
  },
  { 
    id: 'evt6',
    panelId: 'P001',
    date: formatDate(fiveDaysAgo),
    oldStatus: 'installed',
    newStatus: 'maintenance',
    notes: 'Network connectivity issue fixed.',
  },
  {
    id: 'evt7',
    panelId: 'P001',
    date: formatDate(yesterday),
    oldStatus: 'maintenance',
    newStatus: 'installed',
    notes: 'Panel back online after maintenance.',
  }
];
