import { useState, useEffect, useRef } from 'react';
import { Worker, WorkerRole } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, X } from 'lucide-react';

interface WorkerFormModalProps {
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  onSuccess: () => void;
}

export function WorkerFormModal({ open, onClose, worker, onSuccess }: WorkerFormModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'barber' as WorkerRole, salary: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (worker) {
      setFormData({ name: worker.name, role: worker.role, salary: worker.salary || '' });
      setPhotoPreview(worker.avatar_url);
    } else {
      setFormData({ name: '', role: 'barber', salary: '' });
      setPhotoPreview(null);
    }
    setPhotoFile(null);
  }, [worker, open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Photo must be under 5MB.', variant: 'destructive' });
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(worker?.avatar_url || null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadPhoto = async (workerId: string): Promise<string | null> => {
    if (!photoFile) return worker?.avatar_url || null;

    setUploading(true);
    const fileExt = photoFile.name.split('.').pop();
    const fileName = `${workerId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('worker-photos')
      .upload(fileName, photoFile, { upsert: true });

    setUploading(false);

    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return worker?.avatar_url || null;
    }

    // Store just the file path, not the full URL
    // The client will generate signed URLs as needed
    return fileName;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (worker) {
      // Editing existing worker
      let avatarUrl = worker.avatar_url;
      if (photoFile) {
        avatarUrl = await uploadPhoto(worker.id);
      }

      const { error } = await supabase.from('workers').update({
        name: formData.name,
        role: formData.role,
        salary: formData.salary || null,
        avatar_url: avatarUrl,
      }).eq('id', worker.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update worker.', variant: 'destructive' });
      } else {
        toast({ title: 'Worker updated' });
        onSuccess();
        onClose();
      }
    } else {
      // Creating new worker - first insert, then upload photo if provided
      const { data: newWorker, error } = await supabase.from('workers').insert({
        name: formData.name,
        role: formData.role,
        salary: formData.salary || null,
      }).select().single();

      if (error || !newWorker) {
        toast({ title: 'Error', description: 'Failed to create worker.', variant: 'destructive' });
      } else {
        // If photo was selected, upload and update the worker
        if (photoFile) {
          const avatarUrl = await uploadPhoto(newWorker.id);
          if (avatarUrl) {
            await supabase.from('workers').update({ avatar_url: avatarUrl }).eq('id', newWorker.id);
          }
        }
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
          {/* Photo Upload */}
          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                {photoPreview ? (
                  <AvatarImage src={photoPreview} alt="Worker photo" />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {formData.name.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  {photoPreview ? 'Change Photo' : 'Upload Photo'}
                </Button>
                {photoFile && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearPhoto}>
                    <X className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          
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
          <Button type="submit" className="w-full gradient-gold text-brand-black font-semibold" disabled={saving || uploading}>
            {(saving || uploading) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {worker ? 'Save Changes' : 'Add Worker'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
