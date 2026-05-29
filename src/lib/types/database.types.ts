export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		Tables: {
			profiles: {
				Row: {
					id: string;
					email: string | null;
					display_name: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					email?: string | null;
					display_name?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					email?: string | null;
					display_name?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			asset_categories: {
				Row: {
					id: string;
					user_id: string;
					category: 'real_estate' | 'investment' | 'cash' | 'liability';
					name: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					category: 'real_estate' | 'investment' | 'cash' | 'liability';
					name: string;
					created_at?: string;
				};
				Update: {
					category?: 'real_estate' | 'investment' | 'cash' | 'liability';
					name?: string;
				};
				Relationships: [];
			};
			assets: {
				Row: {
					id: string;
					user_id: string;
					category: 'real_estate' | 'investment' | 'cash' | 'liability';
					subcategory: string;
					name: string;
					institution: string | null;
					principal_amount: number;
					current_value: number;
					currency: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
					valuation_date: string;
					annual_rate: number | null;
					memo: string | null;
					tags: string[];
					maturity_date: string | null;
					monthly_contribution: number | null;
					contribution_end_date: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					category: 'real_estate' | 'investment' | 'cash' | 'liability';
					subcategory: string;
					name: string;
					institution?: string | null;
					principal_amount: number;
					current_value: number;
					currency?: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
					valuation_date: string;
					annual_rate?: number | null;
					memo?: string | null;
					tags?: string[];
					maturity_date?: string | null;
					monthly_contribution?: number | null;
					contribution_end_date?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					category?: 'real_estate' | 'investment' | 'cash' | 'liability';
					subcategory?: string;
					name?: string;
					institution?: string | null;
					principal_amount?: number;
					current_value?: number;
					currency?: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
					valuation_date?: string;
					annual_rate?: number | null;
					memo?: string | null;
					tags?: string[];
					maturity_date?: string | null;
					monthly_contribution?: number | null;
					contribution_end_date?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			asset_valuations: {
				Row: {
					id: string;
					asset_id: string;
					user_id: string;
					value: number;
					currency: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
					valued_at: string;
					source: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					asset_id: string;
					user_id: string;
					value: number;
					currency?: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
					valued_at: string;
					source?: string | null;
					created_at?: string;
				};
				Update: {
					value?: number;
					currency?: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
					valued_at?: string;
					source?: string | null;
				};
				Relationships: [];
			};
			liabilities: {
				Row: {
					id: string;
					user_id: string;
					asset_id: string | null;
					name: string;
					liability_type: string;
					principal_amount: number;
					remaining_amount: number;
					interest_rate: number | null;
					started_at: string | null;
					due_at: string | null;
					memo: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					asset_id?: string | null;
					name: string;
					liability_type: string;
					principal_amount: number;
					remaining_amount: number;
					interest_rate?: number | null;
					started_at?: string | null;
					due_at?: string | null;
					memo?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					asset_id?: string | null;
					name?: string;
					liability_type?: string;
					principal_amount?: number;
					remaining_amount?: number;
					interest_rate?: number | null;
					started_at?: string | null;
					due_at?: string | null;
					memo?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			liability_payments: {
				Row: {
					id: string;
					liability_id: string;
					user_id: string;
					paid_at: string;
					principal_paid: number;
					interest_paid: number;
					memo: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					liability_id: string;
					user_id: string;
					paid_at?: string;
					principal_paid?: number;
					interest_paid?: number;
					memo?: string | null;
					created_at?: string;
				};
				Update: {
					paid_at?: string;
					principal_paid?: number;
					interest_paid?: number;
					memo?: string | null;
				};
				Relationships: [];
			};
			cashflow_items: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					direction: 'income' | 'expense';
					cadence: 'monthly' | 'yearly';
					amount: number;
					category: string | null;
					start_date: string | null;
					end_date: string | null;
					memo: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					direction: 'income' | 'expense';
					cadence?: 'monthly' | 'yearly';
					amount: number;
					category?: string | null;
					start_date?: string | null;
					end_date?: string | null;
					memo?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					name?: string;
					direction?: 'income' | 'expense';
					cadence?: 'monthly' | 'yearly';
					amount?: number;
					category?: string | null;
					start_date?: string | null;
					end_date?: string | null;
					memo?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			snapshots: {
				Row: {
					id: string;
					user_id: string;
					snapshot_date: string;
					total_assets: number;
					total_liabilities: number;
					net_worth: number;
					payload: Json;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					snapshot_date: string;
					total_assets: number;
					total_liabilities: number;
					net_worth: number;
					payload: Json;
					created_at?: string;
				};
				Update: {
					snapshot_date?: string;
					total_assets?: number;
					total_liabilities?: number;
					net_worth?: number;
					payload?: Json;
				};
				Relationships: [];
			};
			goals: {
				Row: {
					id: string;
					user_id: string;
					target_net_worth: number;
					target_date: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					target_net_worth: number;
					target_date?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					target_net_worth?: number;
					target_date?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: {
			asset_category: 'real_estate' | 'investment' | 'cash' | 'liability';
			asset_currency: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
			cashflow_direction: 'income' | 'expense';
			cashflow_cadence: 'monthly' | 'yearly';
		};
		CompositeTypes: Record<string, never>;
	};
};
