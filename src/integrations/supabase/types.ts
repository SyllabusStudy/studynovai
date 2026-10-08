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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          messages: Json
          study_mode: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          messages?: Json
          study_mode?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          messages?: Json
          study_mode?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memory: {
        Row: {
          class_id: string | null
          content: string
          created_at: string
          id: string
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          content: string
          created_at?: string
          id?: string
          kind?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_trial_uses: {
        Row: {
          bucket: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          bucket: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          bucket?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body_html: string
          body_text: string
          created_by: string
          failed: number
          id: string
          preview_text: string | null
          prompt: string | null
          recipients: number
          sent_at: string
          subject: string
        }
        Insert: {
          body_html: string
          body_text: string
          created_by: string
          failed?: number
          id?: string
          preview_text?: string | null
          prompt?: string | null
          recipients?: number
          sent_at?: string
          subject: string
        }
        Update: {
          body_html?: string
          body_text?: string
          created_by?: string
          failed?: number
          id?: string
          preview_text?: string | null
          prompt?: string | null
          recipients?: number
          sent_at?: string
          subject?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          account_email: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          reconnect_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          category: string | null
          class_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          points_earned: number | null
          points_possible: number | null
          priority: string
          reminder_days: number | null
          reminder_minutes: number | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          class_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          points_earned?: number | null
          points_possible?: number | null
          priority?: string
          reminder_days?: number | null
          reminder_minutes?: number | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          class_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          points_earned?: number | null
          points_possible?: number | null
          priority?: string
          reminder_days?: number | null
          reminder_minutes?: number | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assignment_id: string | null
          class_id: string | null
          created_at: string
          description: string | null
          event_date: string
          event_time: string | null
          event_type: string
          id: string
          reminder_days: number | null
          reminder_minutes: number | null
          source_document: string | null
          sync_key: string | null
          title: string
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          class_id?: string | null
          created_at?: string
          description?: string | null
          event_date: string
          event_time?: string | null
          event_type?: string
          id?: string
          reminder_days?: number | null
          reminder_minutes?: number | null
          source_document?: string | null
          sync_key?: string | null
          title: string
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          class_id?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          event_type?: string
          id?: string
          reminder_days?: number | null
          reminder_minutes?: number | null
          source_document?: string | null
          sync_key?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_source_document_fkey"
            columns: ["source_document"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feeds: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          label: string
          last_count: number | null
          last_synced_at: string | null
          url: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          label?: string
          last_count?: number | null
          last_synced_at?: string | null
          url: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          label?: string
          last_count?: number | null
          last_synced_at?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          attendance_policy: string | null
          class_name: string
          color: string
          course_code: string | null
          created_at: string
          id: string
          late_work_policy: string | null
          makeup_policy: string | null
          office_hours: string | null
          professor: string | null
          professor_email: string | null
          required_materials: string | null
          semester: string | null
          target_grade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_policy?: string | null
          class_name: string
          color?: string
          course_code?: string | null
          created_at?: string
          id?: string
          late_work_policy?: string | null
          makeup_policy?: string | null
          office_hours?: string | null
          professor?: string | null
          professor_email?: string | null
          required_materials?: string | null
          semester?: string | null
          target_grade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_policy?: string | null
          class_name?: string
          color?: string
          course_code?: string | null
          created_at?: string
          id?: string
          late_work_policy?: string | null
          makeup_policy?: string | null
          office_hours?: string | null
          professor?: string | null
          professor_email?: string | null
          required_materials?: string | null
          semester?: string | null
          target_grade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          ai_help: string | null
          annotations: Json | null
          assignment_id: string | null
          category: string | null
          class_id: string | null
          created_at: string
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          is_syllabus: boolean
          processing_error: string | null
          processing_status: string
          source: string
          storage_path: string
          syllabus_data: Json | null
          user_id: string
        }
        Insert: {
          ai_help?: string | null
          annotations?: Json | null
          assignment_id?: string | null
          category?: string | null
          class_id?: string | null
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_syllabus?: boolean
          processing_error?: string | null
          processing_status?: string
          source?: string
          storage_path: string
          syllabus_data?: Json | null
          user_id: string
        }
        Update: {
          ai_help?: string | null
          annotations?: Json | null
          assignment_id?: string | null
          category?: string | null
          class_id?: string | null
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_syllabus?: boolean
          processing_error?: string | null
          processing_status?: string
          source?: string
          storage_path?: string
          syllabus_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          page: string | null
          rating: number | null
          status: string
          topic: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          message: string
          page?: string | null
          rating?: number | null
          status?: string
          topic?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          page?: string | null
          rating?: number | null
          status?: string
          topic?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          back: string
          class_id: string | null
          created_at: string
          deck: string | null
          difficulty: string
          flagged: boolean
          front: string
          id: string
          next_review: string | null
          times_correct: number
          times_reviewed: number
          topic: string | null
          user_id: string
        }
        Insert: {
          back: string
          class_id?: string | null
          created_at?: string
          deck?: string | null
          difficulty?: string
          flagged?: boolean
          front: string
          id?: string
          next_review?: string | null
          times_correct?: number
          times_reviewed?: number
          topic?: string | null
          user_id: string
        }
        Update: {
          back?: string
          class_id?: string | null
          created_at?: string
          deck?: string | null
          difficulty?: string
          flagged?: boolean
          front?: string
          id?: string
          next_review?: string | null
          times_correct?: number
          times_reviewed?: number
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_categories: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
          user_id: string
          weight: number
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
          user_id: string
          weight?: number
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_categories_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_notes: {
        Row: {
          class_id: string | null
          created_at: string
          deck: string | null
          document_id: string | null
          id: string
          key_concepts: Json
          summary: string
          title: string
          transcript: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          deck?: string | null
          document_id?: string | null
          id?: string
          key_concepts?: Json
          summary?: string
          title: string
          transcript?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          deck?: string | null
          document_id?: string | null
          id?: string
          key_concepts?: Json
          summary?: string
          title?: string
          transcript?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecture_notes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_notes: {
        Row: {
          class_id: string | null
          content: Json
          created_at: string
          drawing: Json
          editor_mode: string
          id: string
          plain_text: string
          revision: number
          title: string
          title_is_auto: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          content?: Json
          created_at?: string
          drawing?: Json
          editor_mode?: string
          id?: string
          plain_text?: string
          revision?: number
          title?: string
          title_is_auto?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          content?: Json
          created_at?: string
          drawing?: Json
          editor_mode?: string
          id?: string
          plain_text?: string
          revision?: number
          title?: string
          title_is_auto?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_settings: {
        Row: {
          compare_price_usd: number | null
          id: boolean
          price_usd: number
          sale_active: boolean
          sale_label: string
          sale_note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          compare_price_usd?: number | null
          id?: boolean
          price_usd?: number
          sale_active?: boolean
          sale_label?: string
          sale_note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          compare_price_usd?: number | null
          id?: boolean
          price_usd?: number
          sale_active?: boolean
          sale_label?: string
          sale_note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_class_id: string | null
          created_at: string
          default_reminder_days: number
          default_reminder_minutes: number
          email: string | null
          graduation_year: string | null
          help_goals: string[]
          id: string
          last_study_date: string | null
          major: string | null
          name: string | null
          notify_email: boolean
          notify_news: boolean
          notify_push: boolean
          onboarding_done: boolean
          school: string | null
          seasonal_theme: string
          study_streak: number
          updated_at: string
        }
        Insert: {
          active_class_id?: string | null
          created_at?: string
          default_reminder_days?: number
          default_reminder_minutes?: number
          email?: string | null
          graduation_year?: string | null
          help_goals?: string[]
          id: string
          last_study_date?: string | null
          major?: string | null
          name?: string | null
          notify_email?: boolean
          notify_news?: boolean
          notify_push?: boolean
          onboarding_done?: boolean
          school?: string | null
          seasonal_theme?: string
          study_streak?: number
          updated_at?: string
        }
        Update: {
          active_class_id?: string | null
          created_at?: string
          default_reminder_days?: number
          default_reminder_minutes?: number
          email?: string | null
          graduation_year?: string | null
          help_goals?: string[]
          id?: string
          last_study_date?: string | null
          major?: string | null
          name?: string | null
          notify_email?: boolean
          notify_news?: boolean
          notify_push?: boolean
          onboarding_done?: boolean
          school?: string | null
          seasonal_theme?: string
          study_streak?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_class_id_fkey"
            columns: ["active_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          label: string | null
          max_redemptions: number | null
          percent_off: number | null
          redemptions: number
          stripe_promotion_code_id: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string | null
          max_redemptions?: number | null
          percent_off?: number | null
          redemptions?: number
          stripe_promotion_code_id?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string | null
          max_redemptions?: number | null
          percent_off?: number | null
          redemptions?: number
          stripe_promotion_code_id?: string | null
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          id: string
          promo_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          promo_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          promo_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          answers: Json | null
          class_id: string | null
          completed_at: string | null
          created_at: string
          difficulty: string
          id: string
          questions: Json
          score: number | null
          title: string
          user_id: string
          weak_topics: Json | null
        }
        Insert: {
          answers?: Json | null
          class_id?: string | null
          completed_at?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          questions?: Json
          score?: number | null
          title: string
          user_id: string
          weak_topics?: Json | null
        }
        Update: {
          answers?: Json | null
          class_id?: string | null
          completed_at?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          questions?: Json
          score?: number | null
          title?: string
          user_id?: string
          weak_topics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_deliveries: {
        Row: {
          channel: string
          created_at: string
          id: string
          remind_at: string
          source_id: string
          source_kind: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          remind_at: string
          source_id: string
          source_kind: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          remind_at?: string
          source_id?: string
          source_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      school_links: {
        Row: {
          category: string
          class_id: string | null
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          category?: string
          class_id?: string | null
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          category?: string
          class_id?: string | null
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_links_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_items: {
        Row: {
          created_at: string
          kind: string
          payload: Json
          ref: string
          title: string
          token: string
          user_id: string
          views: number
        }
        Insert: {
          created_at?: string
          kind: string
          payload: Json
          ref: string
          title: string
          token?: string
          user_id: string
          views?: number
        }
        Update: {
          created_at?: string
          kind?: string
          payload?: Json
          ref?: string
          title?: string
          token?: string
          user_id?: string
          views?: number
        }
        Relationships: []
      }
      snap_conversations: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          image_data_url: string | null
          messages: Json
          mode: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          image_data_url?: string | null
          messages?: Json
          mode?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          image_data_url?: string | null
          messages?: Json
          mode?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_activity: {
        Row: {
          activity_type: string
          created_at: string
          day: string
          id: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          day: string
          id?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          day?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      study_progress: {
        Row: {
          class_id: string | null
          id: string
          last_studied: string
          mastery_score: number
          topic: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          id?: string
          last_studied?: string
          mastery_score?: number
          topic: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          id?: string
          last_studied?: string
          mastery_score?: number
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_progress_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          environment: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ai_keys: {
        Row: {
          api_key: string
          created_at: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          last_seen: string
          notify_enabled: boolean
          push_auth: string | null
          push_endpoint: string | null
          push_p256dh: string | null
          push_subscribed_at: string | null
          revoked: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          kind?: string
          label: string
          last_seen?: string
          notify_enabled?: boolean
          push_auth?: string | null
          push_endpoint?: string | null
          push_p256dh?: string | null
          push_subscribed_at?: string | null
          revoked?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          last_seen?: string
          notify_enabled?: boolean
          push_auth?: string | null
          push_endpoint?: string | null
          push_p256dh?: string | null
          push_subscribed_at?: string | null
          revoked?: boolean
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
          role: Database["public"]["Enums"]["app_role"]
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
      video_notes: {
        Row: {
          chat: Json
          class_id: string | null
          created_at: string
          id: string
          notes: string | null
          source_type: string
          source_url: string | null
          status: string
          summary: string | null
          thumbnail_url: string | null
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
          work_document_id: string | null
          work_draft: string | null
          work_file_name: string | null
        }
        Insert: {
          chat?: Json
          class_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          thumbnail_url?: string | null
          title: string
          transcript?: string | null
          updated_at?: string
          user_id: string
          work_document_id?: string | null
          work_draft?: string | null
          work_file_name?: string | null
        }
        Update: {
          chat?: Json
          class_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          thumbnail_url?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
          work_document_id?: string | null
          work_draft?: string | null
          work_file_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_notes_work_document_id_fkey"
            columns: ["work_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_ai_trial: { Args: { _bucket: string }; Returns: boolean }
      get_shared_item: {
        Args: { _token: string }
        Returns: {
          kind: string
          payload: Json
          title: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_pro: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
