
// src/types/piv.ts
export interface Panel {
  // Campos principales ahora en camelCase para coincidir con Excel y UI
  codigoParada: string; // Antes codigo_parada
  fechaInstalacion?: string | null; // Antes piv_instalado, ahora opcional para importación directa
  fechaDesinstalacion?: string | null; // Antes piv_desinstalado
  fechaReinstalacion?: string | null; // Antes piv_reinstalado
  importeMensual?: number; // Antes importe_mensual

  municipioMarquesina?: string; // Nuevo o antes municipality
  cliente?: string; // Antes client
  direccion?: string; // Antes address
  
  status: PanelStatus; // No opcional, calculado
  lastStatusUpdate: string | null; // No opcional, calculado

  // Campos directamente del Excel (camelCase)
  codigoMarquesina?: string;
  vigencia?: string;
  tipoPiv?: string;
  industrial?: string;
  empresaConcesionaria?: string; // Podría ser el mismo que 'cliente' o uno diferente
  op1?: string;
  op2?: string;
  marquesinaCce?: string;
  direccionCce?: string; // Podría ser el mismo que 'direccion'
  ultimaInstalacionOReinstalacion?: string | null;
  cambioUbicacionReinstalacionesContrato2024_2025?: string;
  reinstalacionVandalizados?: string;
  garantiaCaducada?: string;
  observaciones?: string; // Antes notes

  // Campos de gestión interna
  latitude?: number;
  longitude?: number;
  fechaImportacion?: string;
  importadoPor?: string;
  importeMensualOriginal?: string; // Para guardar el valor original del Excel si se procesa

  // Permitir otras propiedades que puedan venir del Excel
  [key: string]: any;
}

export type PanelStatus = 'installed' | 'removed' | 'maintenance' | 'pending_installation' | 'pending_removal' | 'unknown';
export const ALL_PANEL_STATUSES: PanelStatus[] = ['installed', 'removed', 'maintenance', 'pending_installation', 'pending_removal', 'unknown'];

export interface PanelEvent {
  id: string;
  panelId: string; // Debe coincidir con Panel.codigoParada
  tipo: "DESINSTALACION" | "REINSTALACION";
  fecha: string; // YYYY-MM-DD
  notes?: string;

  oldStatus?: PanelStatus;
  newStatus?: PanelStatus;
}

export interface BillingRecord {
  panelId: string;
  year: number;
  month: number;
  billedDays: number;
  totalDaysInMonth: number;
  amount: number;
  panelDetails?: Panel;
}
