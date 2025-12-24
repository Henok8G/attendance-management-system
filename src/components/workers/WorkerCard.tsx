import { Link } from 'react-router-dom';
import { Worker } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
    // Generate QR code with scan URL
    const scanUrl = `${window.location.origin}/scan?secret=${encodeURIComponent(worker.qr_secret)}`;
    const url = await QRCode.toDataURL(scanUrl, { width: 300 });
    const link = document.createElement('a');
    link.download = `${worker.name.replace(/\s+/g, '_')}_QR.png`;
    link.href = url;
    link.click();
  };

  return (
    <Card className={`glass-card transition-all hover:shadow-lg ${!worker.is_active ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <Link to={`/workers/${worker.id}`} className="block">
          <div className="flex items-start gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <Avatar className="w-12 h-12 shrink-0">
              {worker.avatar_url && <AvatarImage src={worker.avatar_url} alt={worker.name} />}
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-lg">
                {worker.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
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
        </Link>
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
