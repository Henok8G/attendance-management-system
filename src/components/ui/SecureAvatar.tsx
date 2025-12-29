import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface SecureAvatarProps {
  avatarUrl: string | null | undefined;
  fallbackText: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * A secure Avatar component that uses signed URLs for private storage buckets
 */
export function SecureAvatar({ 
  avatarUrl, 
  fallbackText, 
  alt, 
  className = "w-12 h-12",
  fallbackClassName = "bg-primary text-primary-foreground font-bold text-lg"
}: SecureAvatarProps) {
  const { signedUrl, loading } = useSignedUrl('worker-photos', avatarUrl);

  return (
    <Avatar className={cn(className)}>
      {signedUrl && !loading && (
        <AvatarImage src={signedUrl} alt={alt} />
      )}
      <AvatarFallback className={cn(fallbackClassName)}>
        {fallbackText.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
