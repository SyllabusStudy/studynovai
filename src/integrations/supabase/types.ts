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
          source_document: string | null
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
          source_document?: string | null
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
          source_document?: string | null
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
          created_at: string
          id: string
          message: string
          status: string
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          topic?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          topic?: string
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
      profiles: {
        Row: {
          created_at: string
          default_reminder_days: number
          email: string | null
          graduation_year: string | null
          id: string
          last_study_date: string | null
          major: string | null
          name: string | null
          notify_email: boolean
          school: string | null
          study_streak: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_reminder_days?: number
          email?: string | null
          graduation_year?: string | null
          id: string
          last_study_date?: string | null
          major?: string | null
          name?: string | null
          notify_email?: boolean
          school?: string | null
          study_streak?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_reminder_days?: number
          email?: string | null
          graduation_year?: string | null
          id?: string
          last_study_date?: string | null
          major?: string | null
          name?: string | null
          notify_email?: boolean
          school?: string | null
          study_streak?: number
          updated_at?: string
        }
        Relationships: []
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
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
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
          title: string
          transcript?: string | null
          updated_at?: string
          user_id: string
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
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
