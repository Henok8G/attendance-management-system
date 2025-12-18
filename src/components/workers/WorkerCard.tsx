import { Worker } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Power, Download } from 'lucide-react';
import QRCode from 'qrcode';

interface WorkerCardProps {
  worker: Worker;
  onEdit: () => void;
  onToggleActive: () => void;
  onRefresh: () => void;
}

export function WorkerCard({ worker, onEdit, onToggleActive }: WorkerCardProps) {
  const downloadQR = async () => {
    const url = await QRCode.toDataURL(`cmac:${worker.qr_secret}`, { width: 300 });
    const link = document.createElement('a');
    link.download = `${worker.name.replace(/\s+/g, '_')}_QR.png`;
    link.href = url;
    link.click();
  };

  return (
    <Card className={`glass-card transition-all hover:shadow-lg ${!worker.is_active ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shrink-0">
            {worker.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{worker.name}</h3>
              <Badge variant={worker.is_active ? 'default' : 'secondary'} className="shrink-0">
                {worker.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground capitalize">{worker.role}</p>
            {worker.salary && <p className="text-xs text-muted-foreground mt-1">Salary: {worker.salary}</p>}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onEdit} className="flex-1">
            <Edit2 className="w-4 h-4 mr-1" />Edit
          </Button>
          <Button variant="outline" size="sm" onClick={downloadQR}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToggleActive}>
            <Power className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
