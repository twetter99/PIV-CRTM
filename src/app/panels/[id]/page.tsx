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
import type { Panel, PanelEvent } from '@/types/piv';
import PanelForm from '@/components/panels/panel-form';
import EventForm from '@/components/panels/event-form';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
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
        setEvents(getEventsForPanel(panelId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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
    if (panelId && panel) setEvents(getEventsForPanel(panelId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const confirmDeleteEvent = (event: PanelEvent) => {
    setEventToDelete(event);
    setShowDeleteConfirm(true);
  };

  const handleDeleteEvent = async () => {
    if (eventToDelete && deletePanelEvent) {
       toast({ title: "Eliminación simulada", description: `Eliminación simulada para evento ${eventToDelete.id}. Implementar eliminación real.`, variant: "destructive" });
    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
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
  
  const formatStatus = (status: string) => {
    const statusMap: { [key: string]: string } = {
        'installed': 'Instalado',
        'removed': 'Eliminado',
        'maintenance': 'Mantenimiento',
        'pending_installation': 'Pendiente Instalación',
        'pending_removal': 'Pendiente Eliminación',
        'unknown': 'Desconocido'
    };
    return statusMap[status] || status.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Panel: ${panel.codigo_parada}`}
        description={panel.address}
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
            <CardDescription>Municipio: {panel.municipality} | Cliente: {panel.client}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsPanelFormOpen(true)}>
            <Edit2 className="mr-2 h-4 w-4" /> Editar Panel
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div><strong>ID:</strong> {panel.codigo_parada}</div>
          <div><strong>Estado:</strong> <Badge variant={panel.status === 'installed' ? 'default' : (panel.status === 'removed' ? 'destructive' : 'secondary')}>{formatStatus(panel.status)}</Badge></div>
          <div><strong>Dirección:</strong> {panel.address}</div>
          <div><strong>Municipio:</strong> {panel.municipality}</div>
          <div><strong>Cliente:</strong> {panel.client}</div>
          <div><strong>Fecha Instalación:</strong> {panel.installationDate ? format(new Date(panel.installationDate), 'dd/MM/yyyy', { locale: es }) : 'N/A'}</div>
          <div><strong>Latitud:</strong> {panel.latitude || 'N/A'}</div>
          <div><strong>Longitud:</strong> {panel.longitude || 'N/A'}</div>
          <div className="md:col-span-2"><strong>Notas:</strong> {panel.notes || 'N/A'}</div>
          <div className="md:col-span-2"><strong>Última Actualización Estado:</strong> {panel.lastStatusUpdate ? format(new Date(panel.lastStatusUpdate), 'dd/MM/yyyy p', { locale: es }) : 'N/A'}</div>
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
                      <TableCell>{format(new Date(event.date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                      <TableCell><Badge variant="secondary">{event.oldStatus ? formatStatus(event.oldStatus) : 'Inicial'}</Badge></TableCell>
                      <TableCell><Badge variant={event.newStatus === 'installed' ? 'default' : (event.newStatus === 'removed' ? 'destructive' : 'secondary')}>{formatStatus(event.newStatus)}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{event.notes || '-'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEventFormOpen(event)} title="Editar Evento">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                         {/* <Button variant="ghost" size="icon" onClick={() => confirmDeleteEvent(event)} title="Eliminar Evento" className="text-destructive hover:text-destructive">
                           <Trash2 className="h-4 w-4" />
                         </Button> */}
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
      {isEventFormOpen && <EventForm event={editingEvent} panelId={panel.codigo_parada} onClose={handleEventFormClose} />}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el evento para el panel
              "{eventToDelete?.panelId}" del {eventToDelete?.date ? format(new Date(eventToDelete.date), 'dd/MM/yyyy', { locale: es }) : ''}.
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
