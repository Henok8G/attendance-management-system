import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

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
};

export default NotFound;
