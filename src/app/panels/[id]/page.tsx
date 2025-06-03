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
import PanelForm from '@/components/panels/panel-form'; // Re-use for editing panel
import EventForm from '@/components/panels/event-form'; // Create this
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
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
  const { getPanelById, getEventsForPanel, updatePanelEvent: contextUpdateEvent, deletePanelEvent } = useData(); // deletePanelEvent to be added
  const { toast } = useToast();
  const panelId = params.id as string;

  const [panel, setPanel] = useState<Panel | null | undefined>(undefined); // undefined for loading
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
        setEvents(getEventsForPanel(panelId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())); // Sort descending by date
      }
    }
  }, [panelId, getPanelById, getEventsForPanel]);

  const handlePanelFormClose = () => {
    setIsPanelFormOpen(false);
    // Re-fetch panel data after edit
    if (panelId) setPanel(getPanelById(panelId));
  };

  const handleEventFormOpen = (event: PanelEvent | null = null) => {
    setEditingEvent(event);
    setIsEventFormOpen(true);
  };
  
  const handleEventFormClose = () => {
    setIsEventFormOpen(false);
    setEditingEvent(null);
    // Re-fetch events
    if (panelId && panel) setEvents(getEventsForPanel(panelId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const confirmDeleteEvent = (event: PanelEvent) => {
    setEventToDelete(event);
    setShowDeleteConfirm(true);
  };

  const handleDeleteEvent = async () => {
    if (eventToDelete && deletePanelEvent) { // deletePanelEvent to be implemented
      // const result = await deletePanelEvent(eventToDelete.id);
      // if (result.success) {
      //   toast({ title: "Event Deleted", description: `Event on ${eventToDelete.date} has been deleted.` });
      //   setEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
      // } else {
      //   toast({ title: "Error", description: result.message || "Could not delete event.", variant: "destructive" });
      // }
       toast({ title: "Delete Mock", description: `Mock deletion for event ${eventToDelete.id}. Implement actual delete.`, variant: "destructive" });

    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };


  if (panel === undefined) { // Loading state
    return (
      <div className="space-y-6">
        <PageHeader title="Loading Panel..." actions={<Skeleton className="h-10 w-24" />} />
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!panel) {
    return (
      <div>
        <PageHeader title="Panel Not Found" />
        <p>The panel with ID "{panelId}" could not be found.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/panels"><ArrowLeft className="mr-2 h-4 w-4" />Back to Panels</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Panel: ${panel.codigo_parada}`}
        description={panel.address}
        actions={
          <Button variant="outline" asChild>
            <Link href="/panels"><ArrowLeft className="mr-2 h-4 w-4" />Back to List</Link>
          </Button>
        }
      />

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="font-headline text-2xl">Panel Details</CardTitle>
            <CardDescription>Municipality: {panel.municipality} | Client: {panel.client}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsPanelFormOpen(true)}>
            <Edit2 className="mr-2 h-4 w-4" /> Edit Panel
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div><strong>ID:</strong> {panel.codigo_parada}</div>
          <div><strong>Status:</strong> <Badge variant={panel.status === 'installed' ? 'default' : (panel.status === 'removed' ? 'destructive' : 'secondary')}>{panel.status}</Badge></div>
          <div><strong>Address:</strong> {panel.address}</div>
          <div><strong>Municipality:</strong> {panel.municipality}</div>
          <div><strong>Client:</strong> {panel.client}</div>
          <div><strong>Installation Date:</strong> {panel.installationDate ? format(new Date(panel.installationDate), 'PPP') : 'N/A'}</div>
          <div><strong>Latitude:</strong> {panel.latitude || 'N/A'}</div>
          <div><strong>Longitude:</strong> {panel.longitude || 'N/A'}</div>
          <div className="md:col-span-2"><strong>Notes:</strong> {panel.notes || 'N/A'}</div>
          <div className="md:col-span-2"><strong>Last Status Update:</strong> {panel.lastStatusUpdate ? format(new Date(panel.lastStatusUpdate), 'PPP p') : 'N/A'}</div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-headline text-2xl">Event History</CardTitle>
          <Button variant="outline" size="sm" onClick={() => handleEventFormOpen()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Event
          </Button>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Old Status</TableHead>
                    <TableHead>New Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{format(new Date(event.date), 'PPP')}</TableCell>
                      <TableCell><Badge variant="secondary">{event.oldStatus || 'Initial'}</Badge></TableCell>
                      <TableCell><Badge variant={event.newStatus === 'installed' ? 'default' : (event.newStatus === 'removed' ? 'destructive' : 'secondary')}>{event.newStatus}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{event.notes || '-'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEventFormOpen(event)} title="Edit Event">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                         {/* <Button variant="ghost" size="icon" onClick={() => confirmDeleteEvent(event)} title="Delete Event" className="text-destructive hover:text-destructive">
                           <Trash2 className="h-4 w-4" />
                         </Button> */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No events recorded for this panel.</p>
          )}
        </CardContent>
      </Card>

      {isPanelFormOpen && <PanelForm panel={panel} onClose={handlePanelFormClose} />}
      {isEventFormOpen && <EventForm event={editingEvent} panelId={panel.codigo_parada} onClose={handleEventFormClose} />}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the event for panel
              "{eventToDelete?.panelId}" on {eventToDelete?.date}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteEvent}>Delete Event</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
