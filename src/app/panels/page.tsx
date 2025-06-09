
"use client";
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useData } from '@/contexts/data-provider';
import type { Panel } from '@/types/piv';
import { PlusCircle, Filter, Edit2, Eye, Trash2, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo, SetStateAction } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import PanelForm from '@/components/panels/panel-form';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type SortField = keyof Panel | '';
type SortDirection = 'asc' | 'desc';

const ALL_MUNICIPALITIES_VALUE = "__ALL_MUNICIPALITIES__";
const ALL_CLIENTS_VALUE = "__ALL_CLIENTS__";

export default function PanelsPage() {
  const { panels, deletePanel } = useData();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMunicipality, setFilterMunicipality] = useState(''); 
  const [filterClient, setFilterClient] = useState(''); 
  const [sortField, setSortField] = useState<SortField>('codigoParada'); // Cambiado a camelCase
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [panelToDelete, setPanelToDelete] = useState<Panel | null>(null);


  const municipalities = useMemo(() => Array.from(new Set(panels.map(p => p.municipioMarquesina || 'N/A'))), [panels]); // Usar municipioMarquesina
  const clients = useMemo(() => Array.from(new Set(panels.map(p => p.cliente || 'N/A'))), [panels]); // Usar cliente

  const filteredAndSortedPanels = useMemo(() => {
    let filtered = panels.filter(panel => 
      ((panel.codigoParada || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
       (panel.direccion || '').toLowerCase().includes(searchTerm.toLowerCase())) && // Usar direccion
      (filterMunicipality === '' || panel.municipioMarquesina === filterMunicipality) && 
      (filterClient === '' || panel.cliente === filterClient) 
    );

    if (sortField) {
      filtered.sort((a, b) => {
        const valA = a[sortField as keyof Panel]; // Asegurar que sortField es una clave válida de Panel
        const valB = b[sortField as keyof Panel];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        let comparison = 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else { 
          comparison = String(valA).localeCompare(String(valB));
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    return filtered;
  }, [panels, searchTerm, filterMunicipality, filterClient, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIndicator = ({ field }: { field: SortField}) => {
    if (sortField === field) {
      return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-4 w-4 inline-block transform rotate-0" /> : <ArrowUpDown className="ml-2 h-4 w-4 inline-block transform rotate-180" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4 inline-block text-muted-foreground/50" />;
  };

  const handleOpenForm = (panel: Panel | null = null) => {
    setEditingPanel(panel);
    setIsFormOpen(true);
  };
  
  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingPanel(null);
  };

  const confirmDelete = (panel: Panel) => {
    setPanelToDelete(panel);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (panelToDelete && deletePanel) {
      await deletePanel(panelToDelete.codigoParada); // Usar codigoParada
      toast({ title: "Panel Eliminado", description: `Panel ${panelToDelete.codigoParada} eliminado.`, variant: "default" });
    }
    setShowDeleteConfirm(false);
    setPanelToDelete(null);
  };


  return (
    <div className="space-y-6">
      <PageHeader 
        title="Paneles PIV" 
        description="Gestiona y visualiza todos los paneles PIV."
        actions={
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Panel
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg shadow-sm bg-card">
        <Input 
          placeholder="Buscar por ID o Dirección..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="md:col-span-2"
        />
        <Select 
          value={filterMunicipality === '' ? ALL_MUNICIPALITIES_VALUE : filterMunicipality} 
          onValueChange={(value) => {
            setFilterMunicipality(value === ALL_MUNICIPALITIES_VALUE ? '' : value);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Filtrar por Municipio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MUNICIPALITIES_VALUE}>Todos los Municipios</SelectItem>
            {municipalities.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select 
          value={filterClient === '' ? ALL_CLIENTS_VALUE : filterClient}
          onValueChange={(value) => {
            setFilterClient(value === ALL_CLIENTS_VALUE ? '' : value);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Filtrar por Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS_VALUE}>Todos los Clientes</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead onClick={() => handleSort('codigoParada')} className="cursor-pointer">ID <SortIndicator field="codigoParada" /></TableHead>
              <TableHead onClick={() => handleSort('municipioMarquesina')} className="cursor-pointer">Municipio <SortIndicator field="municipioMarquesina" /></TableHead>
              <TableHead onClick={() => handleSort('cliente')} className="cursor-pointer">Cliente <SortIndicator field="cliente" /></TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead onClick={() => handleSort('status')} className="cursor-pointer">Estado <SortIndicator field="status" /></TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPanels.map((panel) => (
              <TableRow key={panel.codigoParada}>
                <TableCell className="font-medium">{panel.codigoParada}</TableCell>
                <TableCell>{panel.municipioMarquesina || 'N/A'}</TableCell>
                <TableCell>{panel.cliente || 'N/A'}</TableCell>
                <TableCell>{panel.direccion || 'N/A'}</TableCell>
                <TableCell><Badge variant={panel.status === 'installed' ? 'default' : (panel.status === 'removed' ? 'destructive' : 'secondary') }>{panel.status.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/panels/${panel.codigoParada}`} title="Ver Detalles">
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleOpenForm(panel)} title="Editar Panel">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => confirmDelete(panel)} title="Eliminar Panel" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
             {filteredAndSortedPanels.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No se encontraron paneles.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {isFormOpen && <PanelForm panel={editingPanel} onClose={handleFormClose} />}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el panel
              "{panelToDelete?.codigoParada}" y todos sus datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
