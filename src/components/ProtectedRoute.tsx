import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">You need to log in</h1>
          <p className="text-muted-foreground">Please sign in to access this page.</p>
          <Link to="/auth">
            <Button className="gap-2 mt-2">
              <LogIn className="w-4 h-4" />
              Go to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
