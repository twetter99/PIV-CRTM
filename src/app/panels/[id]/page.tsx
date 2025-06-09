
"use client";
import { useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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

// Define the specific fields to display with their labels (Excel headers) and corresponding panel object keys
const fieldsToDisplay: Array<{ label: string; panelKey: keyof Panel | string }> = [
  { label: 'municipioMarquesina', panelKey: 'municipality' },
  { label: 'codigoParada', panelKey: 'codigo_parada' },
  { label: 'codigoMarquesina', panelKey: 'marquesina' }, 
  { label: 'vigencia', panelKey: 'vigencia' },
  { label: 'fechaInstalacion', panelKey: 'piv_instalado' },
  { label: 'fechaDesinstalacion', panelKey: 'piv_desinstalado' },
  { label: 'fechaReinstalacion', panelKey: 'piv_reinstalado' },
  { label: 'tipoPiv', panelKey: 'tipo_piv' }, 
  { label: 'industrial', panelKey: 'industrial' },
  { label: 'empresaConcesionaria', panelKey: 'client' },
  { label: 'direccionCce', panelKey: 'address' },
  { label: 'ultimaInstalacionOReinstalacion', panelKey: 'ultima_instalacion_o_reinstalacion' },
  { label: 'garantia', panelKey: 'garantia' }, // Added garantia
];


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

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Panel: ${panel.codigo_parada || 'N/A'}`}
        description={panel.address || panel.direccion_cce || panel.municipality || panel.municipio_marquesina || `Información detallada del panel ${panel.codigo_parada || ''}`.trim()}
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
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsPanelFormOpen(true)}>
            <Edit2 className="mr-2 h-4 w-4" /> Editar Panel
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          {fieldsToDisplay.map((field) => {
            const rawValue = panel[field.panelKey as keyof Panel];
            const displayValue = (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '') ? String(rawValue) : 'N/A';
            
            return (
              <div key={field.label} className="lg:col-span-1 break-words">
                <strong>{field.label}:</strong> {displayValue}
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
