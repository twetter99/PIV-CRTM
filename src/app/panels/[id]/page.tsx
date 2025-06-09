
"use client";
import { useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit2, PlusCircle, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import PanelForm from '@/components/panels/panel-form';
import EventForm from '@/components/panels/event-form';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isValid as isValidDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

// Lista de campos con etiquetas personalizadas. PanelKey debe ser la clave camelCase del objeto panel.
const explicitFieldsToDisplay: Array<{ label: string; panelKey: string }> = [
  { label: 'Código Parada', panelKey: 'codigo_parada' }, // Asumiendo que este sigue siendo snake_case en el objeto panel
  { label: 'Municipio Marquesina', panelKey: 'municipioMarquesina' },
  { label: 'Código Marquesina', panelKey: 'codigoMarquesina' },
  { label: 'Vigencia', panelKey: 'vigencia' },
  { label: 'Fecha Instalación', panelKey: 'fechaInstalacion' },
  { label: 'Fecha Desinstalación', panelKey: 'fechaDesinstalacion' },
  { label: 'Fecha Reinstalación', panelKey: 'fechaReinstalacion' },
  { label: 'Tipo PIV', panelKey: 'tipoPiv' },
  { label: 'Industrial', panelKey: 'industrial' },
  { label: 'Empresa Concesionaria', panelKey: 'empresaConcesionaria' },
  { label: 'Dirección CCE', panelKey: 'direccionCce' },
  { label: 'Última Instalación/Reinstalación', panelKey: 'ultimaInstalacionOReinstalacion' },
  { label: 'Opción 1', panelKey: 'op1' },
  { label: 'Opción 2', panelKey: 'op2' },
  { label: 'Marquesina CCE', panelKey: 'marquesinaCce' },
  { label: 'Cambio Ubicación / Reinstalaciones Contrato 2024-2025', panelKey: 'cambioUbicacionReinstalacionesContrato2024_2025' },
  { label: 'Reinstalación Vandalizados', panelKey: 'reinstalacionVandalizados' },
  { label: 'Garantía Caducada', panelKey: 'garantiaCaducada' },
  { label: 'Importe Mensual', panelKey: 'importe_mensual' }, // Asumiendo snake_case
  { label: 'Observaciones', panelKey: 'observacionesPiv' }, // O la clave que uses para las observaciones generales del PIV
  { label: 'Notas Internas', panelKey: 'notes' }, // Si 'notes' es para notas internas y diferente de 'observacionesPiv'
];

// Función para formatear claves camelCase o snake_case a etiquetas legibles
function formatKeyToLabel(key: string): string {
  if (!key) return '';
  // Convertir snake_case a space case primero
  let result = key.replace(/_/g, ' ');
  // Insertar espacio antes de mayúsculas (para camelCase) y luego capitalizar
  result = result.replace(/([A-Z])/g, ' $1').trim();
  return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
}

// Claves a excluir del renderizado dinámico si no están en explicitFieldsToDisplay
// (porque se manejan de otra forma o no son para mostrar directamente aquí)
const excludedKeysFromDynamicDisplay = new Set([
  'status', 
  'lastStatusUpdate', 
  'latitude', 
  'longitude',
  'fecha_importacion',
  'importado_por',
  'importe_mensual_original',
  'installationDate', // A menudo es un alias de piv_instalado o fechaInstalacion
  // También las claves ya definidas en explicitFieldsToDisplay (se maneja en el bucle)
  // Claves que podrían ser mapeadas de forma diferente (como client, address) si no usas los camelCase directamente.
  'piv_instalado', 'piv_desinstalado', 'piv_reinstalado', 'municipality', 'client', 'address',
]);


export default function PanelDetailPage() {
  const params = useParams();
  const { getPanelById, getEventsForPanel, updatePanelEvent: contextUpdateEvent, deletePanelEvent } = useData();
  const { toast } = useToast();
  const panelId = params.id as string;

  const [panel, setPanel] = useState<Panel | null | undefined>(undefined);
  const [events, setEvents] = useState<PanelEvent[]>([]);
  
  const [isPanelFormOpen, setIsPanelFormOpen] = useState(false);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PanelEvent | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<PanelEvent | null>(null);


  useEffect(() => {
    if (panelId) {
      const currentPanel = getPanelById(panelId);
      setPanel(currentPanel);
      if (currentPanel) {
        setEvents(getEventsForPanel(panelId).sort((a,b) => {
          const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
          const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
          return dateB - dateA;
        }));
      }
    }
  }, [panelId, getPanelById, getEventsForPanel]);

  const handlePanelFormClose = () => {
    setIsPanelFormOpen(false);
    if (panelId) setPanel(getPanelById(panelId));
  };

  const handleEventFormOpen = (event: PanelEvent | null = null) => {
    setEditingEvent(event);
    setIsEventFormOpen(true);
  };
  
  const handleEventFormClose = () => {
    setIsEventFormOpen(false);
    setEditingEvent(null);
    if (panelId && panel) setEvents(getEventsForPanel(panelId).sort((a,b) => {
        const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
        return dateB - dateA;
      }));
  };

  const confirmDeleteEvent = (event: PanelEvent) => {
    setEventToDelete(event);
    setShowDeleteConfirm(true);
  };

  const handleDeleteEvent = async () => {
    if (eventToDelete && deletePanelEvent) {
       const result = await deletePanelEvent(eventToDelete.id);
       if (result.success) {
        toast({ title: "Evento Eliminado", description: `El evento para el panel ${eventToDelete.panelId} ha sido eliminado.` });
        if (panelId && panel) setEvents(getEventsForPanel(panelId).sort((a,b) => { 
            const dateA = a.fecha ? parseISO(a.fecha).getTime() : 0;
            const dateB = b.fecha ? parseISO(b.fecha).getTime() : 0;
            return dateB - dateA;
          }));
       } else {
        toast({ title: "Error al Eliminar", description: result.message || "No se pudo eliminar el evento.", variant: "destructive" });
       }
    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };

  const formatDateForEventTable = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const dateOnlyString = dateString.split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnlyString)) {
        return 'Fecha Inválida';
      }
      const parsedDate = parseISO(dateOnlyString);
      if (isValidDate(parsedDate) && format(parsedDate, 'yyyy-MM-dd') === dateOnlyString) {
          return format(parsedDate, 'dd/MM/yyyy', { locale: es });
      }
      return 'Fecha Inválida';
    } catch (error) {
      return 'Fecha Inválida';
    }
  };


  if (panel === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cargando Panel..." actions={<Skeleton className="h-10 w-24" />} />
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!panel) {
    return (
      <div>
        <PageHeader title="Panel No Encontrado" />
        <p>El panel con ID "{panelId}" no pudo ser encontrado.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/panels"><ArrowLeft className="mr-2 h-4 w-4" />Volver a Paneles</Link>
        </Button>
      </div>
    );
  }
  
  const formatStatusForEventBadge = (status: string | null | undefined): string => {
    if (status === null || status === undefined) {
      return 'Desconocido';
    }
    const statusMap: { [key: string]: string } = {
        'installed': 'Instalado',
        'removed': 'Eliminado',
        'maintenance': 'Mantenimiento',
        'pending_installation': 'Pendiente Instalación',
        'pending_removal': 'Pendiente Eliminación',
        'unknown': 'Desconocido'
    };
    return statusMap[status as PanelStatus] || status.toString().replace(/_/g, ' ');
  };
  
  const panelKeysToDisplay = Object.keys(panel).filter(key => !excludedKeysFromDynamicDisplay.has(key));
  const explicitPanelKeysInDisplay = new Set(explicitFieldsToDisplay.map(f => f.panelKey));

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Panel: ${panel.codigo_parada || 'N/A'}`}
        description={panel.direccionCce || panel.address || panel.municipioMarquesina || panel.municipality || `Información detallada del panel ${panel.codigo_parada || ''}`.trim()}
        actions={
          <Button variant="outline" asChild>
            <Link href="/panels"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Listado</Link>
          </Button>
        }
      />

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="font-headline text-2xl">Detalles del Panel</CardTitle>
             <p className="text-sm text-muted-foreground">Estado actual: <Badge variant={panel.status === 'installed' ? 'default' : (panel.status === 'removed' ? 'destructive' : 'secondary')}>{formatStatusForEventBadge(panel.status)}</Badge> (Últ. act.: {panel.lastStatusUpdate ? formatDateForEventTable(panel.lastStatusUpdate) : 'N/A'})</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsPanelFormOpen(true)}>
            <Edit2 className="mr-2 h-4 w-4" /> Editar Panel
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          {explicitFieldsToDisplay.map((field) => {
            const rawValue = panel[field.panelKey as keyof Panel];
            const displayValue = (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '') ? String(rawValue) : 'N/A';
            
            return (
              <div key={field.panelKey} className="lg:col-span-1 break-words">
                <strong>{field.label}:</strong> {displayValue}
              </div>
            );
          })}
          {panelKeysToDisplay
            .filter(key => !explicitPanelKeysInDisplay.has(key)) // Solo mostrar los que no están en la lista explícita
            .map((key) => {
              const rawValue = panel[key as keyof Panel];
              const displayValue = (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '') ? String(rawValue) : 'N/A';
              const displayLabel = formatKeyToLabel(key);

              return (
                <div key={key} className="lg:col-span-1 break-words">
                  <strong>{displayLabel}:</strong> {displayValue}
                </div>
              );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-headline text-2xl">Historial de Eventos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => handleEventFormOpen()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Evento
          </Button>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado Anterior</TableHead>
                    <TableHead>Estado Nuevo</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{formatDateForEventTable(event.fecha)}</TableCell>
                      <TableCell><Badge variant="secondary">{event.oldStatus ? formatStatusForEventBadge(event.oldStatus) : 'Inicial'}</Badge></TableCell>
                      <TableCell><Badge variant={event.newStatus === 'installed' ? 'default' : (event.newStatus === 'removed' ? 'destructive' : 'secondary')}>{formatStatusForEventBadge(event.newStatus)}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{event.notes || '-'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEventFormOpen(event)} title="Editar Evento">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                         <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/90" onClick={() => confirmDeleteEvent(event)} title="Eliminar Evento">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No hay eventos registrados para este panel.</p>
          )}
        </CardContent>
      </Card>

      {isPanelFormOpen && <PanelForm panel={panel} onClose={handlePanelFormClose} />}
      {isEventFormOpen && panel && <EventForm event={editingEvent} panelId={panel.codigo_parada} onClose={handleEventFormClose} />}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el evento para el panel
              "{eventToDelete?.panelId}" del {eventToDelete?.fecha ? formatDateForEventTable(eventToDelete.fecha) : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteEvent}>Eliminar Evento</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}


    