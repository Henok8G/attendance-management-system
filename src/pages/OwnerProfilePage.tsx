import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AdminProfile } from '@/lib/types';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SecureAvatarWithPreview } from '@/components/ui/SecureAvatarWithPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Upload, Mail, Phone, User, KeyRound } from 'lucide-react';

export default function OwnerProfilePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    bio: '',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        bio: profile.bio || '',
      });
      setPhotoPreview(profile.avatar_url);
      setLoading(false);
    } else if (user && !authLoading) {
      // Profile might not exist yet
      setLoading(false);
    }
  }, [user, authLoading, profile, navigate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Photo must be under 5MB.', variant: 'destructive' });
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile || !user) return profile?.avatar_url || null;

    setUploading(true);
    const fileExt = photoFile.name.split('.').pop();
    // Use user.id as prefix to satisfy storage RLS policy
    const fileName = `${user.id}.${fileExt}`;

    // Use worker-photos bucket for admin photos too (reuse existing bucket)
    const { error: uploadError } = await supabase.storage
      .from('worker-photos')
      .upload(fileName, photoFile, { upsert: true });

    setUploading(false);

    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return profile?.avatar_url || null;
    }

    // Store just the file path, not the full URL
    // The client will generate signed URLs as needed
    return fileName;
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    let avatarUrl = profile?.avatar_url || null;
    if (photoFile) {
      avatarUrl = await uploadPhoto();
    }

    const { error } = await supabase.from('admin_profiles').update({
      full_name: formData.full_name || null,
      phone: formData.phone || null,
      bio: formData.bio || null,
      avatar_url: avatarUrl,
    }).eq('user_id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update profile.', variant: 'destructive' });
    } else {
      toast({ title: 'Profile updated' });
      setPhotoFile(null);
      // Refresh page to get updated profile
      window.location.reload();
    }
    setSaving(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResettingPassword(true);

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Password reset email sent', description: 'Check your inbox for the reset link.' });
    }
    setResettingPassword(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link to="/dashboard" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>

          <h1 className="text-2xl font-display font-bold mb-6">Owner Profile</h1>

          {/* Profile Photo */}
          <Card className="mb-6">
            <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-5 h-5" />Profile Photo</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <SecureAvatarWithPreview
                  avatarUrl={profile?.avatar_url}
                  localPreview={photoPreview}
                  fallbackText={formData.full_name || user?.email || '?'}
                  alt="Profile"
                  className="w-24 h-24"
                />
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="w-4 h-4 mr-2" />
                    {photoPreview ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Info */}
          <Card className="mb-6">
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Mail className="w-4 h-4" />Email</Label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input 
                  value={formData.full_name} 
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Your name"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Phone className="w-4 h-4" />Phone (optional)</Label>
                <Input 
                  value={formData.phone} 
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+251 9XX XXX XXXX"
                />
              </div>

              <div className="space-y-2">
                <Label>Bio / Notes</Label>
                <Textarea 
                  value={formData.bio} 
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="A short bio or notes about yourself"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="mb-6">
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" />Security</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                To change your password, we'll send a reset link to your email address.
              </p>
              <Button variant="outline" onClick={handlePasswordReset} disabled={resettingPassword}>
                {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Reset Password
              </Button>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button 
            onClick={handleSave} 
            disabled={saving || uploading}
            className="w-full gradient-gold text-brand-black font-semibold"
          >
            {(saving || uploading) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
