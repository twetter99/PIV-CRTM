"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useData } from "@/contexts/data-provider";
import type { PanelEvent, PanelStatus } from "@/types/piv";
import { ALL_PANEL_STATUSES } from "@/types/piv";
import { useToast } from "@/hooks/use-toast";

const eventFormSchema = z.object({
  date: z.string().min(1, "Date is required").refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format (YYYY-MM-DD)" }),
  oldStatus: z.enum(ALL_PANEL_STATUSES).optional(),
  newStatus: z.enum(ALL_PANEL_STATUSES),
  notes: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  event: PanelEvent | null;
  panelId: string;
  onClose: () => void;
}

export default function EventForm({ event, panelId, onClose }: EventFormProps) {
  const { addPanelEvent, updatePanelEvent } = useData();
  const { toast } = useToast();
  const isEditing = !!event;

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      date: event?.date ? event.date.split('T')[0] : new Date().toISOString().split('T')[0],
      oldStatus: event?.oldStatus,
      newStatus: event?.newStatus || 'installed',
      notes: event?.notes || "",
    },
  });

  async function onSubmit(data: EventFormValues) {
    const eventData: Partial<PanelEvent> = { // Partial because id and panelId are handled separately
      ...data,
      date: data.date, // Already formatted by input type="date"
    };

    try {
      let result;
      if (isEditing && event) {
        result = await updatePanelEvent(event.id, { ...eventData, panelId });
      } else {
        // For new event, panelId is required
        result = await addPanelEvent({ ...eventData, panelId } as PanelEvent); // Cast because id will be added by context
      }
      
      if (result.success) {
        toast({
          title: isEditing ? "Event Updated" : "Event Added",
          description: `Event for panel ${panelId} on ${data.date} has been successfully ${isEditing ? 'updated' : 'added'}.`,
        });
        onClose();
      } else {
         toast({
          title: "Error",
          description: result.message || (isEditing ? "Could not update event." : "Could not add event."),
          variant: "destructive",
        });
      }
    } catch (error: any) {
        toast({
          title: "Submission Error",
          description: error.message || "An unexpected error occurred.",
          variant: "destructive",
        });
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Event" : "Add New Event"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update event for panel ${panelId}.` : `Record a new status change for panel ${panelId}.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="oldStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Old Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select old status (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">N/A (Initial)</SelectItem>
                        {ALL_PANEL_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} required>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select new status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_PANEL_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Reason for status change, details, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Save Changes" : "Add Event")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
