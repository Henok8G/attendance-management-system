import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Search, CalendarIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  viewMode: 'daily' | 'weekly';
  onViewModeChange: (mode: 'daily' | 'weekly') => void;
  showIncidentsOnly: boolean;
  onShowIncidentsOnlyChange: (value: boolean) => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  showIncidentsOnly,
  onShowIncidentsOnlyChange,
}: FilterBarProps) {
  const date = new Date(selectedDate + 'T00:00:00');

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div className="flex flex-1 gap-3 w-full sm:w-auto">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{format(date, 'MMM d, yyyy')}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && onDateChange(d.toISOString().split('T')[0])}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex gap-2">
        <Button
          variant={showIncidentsOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => onShowIncidentsOnlyChange(!showIncidentsOnly)}
          className={showIncidentsOnly ? 'bg-status-late text-white' : ''}
        >
          <AlertTriangle className="w-4 h-4 mr-1" />
          Incidents
        </Button>

        <div className="flex rounded-lg border border-border overflow-hidden">
          <Button
            variant={viewMode === 'daily' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('daily')}
            className="rounded-none"
          >
            Daily
          </Button>
          <Button
            variant={viewMode === 'weekly' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('weekly')}
            className="rounded-none"
          >
            Weekly
          </Button>
        </div>
      </div>
    </div>
  );
}
