import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Worker, WorkerRole } from '@/lib/types';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { WorkerCard } from '@/components/workers/WorkerCard';
import { WorkerFormModal } from '@/components/workers/WorkerFormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WorkersPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  const fetchWorkers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('name');

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to load workers.',
        variant: 'destructive',
      });
    } else {
      setWorkers(data as Worker[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
    fetchWorkers();
  }, [user, authLoading, navigate]);

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setShowFormModal(true);
  };

  const handleAddNew = () => {
    setEditingWorker(null);
    setShowFormModal(true);
  };

  const handleToggleActive = async (worker: Worker) => {
    const { error } = await supabase
      .from('workers')
      .update({ is_active: !worker.is_active })
      .eq('id', worker.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update worker status.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: worker.is_active ? 'Worker deactivated' : 'Worker activated',
        description: `${worker.name} has been ${worker.is_active ? 'deactivated' : 'reactivated'}.`,
      });
      fetchWorkers();
    }
  };

  const filteredWorkers = workers.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link to="/dashboard" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-display font-bold">Workers</h1>
              <p className="text-muted-foreground">Manage your team members</p>
            </div>
            <Button onClick={handleAddNew} className="gradient-gold text-brand-black font-semibold hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Worker
            </Button>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search workers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No workers found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkers.map((worker, index) => (
                <motion.div
                  key={worker.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <WorkerCard
                    worker={worker}
                    onEdit={() => handleEdit(worker)}
                    onToggleActive={() => handleToggleActive(worker)}
                    onRefresh={fetchWorkers}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      <WorkerFormModal
        open={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingWorker(null);
        }}
        worker={editingWorker}
        onSuccess={fetchWorkers}
      />
    </div>
  );
}
