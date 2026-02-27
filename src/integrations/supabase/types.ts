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
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
          name: string | null
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
          name?: string | null
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
          name?: string | null
          sub_industry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_usage_logs: {
        Row: {
          conversation_id: string
          created_at: string
          duration_ms: number | null
          entity_id: string
          estimated_cost_usd: number
          id: string
          input_tokens: number
          message_count: number
          model: string
          org_id: string | null
          output_tokens: number
          provider: string
          tools_called_count: number
          tools_used: string[] | null
          total_tokens: number
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          entity_id: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          message_count?: number
          model?: string
          org_id?: string | null
          output_tokens?: number
          provider?: string
          tools_called_count?: number
          tools_used?: string[] | null
          total_tokens?: number
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          entity_id?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          message_count?: number
          model?: string
          org_id?: string | null
          output_tokens?: number
          provider?: string
          tools_called_count?: number
          tools_used?: string[] | null
          total_tokens?: number
          user_id?: string
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
      entities: {
        Row: {
          created_at: string
          currency: string | null
          entity_id: string
          gstin: string | null
          id: string
          is_default: boolean | null
          name: string
          org_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          entity_id: string
          gstin?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          org_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          entity_id?: string
          gstin?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string | null
          updated_at?: string
          user_id?: string | null
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
      feedback_log: {
        Row: {
          assistant_response: string | null
          conversation_id: string
          created_at: string
          entity_id: string
          explicit_feedback: string | null
          feedback_score: number | null
          id: string
          implicit_signals: Json | null
          intent_confidence: number | null
          intent_matched: string | null
          message_id: string
          model_used: string | null
          response_time_ms: number | null
          route_path: string
          token_cost: number | null
          tool_selection_strategy: string | null
          tools_loaded: string[] | null
          tools_used: string[] | null
          user_id: string
          user_message: string
        }
        Insert: {
          assistant_response?: string | null
          conversation_id: string
          created_at?: string
          entity_id: string
          explicit_feedback?: string | null
          feedback_score?: number | null
          id?: string
          implicit_signals?: Json | null
          intent_confidence?: number | null
          intent_matched?: string | null
          message_id: string
          model_used?: string | null
          response_time_ms?: number | null
          route_path: string
          token_cost?: number | null
          tool_selection_strategy?: string | null
          tools_loaded?: string[] | null
          tools_used?: string[] | null
          user_id: string
          user_message: string
        }
        Update: {
          assistant_response?: string | null
          conversation_id?: string
          created_at?: string
          entity_id?: string
          explicit_feedback?: string | null
          feedback_score?: number | null
          id?: string
          implicit_signals?: Json | null
          intent_confidence?: number | null
          intent_matched?: string | null
          message_id?: string
          model_used?: string | null
          response_time_ms?: number | null
          route_path?: string
          token_cost?: number | null
          tool_selection_strategy?: string | null
          tools_loaded?: string[] | null
          tools_used?: string[] | null
          user_id?: string
          user_message?: string
        }
        Relationships: []
      }
      intent_routing_stats: {
        Row: {
          avg_feedback_score: number | null
          avg_response_time_ms: number | null
          confidence_bucket: number
          created_at: string
          failed_attempts: number
          id: string
          intent_id: string
          intent_name: string
          last_attempt_at: string | null
          successful_attempts: number
          total_attempts: number
          updated_at: string
        }
        Insert: {
          avg_feedback_score?: number | null
          avg_response_time_ms?: number | null
          confidence_bucket: number
          created_at?: string
          failed_attempts?: number
          id?: string
          intent_id: string
          intent_name: string
          last_attempt_at?: string | null
          successful_attempts?: number
          total_attempts?: number
          updated_at?: string
        }
        Update: {
          avg_feedback_score?: number | null
          avg_response_time_ms?: number | null
          confidence_bucket?: number
          created_at?: string
          failed_attempts?: number
          id?: string
          intent_id?: string
          intent_name?: string
          last_attempt_at?: string | null
          successful_attempts?: number
          total_attempts?: number
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
      llm_path_patterns: {
        Row: {
          avg_feedback_score: number | null
          avg_response_time_ms: number | null
          created_at: string
          entity_id: string | null
          id: string
          last_seen_at: string
          occurrence_count: number
          query_hash: string
          query_text: string
          suggested_intent_id: string | null
          tool_selection_strategy: string | null
          tools_used: string[] | null
          updated_at: string
        }
        Insert: {
          avg_feedback_score?: number | null
          avg_response_time_ms?: number | null
          created_at?: string
          entity_id?: string | null
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          query_hash: string
          query_text: string
          suggested_intent_id?: string | null
          tool_selection_strategy?: string | null
          tools_used?: string[] | null
          updated_at?: string
        }
        Update: {
          avg_feedback_score?: number | null
          avg_response_time_ms?: number | null
          created_at?: string
          entity_id?: string | null
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          query_hash?: string
          query_text?: string
          suggested_intent_id?: string | null
          tool_selection_strategy?: string | null
          tools_used?: string[] | null
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
      mcp_tools_master: {
        Row: {
          avg_response_time_ms: number | null
          category: string
          created_at: string
          description: string | null
          display_name: string
          endpoint: string | null
          id: string
          input_schema: Json | null
          is_active: boolean
          last_called_at: string | null
          method: string
          tool_name: string
          total_calls: number
          updated_at: string
        }
        Insert: {
          avg_response_time_ms?: number | null
          category?: string
          created_at?: string
          description?: string | null
          display_name: string
          endpoint?: string | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean
          last_called_at?: string | null
          method?: string
          tool_name: string
          total_calls?: number
          updated_at?: string
        }
        Update: {
          avg_response_time_ms?: number | null
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          endpoint?: string | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean
          last_called_at?: string | null
          method?: string
          tool_name?: string
          total_calls?: number
          updated_at?: string
        }
        Relationships: []
      }
      meta_account_health: {
        Row: {
          account_status: string
          current_quality_score: number
          id: string
          messages_sent_today: number
          messaging_limit: string
          quality_rating: string
          templates_approved_30d: number
          templates_rejected_30d: number
          templates_submitted_today: number
          updated_at: string
        }
        Insert: {
          account_status?: string
          current_quality_score?: number
          id?: string
          messages_sent_today?: number
          messaging_limit?: string
          quality_rating?: string
          templates_approved_30d?: number
          templates_rejected_30d?: number
          templates_submitted_today?: number
          updated_at?: string
        }
        Update: {
          account_status?: string
          current_quality_score?: number
          id?: string
          messages_sent_today?: number
          messaging_limit?: string
          quality_rating?: string
          templates_approved_30d?: number
          templates_rejected_30d?: number
          templates_submitted_today?: number
          updated_at?: string
        }
        Relationships: []
      }
      meta_blocked_content: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          pattern: string
          pattern_type: string
          severity: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pattern: string
          pattern_type?: string
          severity?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pattern?: string
          pattern_type?: string
          severity?: string
        }
        Relationships: []
      }
      meta_messaging_consent: {
        Row: {
          consent_source: string
          consent_type: string
          consented_at: string
          created_at: string
          entity_id: string | null
          id: string
          is_active: boolean
          opted_out_at: string | null
          org_id: string | null
          phone_e164: string
          updated_at: string
        }
        Insert: {
          consent_source: string
          consent_type?: string
          consented_at?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          is_active?: boolean
          opted_out_at?: string | null
          org_id?: string | null
          phone_e164: string
          updated_at?: string
        }
        Update: {
          consent_source?: string
          consent_type?: string
          consented_at?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          is_active?: boolean
          opted_out_at?: string | null
          org_id?: string | null
          phone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_rate_limits: {
        Row: {
          action_type: string
          created_at: string
          id: string
          window_end: string
          window_start: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          window_end: string
          window_start?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      meta_template_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          meta_response: Json | null
          submitted_by: string | null
          template_name: string
          validation_result: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta_response?: Json | null
          submitted_by?: string | null
          template_name: string
          validation_result?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta_response?: Json | null
          submitted_by?: string | null
          template_name?: string
          validation_result?: Json | null
        }
        Relationships: []
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
      quick_suggestions: {
        Row: {
          created_at: string
          entity_id: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          label: string
          message: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          message: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          message?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      response_cache: {
        Row: {
          cache_key: string
          content: string
          created_at: string
          entity_id: string
          id: string
          path: string | null
          query_hash: string
          query_text: string | null
          ttl_seconds: number | null
        }
        Insert: {
          cache_key: string
          content: string
          created_at?: string
          entity_id: string
          id?: string
          path?: string | null
          query_hash: string
          query_text?: string | null
          ttl_seconds?: number | null
        }
        Update: {
          cache_key?: string
          content?: string
          created_at?: string
          entity_id?: string
          id?: string
          path?: string | null
          query_hash?: string
          query_text?: string | null
          ttl_seconds?: number | null
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
      suggested_intents: {
        Row: {
          avg_feedback_score: number | null
          created_at: string
          id: string
          occurrence_count: number
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_pattern_id: string | null
          status: string
          suggested_module: string | null
          suggested_name: string
          suggested_pipeline: Json | null
          suggested_tools: string[] | null
          suggested_training_phrases: Json
          updated_at: string
        }
        Insert: {
          avg_feedback_score?: number | null
          created_at?: string
          id?: string
          occurrence_count?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_pattern_id?: string | null
          status?: string
          suggested_module?: string | null
          suggested_name: string
          suggested_pipeline?: Json | null
          suggested_tools?: string[] | null
          suggested_training_phrases?: Json
          updated_at?: string
        }
        Update: {
          avg_feedback_score?: number | null
          created_at?: string
          id?: string
          occurrence_count?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_pattern_id?: string | null
          status?: string
          suggested_module?: string | null
          suggested_name?: string
          suggested_pipeline?: Json | null
          suggested_tools?: string[] | null
          suggested_training_phrases?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_intents_source_pattern_id_fkey"
            columns: ["source_pattern_id"]
            isOneToOne: false
            referencedRelation: "llm_path_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      template_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          new_status: string
          notification_type: string
          previous_status: string | null
          rejection_reason: string | null
          template_id: string
          template_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          new_status: string
          notification_type: string
          previous_status?: string | null
          rejection_reason?: string | null
          template_id: string
          template_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          new_status?: string
          notification_type?: string
          previous_status?: string | null
          rejection_reason?: string | null
          template_id?: string
          template_name?: string
        }
        Relationships: []
      }
      tool_registry: {
        Row: {
          avg_feedback_score: number | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          is_write: boolean | null
          keywords: string[]
          module: string
          schema: Json | null
          sub_module: string | null
          token_cost: number | null
          tool_name: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          avg_feedback_score?: number | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          is_write?: boolean | null
          keywords?: string[]
          module: string
          schema?: Json | null
          sub_module?: string | null
          token_cost?: number | null
          tool_name: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          avg_feedback_score?: number | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_write?: boolean | null
          keywords?: string[]
          module?: string
          schema?: Json | null
          sub_module?: string | null
          token_cost?: number | null
          tool_name?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      unified_conversations: {
        Row: {
          auto_generated_name: string | null
          chat_display_id: string | null
          chat_name: string | null
          chat_number: number | null
          conversation_id: string
          created_at: string
          entity_id: string
          id: string
          is_deleted: boolean | null
          last_message_preview: string | null
          message_count: number | null
          messages: Json
          mode: string | null
          org_id: string | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_generated_name?: string | null
          chat_display_id?: string | null
          chat_name?: string | null
          chat_number?: number | null
          conversation_id: string
          created_at?: string
          entity_id: string
          id?: string
          is_deleted?: boolean | null
          last_message_preview?: string | null
          message_count?: number | null
          messages?: Json
          mode?: string | null
          org_id?: string | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_generated_name?: string | null
          chat_display_id?: string | null
          chat_name?: string | null
          chat_number?: number | null
          conversation_id?: string
          created_at?: string
          entity_id?: string
          id?: string
          is_deleted?: boolean | null
          last_message_preview?: string | null
          message_count?: number | null
          messages?: Json
          mode?: string | null
          org_id?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string
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
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          entity_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          media_content_type: string | null
          media_url: string | null
          message_type: string
          org_id: string | null
          phone_e164: string
          processing_status: string
          template_key: string | null
          twilio_sid: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction?: string
          entity_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_content_type?: string | null
          media_url?: string | null
          message_type?: string
          org_id?: string | null
          phone_e164: string
          processing_status?: string
          template_key?: string | null
          twilio_sid?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          entity_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_content_type?: string | null
          media_url?: string | null
          message_type?: string
          org_id?: string | null
          phone_e164?: string
          processing_status?: string
          template_key?: string | null
          twilio_sid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          buttons: Json
          category: string
          country_codes: string[]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_template: boolean
          message_body: string
          meta_quality_score: string | null
          meta_rejection_reason: string | null
          meta_reviewed_at: string | null
          meta_status: string | null
          meta_submitted_at: string | null
          meta_template_id: string | null
          name: string
          sort_order: number
          template_key: string
          twilio_sid: string | null
          updated_at: string
          variables: Json
          whatsapp_category: string
        }
        Insert: {
          buttons?: Json
          category?: string
          country_codes?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          message_body?: string
          meta_quality_score?: string | null
          meta_rejection_reason?: string | null
          meta_reviewed_at?: string | null
          meta_status?: string | null
          meta_submitted_at?: string | null
          meta_template_id?: string | null
          name: string
          sort_order?: number
          template_key: string
          twilio_sid?: string | null
          updated_at?: string
          variables?: Json
          whatsapp_category?: string
        }
        Update: {
          buttons?: Json
          category?: string
          country_codes?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          message_body?: string
          meta_quality_score?: string | null
          meta_rejection_reason?: string | null
          meta_reviewed_at?: string | null
          meta_status?: string | null
          meta_submitted_at?: string | null
          meta_template_id?: string | null
          name?: string
          sort_order?: number
          template_key?: string
          twilio_sid?: string | null
          updated_at?: string
          variables?: Json
          whatsapp_category?: string
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
