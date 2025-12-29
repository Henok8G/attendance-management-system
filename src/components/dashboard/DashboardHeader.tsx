import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { SecureAvatar } from '@/components/ui/SecureAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Scissors, Moon, Sun, Settings, Users, LogOut, User } from 'lucide-react';

export function DashboardHeader() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-7xl">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow-sm">
            <Scissors className="w-5 h-5 text-brand-black" />
          </div>
          <span className="font-display font-bold text-lg hidden sm:block">C-Mac</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <Link to="/workers">
            <Button variant="ghost" size="icon" aria-label="Workers">
              <Users className="w-5 h-5" />
            </Button>
          </Link>

          <Link to="/settings">
            <Button variant="ghost" size="icon" aria-label="Settings">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <SecureAvatar
                  avatarUrl={profile?.avatar_url}
                  fallbackText={profile?.full_name || 'Owner'}
                  alt={profile?.full_name || 'Owner'}
                  className="w-8 h-8"
                  fallbackClassName="bg-primary text-primary-foreground font-medium text-sm"
                />
                <span className="hidden sm:block">{profile?.full_name || 'Owner'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
