import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface SecureAvatarWithPreviewProps {
  avatarUrl: string | null | undefined;
  localPreview: string | null;
  fallbackText: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * A secure Avatar component that shows local preview when available,
 * otherwise fetches a signed URL for private storage buckets
 */
export function SecureAvatarWithPreview({ 
  avatarUrl, 
  localPreview,
  fallbackText, 
  alt, 
  className = "w-24 h-24",
  fallbackClassName = "bg-primary text-primary-foreground font-bold text-2xl"
}: SecureAvatarWithPreviewProps) {
  // Only fetch signed URL if we don't have a local preview
  const { signedUrl, loading } = useSignedUrl('worker-photos', localPreview ? null : avatarUrl);
  
  // Use local preview if available, otherwise use signed URL
  const displayUrl = localPreview || signedUrl;

  return (
    <Avatar className={cn(className)}>
      {displayUrl && !loading && (
        <AvatarImage src={displayUrl} alt={alt} />
      )}
      <AvatarFallback className={cn(fallbackClassName)}>
        {fallbackText.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
