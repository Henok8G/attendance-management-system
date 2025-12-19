export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          id: string
          is_late: boolean
          notes: string | null
          scanner_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          id?: string
          is_late?: boolean
          notes?: string | null
          scanner_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          id?: string
          is_late?: boolean
          notes?: string | null
          scanner_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_scanner_id_fkey"
            columns: ["scanner_id"]
            isOneToOne: false
            referencedRelation: "scanners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          incident_type: string
          occurred_at: string
          resolved: boolean
          scanner_id: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          incident_type: string
          occurred_at?: string
          resolved?: boolean
          scanner_id?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          incident_type?: string
          occurred_at?: string
          resolved?: boolean
          scanner_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_scanner_id_fkey"
            columns: ["scanner_id"]
            isOneToOne: false
            referencedRelation: "scanners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      scanners: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          auto_refresh_interval: number
          created_at: string
          default_end_time: string
          default_start_time: string
          id: string
          late_threshold_minutes: number
          owner_id: string
          realtime_enabled: boolean
          show_incidents: boolean
          updated_at: string
        }
        Insert: {
          auto_refresh_interval?: number
          created_at?: string
          default_end_time?: string
          default_start_time?: string
          id?: string
          late_threshold_minutes?: number
          owner_id: string
          realtime_enabled?: boolean
          show_incidents?: boolean
          updated_at?: string
        }
        Update: {
          auto_refresh_interval?: number
          created_at?: string
          default_end_time?: string
          default_start_time?: string
          id?: string
          late_threshold_minutes?: number
          owner_id?: string
          realtime_enabled?: boolean
          show_incidents?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      worker_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_notes_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          avatar_url: string | null
          birthdate: string | null
          contract_end_date: string | null
          created_at: string
          custom_end_time: string | null
          custom_start_time: string | null
          description: string | null
          employment_type: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          name: string
          qr_secret: string
          role: Database["public"]["Enums"]["worker_role"]
          salary: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birthdate?: string | null
          contract_end_date?: string | null
          created_at?: string
          custom_end_time?: string | null
          custom_start_time?: string | null
          description?: string | null
          employment_type?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          qr_secret?: string
          role?: Database["public"]["Enums"]["worker_role"]
          salary?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birthdate?: string | null
          contract_end_date?: string | null
          created_at?: string
          custom_end_time?: string | null
          custom_start_time?: string | null
          description?: string | null
          employment_type?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          qr_secret?: string
          role?: Database["public"]["Enums"]["worker_role"]
          salary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_status: "in" | "out" | "late" | "absent"
      worker_role: "barber" | "cleaner" | "receptionist" | "manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attendance_status: ["in", "out", "late", "absent"],
      worker_role: ["barber", "cleaner", "receptionist", "manager"],
    },
  },
} as const
