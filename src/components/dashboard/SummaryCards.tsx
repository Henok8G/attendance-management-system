import { motion } from 'framer-motion';
import { DailySummary } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Users, LogIn, LogOut, UserX, Clock, Coffee } from 'lucide-react';

interface SummaryCardsProps {
  summary: DailySummary;
  loading: boolean;
}

const cards = [
  { key: 'totalWorkers', label: 'Total Workers', icon: Users, color: 'text-foreground' },
  { key: 'checkedIn', label: 'Checked In', icon: LogIn, color: 'text-status-in' },
  { key: 'checkedOut', label: 'Checked Out', icon: LogOut, color: 'text-muted-foreground' },
  { key: 'absent', label: 'Absent', icon: UserX, color: 'text-status-absent' },
  { key: 'late', label: 'Late', icon: Clock, color: 'text-status-late' },
  { key: 'onBreak', label: 'On Break', icon: Coffee, color: 'text-blue-400' },
];

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const value = summary[card.key as keyof DailySummary];

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card className="glass-card hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold">{loading ? '—' : value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
