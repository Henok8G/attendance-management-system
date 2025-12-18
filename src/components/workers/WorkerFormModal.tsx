import { useState, useEffect } from 'react';
import { Worker, WorkerRole } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface WorkerFormModalProps {
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  onSuccess: () => void;
}

export function WorkerFormModal({ open, onClose, worker, onSuccess }: WorkerFormModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'barber' as WorkerRole, salary: '' });

  useEffect(() => {
    if (worker) {
      setFormData({ name: worker.name, role: worker.role, salary: worker.salary || '' });
    } else {
      setFormData({ name: '', role: 'barber', salary: '' });
    }
  }, [worker, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (worker) {
      const { error } = await supabase.from('workers').update({
        name: formData.name,
        role: formData.role,
        salary: formData.salary || null,
      }).eq('id', worker.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update worker.', variant: 'destructive' });
      } else {
        toast({ title: 'Worker updated' });
        onSuccess();
        onClose();
      }
    } else {
      const { error } = await supabase.from('workers').insert({
        name: formData.name,
        role: formData.role,
        salary: formData.salary || null,
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to create worker.', variant: 'destructive' });
      } else {
        toast({ title: 'Worker created' });
        onSuccess();
        onClose();
      }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{worker ? 'Edit Worker' : 'Add New Worker'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as WorkerRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="barber">Barber</SelectItem>
                <SelectItem value="cleaner">Cleaner</SelectItem>
                <SelectItem value="receptionist">Receptionist</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="salary">Salary (optional)</Label>
            <Input id="salary" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} placeholder="e.g., 15,000 ETB" />
          </div>
          <Button type="submit" className="w-full gradient-gold text-brand-black font-semibold" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {worker ? 'Save Changes' : 'Add Worker'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
