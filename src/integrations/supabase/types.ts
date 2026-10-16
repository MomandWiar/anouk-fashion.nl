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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          employee_id: string | null
          id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          id?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount_cents: number
          cash_session_id: string
          created_at: string
          employee_id: string | null
          id: string
          kind: string
          reason: string
        }
        Insert: {
          amount_cents: number
          cash_session_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          kind: string
          reason: string
        }
        Update: {
          amount_cents?: number
          cash_session_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          kind?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          close_note: string | null
          closed_at: string | null
          closed_by: string | null
          counted_cents: number | null
          denominations: Json | null
          difference_cents: number | null
          expected_cents: number | null
          id: string
          opened_at: string
          opened_by: string | null
          provisional: boolean
          register_id: string
          start_cents: number
          status: string
          summary: Json | null
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          counted_cents?: number | null
          denominations?: Json | null
          difference_cents?: number | null
          expected_cents?: number | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          provisional?: boolean
          register_id: string
          start_cents: number
          status?: string
          summary?: Json | null
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          counted_cents?: number | null
          denominations?: Json | null
          difference_cents?: number | null
          expected_cents?: number | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          provisional?: boolean
          register_id?: string
          start_cents?: number
          status?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          min_stock: number | null
          name: string
          sort_order: number
          stock_qty: number
          track_stock: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          min_stock?: number | null
          name: string
          sort_order?: number
          stock_qty?: number
          track_stock?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          min_stock?: number | null
          name?: string
          sort_order?: number
          stock_qty?: number
          track_stock?: boolean
        }
        Relationships: []
      }
      employee_pins: {
        Row: {
          employee_id: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
        }
        Insert: {
          employee_id: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
        }
        Update: {
          employee_id?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          has_pin: boolean
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          has_pin?: boolean
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          has_pin?: boolean
          id?: string
          name?: string
        }
        Relationships: []
      }
      gift_card_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          employee_id: string | null
          gift_card_id: string
          id: string
          kind: string
          sale_id: string | null
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          employee_id?: string | null
          gift_card_id: string
          id?: string
          kind: string
          sale_id?: string | null
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          employee_id?: string | null
          gift_card_id?: string
          id?: string
          kind?: string
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance_cents: number
          code: string
          created_at: string
          id: string
          initial_cents: number
          issued_sale_id: string | null
          status: string
        }
        Insert: {
          balance_cents: number
          code: string
          created_at?: string
          id?: string
          initial_cents: number
          issued_sale_id?: string | null
          status?: string
        }
        Update: {
          balance_cents?: number
          code?: string
          created_at?: string
          id?: string
          initial_cents?: number
          issued_sale_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_issued_sale_id_fkey"
            columns: ["issued_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      parked_carts: {
        Row: {
          cart: Json
          created_at: string
          employee_id: string | null
          id: string
          label: string | null
        }
        Insert: {
          cart: Json
          created_at?: string
          employee_id?: string | null
          id?: string
          label?: string | null
        }
        Update: {
          cart?: Json
          created_at?: string
          employee_id?: string | null
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parked_carts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          cart_ref: string
          created_at: string
          employee_id: string | null
          id: string
          method: string
          note: string | null
          provider_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cart_ref: string
          created_at?: string
          employee_id?: string | null
          id: string
          method: string
          note?: string | null
          provider_reference?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cart_ref?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          method?: string
          note?: string | null
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          change_cents: number | null
          created_at: string
          gift_card_id: string | null
          id: string
          manual_confirmed: boolean
          method: string
          provider_reference: string | null
          sale_id: string
          tendered_cents: number | null
        }
        Insert: {
          amount_cents: number
          change_cents?: number | null
          created_at?: string
          gift_card_id?: string | null
          id?: string
          manual_confirmed?: boolean
          method: string
          provider_reference?: string | null
          sale_id: string
          tendered_cents?: number | null
        }
        Update: {
          amount_cents?: number
          change_cents?: number | null
          created_at?: string
          gift_card_id?: string | null
          id?: string
          manual_confirmed?: boolean
          method?: string
          provider_reference?: string | null
          sale_id?: string
          tendered_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          category_id: string | null
          color: string | null
          cost_cents: number | null
          created_at: string
          id: string
          min_stock: number | null
          name: string
          price_cents: number
          size: string | null
          stock_qty: number
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          category_id?: string | null
          color?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          min_stock?: number | null
          name: string
          price_cents: number
          size?: string | null
          stock_qty?: number
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          category_id?: string | null
          color?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          min_stock?: number | null
          name?: string
          price_cents?: number
          size?: string | null
          stock_qty?: number
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          category_ids: string[]
          created_at: string
          ends_on: string | null
          id: string
          name: string
          price_cents: number
          product_ids: string[]
          qty: number
          starts_on: string | null
        }
        Insert: {
          active?: boolean
          category_ids?: string[]
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          price_cents: number
          product_ids?: string[]
          qty: number
          starts_on?: string | null
        }
        Update: {
          active?: boolean
          category_ids?: string[]
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          price_cents?: number
          product_ids?: string[]
          qty?: number
          starts_on?: string | null
        }
        Relationships: []
      }
      registers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      return_lines: {
        Row: {
          amount_cents: number
          category_id: string | null
          description: string
          id: string
          product_id: string | null
          qty: number
          restock: boolean
          return_id: string
          sale_line_id: string | null
          stock_mode: string
        }
        Insert: {
          amount_cents: number
          category_id?: string | null
          description: string
          id?: string
          product_id?: string | null
          qty: number
          restock?: boolean
          return_id: string
          sale_line_id?: string | null
          stock_mode?: string
        }
        Update: {
          amount_cents?: number
          category_id?: string | null
          description?: string
          id?: string
          product_id?: string | null
          qty?: number
          restock?: boolean
          return_id?: string
          sale_line_id?: string | null
          stock_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          cash_session_id: string | null
          created_at: string
          credit_used_cents: number
          employee_id: string | null
          exception_note: string | null
          exchange_sale_id: string | null
          id: string
          is_test: boolean
          kind: string
          no_receipt: boolean
          original_sale_id: string | null
          outside_window: boolean
          reason: string
          refund_method: string | null
          refund_paid_cents: number
          refund_total_cents: number
        }
        Insert: {
          cash_session_id?: string | null
          created_at?: string
          credit_used_cents?: number
          employee_id?: string | null
          exception_note?: string | null
          exchange_sale_id?: string | null
          id: string
          is_test?: boolean
          kind: string
          no_receipt?: boolean
          original_sale_id?: string | null
          outside_window?: boolean
          reason: string
          refund_method?: string | null
          refund_paid_cents?: number
          refund_total_cents: number
        }
        Update: {
          cash_session_id?: string | null
          created_at?: string
          credit_used_cents?: number
          employee_id?: string | null
          exception_note?: string | null
          exchange_sale_id?: string | null
          id?: string
          is_test?: boolean
          kind?: string
          no_receipt?: boolean
          original_sale_id?: string | null
          outside_window?: boolean
          reason?: string
          refund_method?: string | null
          refund_paid_cents?: number
          refund_total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "returns_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          category_id: string | null
          color: string | null
          cost_cents: number | null
          description: string
          discount_cents: number
          discount_note: string | null
          final_cents: number
          gift_card_id: string | null
          id: string
          kind: string
          line_no: number
          original_cents: number
          oversold: boolean
          price_overridden: boolean
          product_id: string | null
          promotion_id: string | null
          qty: number
          refunded_cents: number
          returned_qty: number
          sale_id: string
          size: string | null
          stock_mode: string
          unit_price_cents: number
        }
        Insert: {
          category_id?: string | null
          color?: string | null
          cost_cents?: number | null
          description: string
          discount_cents?: number
          discount_note?: string | null
          final_cents: number
          gift_card_id?: string | null
          id?: string
          kind: string
          line_no: number
          original_cents: number
          oversold?: boolean
          price_overridden?: boolean
          product_id?: string | null
          promotion_id?: string | null
          qty: number
          refunded_cents?: number
          returned_qty?: number
          sale_id: string
          size?: string | null
          stock_mode?: string
          unit_price_cents: number
        }
        Update: {
          category_id?: string | null
          color?: string | null
          cost_cents?: number | null
          description?: string
          discount_cents?: number
          discount_note?: string | null
          final_cents?: number
          gift_card_id?: string | null
          id?: string
          kind?: string
          line_no?: number
          original_cents?: number
          oversold?: boolean
          price_overridden?: boolean
          product_id?: string | null
          promotion_id?: string | null
          qty?: number
          refunded_cents?: number
          returned_qty?: number
          sale_id?: string
          size?: string | null
          stock_mode?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cash_session_id: string | null
          created_at: string
          discount_cents: number
          employee_id: string | null
          exchange_return_id: string | null
          giftcard_issue_cents: number
          goods_cents: number
          id: string
          is_test: boolean
          offline: boolean
          receipt_number: string
          register_id: string
          snapshot: Json
          synced_at: string
          total_cents: number
          vat_cents: number
        }
        Insert: {
          cash_session_id?: string | null
          created_at: string
          discount_cents?: number
          employee_id?: string | null
          exchange_return_id?: string | null
          giftcard_issue_cents?: number
          goods_cents: number
          id: string
          is_test?: boolean
          offline?: boolean
          receipt_number: string
          register_id: string
          snapshot: Json
          synced_at?: string
          total_cents: number
          vat_cents?: number
        }
        Update: {
          cash_session_id?: string | null
          created_at?: string
          discount_cents?: number
          employee_id?: string | null
          exchange_return_id?: string | null
          giftcard_issue_cents?: number
          goods_cents?: number
          id?: string
          is_test?: boolean
          offline?: boolean
          receipt_number?: string
          register_id?: string
          snapshot?: Json
          synced_at?: string
          total_cents?: number
          vat_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          address: string
          auto_print: boolean
          drawer_auto_open: boolean
          exchange_days: number
          giftcard_validity_months: number | null
          giftcard_vat_mode: string
          id: number
          logo_data_url: string | null
          paper_width: number
          pin_auto_enabled: boolean
          pin_provider: string | null
          pin_terminal_id: string | null
          postal_city: string
          print_copies: number
          printer_address: string | null
          printer_connection: string
          printer_type: string
          require_pin: boolean
          return_text: string
          shop_name: string
          test_mode: boolean
          thank_you_text: string
          updated_at: string
        }
        Insert: {
          address?: string
          auto_print?: boolean
          drawer_auto_open?: boolean
          exchange_days?: number
          giftcard_validity_months?: number | null
          giftcard_vat_mode?: string
          id?: number
          logo_data_url?: string | null
          paper_width?: number
          pin_auto_enabled?: boolean
          pin_provider?: string | null
          pin_terminal_id?: string | null
          postal_city?: string
          print_copies?: number
          printer_address?: string | null
          printer_connection?: string
          printer_type?: string
          require_pin?: boolean
          return_text?: string
          shop_name?: string
          test_mode?: boolean
          thank_you_text?: string
          updated_at?: string
        }
        Update: {
          address?: string
          auto_print?: boolean
          drawer_auto_open?: boolean
          exchange_days?: number
          giftcard_validity_months?: number | null
          giftcard_vat_mode?: string
          id?: number
          logo_data_url?: string | null
          paper_width?: number
          pin_auto_enabled?: boolean
          pin_provider?: string | null
          pin_terminal_id?: string | null
          postal_city?: string
          print_copies?: number
          printer_address?: string | null
          printer_connection?: string
          printer_type?: string
          require_pin?: boolean
          return_text?: string
          shop_name?: string
          test_mode?: boolean
          thank_you_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          category_id: string | null
          created_at: string
          employee_id: string | null
          id: string
          note: string | null
          product_id: string | null
          qty_change: number
          reason: string
          return_id: string | null
          sale_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          qty_change: number
          reason: string
          return_id?: string | null
          sale_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          qty_change?: number
          reason?: string
          return_id?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      add_cash_movement: {
        Args: {
          _amount_cents: number
          _employee_id: string
          _kind: string
          _reason: string
          _session_id: string
        }
        Returns: undefined
      }
      adjust_stock: {
        Args: {
          _category_id: string
          _employee_id: string
          _note: string
          _product_id: string
          _qty: number
          _reason: string
        }
        Returns: undefined
      }
      cash_session_expected: { Args: { _session_id: string }; Returns: Json }
      close_cash_session: {
        Args: {
          _counted_cents: number
          _denominations: Json
          _employee_id: string
          _note: string
          _provisional: boolean
          _session_id: string
        }
        Returns: Json
      }
      complete_sale: { Args: { p: Json }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_shop: { Args: never; Returns: boolean }
      open_cash_session: {
        Args: {
          _employee_id: string
          _register_id: string
          _start_cents: number
        }
        Returns: string
      }
      process_return: { Args: { p: Json }; Returns: Json }
      require_owner: { Args: never; Returns: undefined }
      require_shop: { Args: never; Returns: undefined }
      set_employee_pin: {
        Args: { _employee_id: string; _pin: string }
        Returns: undefined
      }
      verify_employee_pin: {
        Args: { _employee_id: string; _pin: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "owner" | "shop"
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
      app_role: ["owner", "shop"],
    },
  },
} as const
