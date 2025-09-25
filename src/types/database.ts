export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          email: string;
          email_filters: string[] | null;
          company: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          company?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          company?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_accounts: {
        Row: {
          id: string;
          client_id: string;
          email_address: string;
          access_token: string;
          refresh_token: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          email_address: string;
          access_token: string;
          refresh_token?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          email_address?: string;
          access_token?: string;
          refresh_token?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_logs: {
        Row: {
          id: string;
          email_account_id: string;
          message_id: string;
          subject: string;
          from_email: string;
          body: string;
          ai_response: string | null;
          status: string;
          tokens_used: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email_account_id: string;
          message_id: string;
          subject: string;
          from_email: string;
          body: string;
          ai_response?: string | null;
          status?: string;
          tokens_used?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email_account_id?: string;
          message_id?: string;
          subject?: string;
          from_email?: string;
          body?: string;
          ai_response?: string | null;
          status?: string;
          tokens_used?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_templates: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          writing_style: string;
          tone: string;
          signature: string;
          sample_emails: string[];
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          writing_style: string;
          email_filters?: string[];
          tone: string;
          signature: string;
          sample_emails?: string[];
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          name?: string;
          writing_style?: string;
          email_filters?: string[];
          tone?: string;
          signature?: string;
          sample_emails?: string[];
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      webhook_subscriptions: {
        Row: {
          id: string;
          email_account_id: string;
          subscription_id: string;
          webhook_url: string;
          client_state: string;
          expires_at: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email_account_id: string;
          subscription_id: string;
          webhook_url: string;
          client_state: string;
          expires_at: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email_account_id?: string;
          subscription_id?: string;
          webhook_url?: string;
          client_state?: string;
          expires_at?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}