import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Settings } from '@/lib/types';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  settings: Settings | null;
  loading: boolean;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  refetchSettings: () => Promise<void>;
}

const defaultSettings: Omit<Settings, 'id' | 'owner_id' | 'created_at' | 'updated_at'> = {
  default_start_time: '09:00',
  default_end_time: '18:00',
  late_threshold_minutes: 15,
  auto_refresh_interval: 15,
  realtime_enabled: true,
  show_incidents: true,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching settings:', error);
    }

    if (data) {
      setSettings(data as Settings);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, [user]);

  const updateSettings = async (updates: Partial<Settings>) => {
    if (!user || !settings) return;

    const { error } = await supabase
      .from('settings')
      .update(updates)
      .eq('owner_id', user.id);

    if (error) {
      console.error('Error updating settings:', error);
      throw error;
    }

    setSettings((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const refetchSettings = async () => {
    await fetchSettings();
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, refetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
