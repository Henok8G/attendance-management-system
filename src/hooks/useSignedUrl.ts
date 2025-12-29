import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Hook to get a signed URL for a private storage file
 * @param bucketName - The storage bucket name
 * @param filePath - The file path within the bucket (can be full URL or just path)
 * @returns Object with signedUrl, loading state, and error
 */
export function useSignedUrl(bucketName: string, filePath: string | null | undefined) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setSignedUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchSignedUrl() {
      setLoading(true);
      setError(null);

      try {
        // Extract just the file path if a full URL was provided
        let path = filePath;
        
        // If it's a full Supabase storage URL, extract the path
        if (filePath.includes('/storage/v1/object/public/') || filePath.includes('/storage/v1/object/sign/')) {
          const parts = filePath.split(`/${bucketName}/`);
          if (parts.length > 1) {
            path = parts[1].split('?')[0]; // Remove any query params
          }
        }

        const { data, error: signError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

        if (cancelled) return;

        if (signError) {
          console.error('Error creating signed URL:', signError);
          setError(signError.message);
          setSignedUrl(null);
        } else {
          setSignedUrl(data.signedUrl);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Unexpected error creating signed URL:', err);
        setError('Failed to load image');
        setSignedUrl(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSignedUrl();

    return () => {
      cancelled = true;
    };
  }, [bucketName, filePath]);

  return { signedUrl, loading, error };
}

/**
 * Get a signed URL synchronously (for one-time use)
 * @param bucketName - The storage bucket name
 * @param filePath - The file path within the bucket
 * @returns Promise with the signed URL or null
 */
export async function getSignedUrl(bucketName: string, filePath: string | null | undefined): Promise<string | null> {
  if (!filePath) return null;

  try {
    // Extract just the file path if a full URL was provided
    let path = filePath;
    
    if (filePath.includes('/storage/v1/object/public/') || filePath.includes('/storage/v1/object/sign/')) {
      const parts = filePath.split(`/${bucketName}/`);
      if (parts.length > 1) {
        path = parts[1].split('?')[0];
      }
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Unexpected error creating signed URL:', err);
    return null;
  }
}
