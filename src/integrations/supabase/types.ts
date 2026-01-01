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
      business_contexts: {
        Row: {
          annual_revenue: number | null
          compliance_frameworks: Json
          country: string
          created_at: string
          currency: string
          employee_count: number | null
          entity_size: string
          fiscal_year_end: string
          id: string
          industry: string
          is_default: boolean
          sub_industry: string | null
          updated_at: string
        }
        Insert: {
          annual_revenue?: number | null
          compliance_frameworks?: Json
          country?: string
          created_at?: string
          currency?: string
          employee_count?: number | null
          entity_size?: string
          fiscal_year_end?: string
          id?: string
          industry?: string
          is_default?: boolean
          sub_industry?: string | null
          updated_at?: string
        }
        Update: {
          annual_revenue?: number | null
          compliance_frameworks?: Json
          country?: string
          created_at?: string
          currency?: string
          employee_count?: number | null
          entity_size?: string
          fiscal_year_end?: string
          id?: string
          industry?: string
          is_default?: boolean
          sub_industry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      country_configs: {
        Row: {
          code: string
          created_at: string
          currency: string
          currency_symbol: string
          display_thresholds: Json
          flag: string
          is_active: boolean
          name: string
          size_thresholds: Json
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency: string
          currency_symbol: string
          display_thresholds: Json
          flag: string
          is_active?: boolean
          name: string
          size_thresholds: Json
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          currency_symbol?: string
          display_thresholds?: Json
          flag?: string
          is_active?: boolean
          name?: string
          size_thresholds?: Json
          updated_at?: string
        }
        Relationships: []
      }
      enrichment_types: {
        Row: {
          config_fields: Json
          created_at: string
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          config_fields?: Json
          created_at?: string
          description?: string | null
          icon?: string
          id: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          config_fields?: Json
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      entity_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      intents: {
        Row: {
          ai_confidence: number | null
          created_at: string
          description: string | null
          entities: Json
          generated_by: string
          generation_count: number | null
          id: string
          is_active: boolean
          last_generated_at: string | null
          last_generation_tokens: number | null
          module_id: string
          name: string
          resolution_flow: Json | null
          sub_module_id: string | null
          total_tokens_used: number | null
          training_phrases: Json
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          description?: string | null
          entities?: Json
          generated_by?: string
          generation_count?: number | null
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          last_generation_tokens?: number | null
          module_id: string
          name: string
          resolution_flow?: Json | null
          sub_module_id?: string | null
          total_tokens_used?: number | null
          training_phrases?: Json
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          description?: string | null
          entities?: Json
          generated_by?: string
          generation_count?: number | null
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          last_generation_tokens?: number | null
          module_id?: string
          name?: string
          resolution_flow?: Json | null
          sub_module_id?: string | null
          total_tokens_used?: number | null
          training_phrases?: Json
          updated_at?: string
        }
        Relationships: []
      }
      llm_configs: {
        Row: {
          api_key: string | null
          created_at: string
          endpoint: string | null
          id: string
          is_default: boolean
          max_tokens: number
          model: string
          provider: string
          system_prompt_override: string | null
          temperature: number
          total_input_tokens: number | null
          total_output_tokens: number | null
          total_requests: number | null
          total_tokens_used: number | null
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          endpoint?: string | null
          id?: string
          is_default?: boolean
          max_tokens?: number
          model?: string
          provider?: string
          system_prompt_override?: string | null
          temperature?: number
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          total_requests?: number | null
          total_tokens_used?: number | null
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          endpoint?: string | null
          id?: string
          is_default?: boolean
          max_tokens?: number
          model?: string
          provider?: string
          system_prompt_override?: string | null
          temperature?: number
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          total_requests?: number | null
          total_tokens_used?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      llm_providers: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          models: Json
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id: string
          is_active?: boolean
          models?: Json
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          models?: Json
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      llm_usage_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number
          intent_id: string | null
          latency_ms: number | null
          llm_config_id: string | null
          model: string
          output_tokens: number
          provider: string
          section: string
          status: string
          total_tokens: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          intent_id?: string | null
          latency_ms?: number | null
          llm_config_id?: string | null
          model: string
          output_tokens?: number
          provider: string
          section: string
          status?: string
          total_tokens?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          intent_id?: string | null
          latency_ms?: number | null
          llm_config_id?: string | null
          model?: string
          output_tokens?: number
          provider?: string
          section?: string
          status?: string
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_logs_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_usage_logs_llm_config_id_fkey"
            columns: ["llm_config_id"]
            isOneToOne: false
            referencedRelation: "llm_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          sub_modules: Json
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id: string
          is_active?: boolean
          name: string
          sort_order?: number
          sub_modules?: Json
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          sub_modules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      response_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
