export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		Tables: {
			app_settings: {
				Row: {
					key: string;
					owner_id: string;
					updated_at: string;
					value: NonNullable<Json>;
				};
				ComputedFields: never;
				Insert: {
					key: string;
					owner_id: string;
					updated_at?: string;
					value: NonNullable<Json>;
				};
				Update: {
					key?: string;
					owner_id?: string;
					updated_at?: string;
					value?: NonNullable<Json>;
				};
				Relationships: [];
			};
			asset_categories: {
				Row: {
					category: Database['public']['Enums']['asset_category'];
					created_at: string;
					id: string;
					name: string;
					user_id: string;
				};
				ComputedFields: never;
				Insert: {
					category: Database['public']['Enums']['asset_category'];
					created_at?: string;
					id?: string;
					name: string;
					user_id: string;
				};
				Update: {
					category?: Database['public']['Enums']['asset_category'];
					created_at?: string;
					id?: string;
					name?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			asset_valuations: {
				Row: {
					asset_id: string;
					created_at: string;
					currency: Database['public']['Enums']['asset_currency'];
					id: string;
					source: string | null;
					user_id: string;
					value: number;
					valued_at: string;
				};
				ComputedFields: never;
				Insert: {
					asset_id: string;
					created_at?: string;
					currency?: Database['public']['Enums']['asset_currency'];
					id?: string;
					source?: string | null;
					user_id: string;
					value: number;
					valued_at?: string;
				};
				Update: {
					asset_id?: string;
					created_at?: string;
					currency?: Database['public']['Enums']['asset_currency'];
					id?: string;
					source?: string | null;
					user_id?: string;
					value?: number;
					valued_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'asset_valuations_asset_id_fkey';
						columns: ['asset_id'];
						isOneToOne: false;
						referencedRelation: 'assets';
						referencedColumns: ['id'];
					}
				];
			};
			assets: {
				Row: {
					annual_rate: number | null;
					category: Database['public']['Enums']['asset_category'];
					contribution_end_date: string | null;
					created_at: string;
					currency: Database['public']['Enums']['asset_currency'];
					current_value: number;
					id: string;
					institution: string | null;
					maturity_date: string | null;
					memo: string | null;
					monthly_contribution: number | null;
					name: string;
					principal_amount: number;
					subcategory: string;
					tags: string[];
					updated_at: string;
					user_id: string;
					valuation_date: string;
				};
				ComputedFields: never;
				Insert: {
					annual_rate?: number | null;
					category: Database['public']['Enums']['asset_category'];
					contribution_end_date?: string | null;
					created_at?: string;
					currency?: Database['public']['Enums']['asset_currency'];
					current_value?: number;
					id?: string;
					institution?: string | null;
					maturity_date?: string | null;
					memo?: string | null;
					monthly_contribution?: number | null;
					name: string;
					principal_amount?: number;
					subcategory: string;
					tags?: string[];
					updated_at?: string;
					user_id: string;
					valuation_date?: string;
				};
				Update: {
					annual_rate?: number | null;
					category?: Database['public']['Enums']['asset_category'];
					contribution_end_date?: string | null;
					created_at?: string;
					currency?: Database['public']['Enums']['asset_currency'];
					current_value?: number;
					id?: string;
					institution?: string | null;
					maturity_date?: string | null;
					memo?: string | null;
					monthly_contribution?: number | null;
					name?: string;
					principal_amount?: number;
					subcategory?: string;
					tags?: string[];
					updated_at?: string;
					user_id?: string;
					valuation_date?: string;
				};
				Relationships: [];
			};
			attachments: {
				Row: {
					bytes: number | null;
					caption: string | null;
					created_at: string;
					id: string;
					mime: string;
					owner_id: string;
					report_id: string | null;
					storage_path: string;
				};
				ComputedFields: never;
				Insert: {
					bytes?: number | null;
					caption?: string | null;
					created_at?: string;
					id?: string;
					mime: string;
					owner_id: string;
					report_id?: string | null;
					storage_path: string;
				};
				Update: {
					bytes?: number | null;
					caption?: string | null;
					created_at?: string;
					id?: string;
					mime?: string;
					owner_id?: string;
					report_id?: string | null;
					storage_path?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'attachments_report_id_fkey';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					}
				];
			};
			bot_clients: {
				Row: {
					created_at: string;
					description: string | null;
					expires_at: string | null;
					id: string;
					key_hash: string;
					key_prefix: string;
					last_used_at: string | null;
					last_used_ip: unknown;
					name: string;
					owner_id: string;
					profile: string;
					rate_limit_per_min: number;
					revoked_at: string | null;
					revoked_reason: string | null;
					scopes: string[];
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string;
					description?: string | null;
					expires_at?: string | null;
					id?: string;
					key_hash: string;
					key_prefix: string;
					last_used_at?: string | null;
					last_used_ip?: unknown;
					name: string;
					owner_id: string;
					profile: string;
					rate_limit_per_min?: number;
					revoked_at?: string | null;
					revoked_reason?: string | null;
					scopes?: string[];
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					expires_at?: string | null;
					id?: string;
					key_hash?: string;
					key_prefix?: string;
					last_used_at?: string | null;
					last_used_ip?: unknown;
					name?: string;
					owner_id?: string;
					profile?: string;
					rate_limit_per_min?: number;
					revoked_at?: string | null;
					revoked_reason?: string | null;
					scopes?: string[];
					updated_at?: string;
				};
				Relationships: [];
			};
			cashflow_items: {
				Row: {
					amount: number;
					cadence: Database['public']['Enums']['cashflow_cadence'];
					category: string | null;
					created_at: string;
					direction: Database['public']['Enums']['cashflow_direction'];
					end_date: string | null;
					id: string;
					memo: string | null;
					name: string;
					start_date: string | null;
					updated_at: string;
					user_id: string;
				};
				ComputedFields: never;
				Insert: {
					amount?: number;
					cadence?: Database['public']['Enums']['cashflow_cadence'];
					category?: string | null;
					created_at?: string;
					direction: Database['public']['Enums']['cashflow_direction'];
					end_date?: string | null;
					id?: string;
					memo?: string | null;
					name: string;
					start_date?: string | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					amount?: number;
					cadence?: Database['public']['Enums']['cashflow_cadence'];
					category?: string | null;
					created_at?: string;
					direction?: Database['public']['Enums']['cashflow_direction'];
					end_date?: string | null;
					id?: string;
					memo?: string | null;
					name?: string;
					start_date?: string | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			decisions: {
				Row: {
					archived_at: string | null;
					client_ref: string | null;
					context_md: string | null;
					created_at: string;
					decided_at: string | null;
					decision_md: string | null;
					due_date: string | null;
					id: string;
					instrument_id: string | null;
					options: NonNullable<Json>;
					owner_id: string;
					report_id: string | null;
					source_bot_id: string | null;
					status: string;
					title: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					archived_at?: string | null;
					client_ref?: string | null;
					context_md?: string | null;
					created_at?: string;
					decided_at?: string | null;
					decision_md?: string | null;
					due_date?: string | null;
					id?: string;
					instrument_id?: string | null;
					options?: NonNullable<Json>;
					owner_id: string;
					report_id?: string | null;
					source_bot_id?: string | null;
					status?: string;
					title: string;
					updated_at?: string;
				};
				Update: {
					archived_at?: string | null;
					client_ref?: string | null;
					context_md?: string | null;
					created_at?: string;
					decided_at?: string | null;
					decision_md?: string | null;
					due_date?: string | null;
					id?: string;
					instrument_id?: string | null;
					options?: NonNullable<Json>;
					owner_id?: string;
					report_id?: string | null;
					source_bot_id?: string | null;
					status?: string;
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'decisions_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'decisions_report_id_fkey';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'decisions_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			display_sequences: {
				Row: {
					next_no: number;
					owner_id: string;
					scope: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					next_no?: number;
					owner_id: string;
					scope: string;
					updated_at?: string;
				};
				Update: {
					next_no?: number;
					owner_id?: string;
					scope?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			events: {
				Row: {
					amount: number | null;
					archived_at: string | null;
					client_ref: string | null;
					created_at: string;
					currency: string | null;
					domain: string;
					event_date: string;
					event_time: string | null;
					id: string;
					instrument_id: string | null;
					is_estimated: boolean;
					kind: string;
					link: string | null;
					meta: NonNullable<Json>;
					owner_id: string;
					source_bot_id: string | null;
					status: string;
					title: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					amount?: number | null;
					archived_at?: string | null;
					client_ref?: string | null;
					created_at?: string;
					currency?: string | null;
					domain: string;
					event_date: string;
					event_time?: string | null;
					id?: string;
					instrument_id?: string | null;
					is_estimated?: boolean;
					kind: string;
					link?: string | null;
					meta?: NonNullable<Json>;
					owner_id: string;
					source_bot_id?: string | null;
					status?: string;
					title: string;
					updated_at?: string;
				};
				Update: {
					amount?: number | null;
					archived_at?: string | null;
					client_ref?: string | null;
					created_at?: string;
					currency?: string | null;
					domain?: string;
					event_date?: string;
					event_time?: string | null;
					id?: string;
					instrument_id?: string | null;
					is_estimated?: boolean;
					kind?: string;
					link?: string | null;
					meta?: NonNullable<Json>;
					owner_id?: string;
					source_bot_id?: string | null;
					status?: string;
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'events_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'events_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			goals: {
				Row: {
					created_at: string;
					id: string;
					target_date: string | null;
					target_net_worth: number;
					updated_at: string;
					user_id: string;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string;
					id?: string;
					target_date?: string | null;
					target_net_worth: number;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					target_date?: string | null;
					target_net_worth?: number;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			instruments: {
				Row: {
					aliases: string[];
					archived_at: string | null;
					asset_type: string;
					created_at: string;
					id: string;
					is_watchlist: boolean;
					market: string;
					meta: NonNullable<Json>;
					name: string;
					owner_id: string;
					sector: string | null;
					source_bot_id: string | null;
					source_ref: NonNullable<Json>;
					ticker: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					aliases?: string[];
					archived_at?: string | null;
					asset_type: string;
					created_at?: string;
					id?: string;
					is_watchlist?: boolean;
					market: string;
					meta?: NonNullable<Json>;
					name: string;
					owner_id: string;
					sector?: string | null;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					ticker: string;
					updated_at?: string;
				};
				Update: {
					aliases?: string[];
					archived_at?: string | null;
					asset_type?: string;
					created_at?: string;
					id?: string;
					is_watchlist?: boolean;
					market?: string;
					meta?: NonNullable<Json>;
					name?: string;
					owner_id?: string;
					sector?: string | null;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					ticker?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'instruments_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			journal_entries: {
				Row: {
					archived_at: string | null;
					avg_price: number | null;
					breakeven: number | null;
					client_ref: string | null;
					created_at: string;
					currency: string | null;
					entry_date: string;
					id: string;
					instrument_id: string | null;
					kind: string;
					memo_md: string | null;
					owner_id: string;
					price: number | null;
					qty: number | null;
					report_id: string | null;
					search_tsv: unknown;
					source_bot_id: string | null;
					source_ref: NonNullable<Json>;
					source_url: string | null;
					state: string;
					tickers: string[];
					title: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					archived_at?: string | null;
					avg_price?: number | null;
					breakeven?: number | null;
					client_ref?: string | null;
					created_at?: string;
					currency?: string | null;
					entry_date: string;
					id?: string;
					instrument_id?: string | null;
					kind: string;
					memo_md?: string | null;
					owner_id: string;
					price?: number | null;
					qty?: number | null;
					report_id?: string | null;
					search_tsv?: never;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					source_url?: string | null;
					state?: string;
					tickers?: string[];
					title: string;
					updated_at?: string;
				};
				Update: {
					archived_at?: string | null;
					avg_price?: number | null;
					breakeven?: number | null;
					client_ref?: string | null;
					created_at?: string;
					currency?: string | null;
					entry_date?: string;
					id?: string;
					instrument_id?: string | null;
					kind?: string;
					memo_md?: string | null;
					owner_id?: string;
					price?: number | null;
					qty?: number | null;
					report_id?: string | null;
					search_tsv?: never;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					source_url?: string | null;
					state?: string;
					tickers?: string[];
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'journal_entries_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'journal_entries_report_fk';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'journal_entries_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			liabilities: {
				Row: {
					asset_id: string | null;
					created_at: string;
					due_at: string | null;
					id: string;
					interest_rate: number | null;
					liability_type: string;
					memo: string | null;
					name: string;
					principal_amount: number;
					remaining_amount: number;
					started_at: string | null;
					updated_at: string;
					user_id: string;
				};
				ComputedFields: never;
				Insert: {
					asset_id?: string | null;
					created_at?: string;
					due_at?: string | null;
					id?: string;
					interest_rate?: number | null;
					liability_type: string;
					memo?: string | null;
					name: string;
					principal_amount?: number;
					remaining_amount?: number;
					started_at?: string | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					asset_id?: string | null;
					created_at?: string;
					due_at?: string | null;
					id?: string;
					interest_rate?: number | null;
					liability_type?: string;
					memo?: string | null;
					name?: string;
					principal_amount?: number;
					remaining_amount?: number;
					started_at?: string | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'liabilities_asset_id_fkey';
						columns: ['asset_id'];
						isOneToOne: false;
						referencedRelation: 'assets';
						referencedColumns: ['id'];
					}
				];
			};
			liability_payments: {
				Row: {
					created_at: string;
					id: string;
					interest_paid: number;
					liability_id: string;
					memo: string | null;
					paid_at: string;
					principal_paid: number;
					user_id: string;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string;
					id?: string;
					interest_paid?: number;
					liability_id: string;
					memo?: string | null;
					paid_at?: string;
					principal_paid?: number;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					interest_paid?: number;
					liability_id?: string;
					memo?: string | null;
					paid_at?: string;
					principal_paid?: number;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'liability_payments_liability_id_fkey';
						columns: ['liability_id'];
						isOneToOne: false;
						referencedRelation: 'liabilities';
						referencedColumns: ['id'];
					}
				];
			};
			market_indicator_keys: {
				Row: {
					key: string;
					label: string;
					unit: string | null;
				};
				ComputedFields: never;
				Insert: {
					key: string;
					label: string;
					unit?: string | null;
				};
				Update: {
					key?: string;
					label?: string;
					unit?: string | null;
				};
				Relationships: [];
			};
			market_indicators: {
				Row: {
					as_of: string;
					change: number | null;
					change_pct: number | null;
					created_at: string;
					id: number;
					key: string;
					owner_id: string;
					source: string | null;
					source_bot_id: string | null;
					value: number;
				};
				ComputedFields: never;
				Insert: {
					as_of: string;
					change?: number | null;
					change_pct?: number | null;
					created_at?: string;
					id?: never;
					key: string;
					owner_id: string;
					source?: string | null;
					source_bot_id?: string | null;
					value: number;
				};
				Update: {
					as_of?: string;
					change?: number | null;
					change_pct?: number | null;
					created_at?: string;
					id?: never;
					key?: string;
					owner_id?: string;
					source?: string | null;
					source_bot_id?: string | null;
					value?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'market_indicators_key_fkey';
						columns: ['key'];
						isOneToOne: false;
						referencedRelation: 'market_indicator_keys';
						referencedColumns: ['key'];
					},
					{
						foreignKeyName: 'market_indicators_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			mcp_audit_log: {
				Row: {
					actor_type: string;
					affected_ids: NonNullable<Json>;
					args_digest: string | null;
					args_preview: Json | null;
					bot_client_id: string | null;
					created_at: string;
					duration_ms: number | null;
					error_code: string | null;
					id: number;
					ip: unknown;
					owner_id: string;
					request_id: string | null;
					result: string;
					rule_ids: string[];
					tool: string;
					user_agent: string | null;
					user_id: string | null;
					warnings: NonNullable<Json>;
				};
				ComputedFields: never;
				Insert: {
					actor_type: string;
					affected_ids?: NonNullable<Json>;
					args_digest?: string | null;
					args_preview?: Json | null;
					bot_client_id?: string | null;
					created_at?: string;
					duration_ms?: number | null;
					error_code?: string | null;
					id?: never;
					ip?: unknown;
					owner_id: string;
					request_id?: string | null;
					result: string;
					rule_ids?: string[];
					tool: string;
					user_agent?: string | null;
					user_id?: string | null;
					warnings?: NonNullable<Json>;
				};
				Update: {
					actor_type?: string;
					affected_ids?: NonNullable<Json>;
					args_digest?: string | null;
					args_preview?: Json | null;
					bot_client_id?: string | null;
					created_at?: string;
					duration_ms?: number | null;
					error_code?: string | null;
					id?: never;
					ip?: unknown;
					owner_id?: string;
					request_id?: string | null;
					result?: string;
					rule_ids?: string[];
					tool?: string;
					user_agent?: string | null;
					user_id?: string | null;
					warnings?: NonNullable<Json>;
				};
				Relationships: [
					{
						foreignKeyName: 'mcp_audit_log_bot_client_id_fkey';
						columns: ['bot_client_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			mcp_rate_buckets: {
				Row: {
					bot_client_id: string;
					count: number;
					window_start: string;
				};
				ComputedFields: never;
				Insert: {
					bot_client_id: string;
					count?: number;
					window_start: string;
				};
				Update: {
					bot_client_id?: string;
					count?: number;
					window_start?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'mcp_rate_buckets_bot_client_id_fkey';
						columns: ['bot_client_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			mowa_backup_log: {
				Row: {
					created_at: string;
					file_name: string;
					id: number;
					kind: string;
					note: string | null;
					row_counts: NonNullable<Json>;
					sha256: string;
					verified: boolean;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string;
					file_name: string;
					id?: never;
					kind: string;
					note?: string | null;
					row_counts: NonNullable<Json>;
					sha256: string;
					verified?: boolean;
				};
				Update: {
					created_at?: string;
					file_name?: string;
					id?: never;
					kind?: string;
					note?: string | null;
					row_counts?: NonNullable<Json>;
					sha256?: string;
					verified?: boolean;
				};
				Relationships: [];
			};
			portfolio_snapshots: {
				Row: {
					as_of: string;
					created_at: string;
					currency: string;
					extra: NonNullable<Json>;
					id: number;
					owner_id: string;
					plan_distances: NonNullable<Json>;
					source_bot_id: string | null;
					total_value: number | null;
					weights: NonNullable<Json>;
				};
				ComputedFields: never;
				Insert: {
					as_of: string;
					created_at?: string;
					currency?: string;
					extra?: NonNullable<Json>;
					id?: never;
					owner_id: string;
					plan_distances?: NonNullable<Json>;
					source_bot_id?: string | null;
					total_value?: number | null;
					weights?: NonNullable<Json>;
				};
				Update: {
					as_of?: string;
					created_at?: string;
					currency?: string;
					extra?: NonNullable<Json>;
					id?: never;
					owner_id?: string;
					plan_distances?: NonNullable<Json>;
					source_bot_id?: string | null;
					total_value?: number | null;
					weights?: NonNullable<Json>;
				};
				Relationships: [
					{
						foreignKeyName: 'portfolio_snapshots_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			position_proposals: {
				Row: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					acknowledged_at?: string | null;
					acknowledged_by?: string | null;
					applied_values?: Json | null;
					attention_started_at?: string | null;
					base_version?: number | null;
					calc_note?: string | null;
					change_type: string;
					client_ref?: string | null;
					created_at?: string;
					current_values?: Json | null;
					decided_at?: string | null;
					decided_by?: string | null;
					decision_note?: string | null;
					display_id?: never;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at?: string | null;
					id?: string;
					instrument_id?: string | null;
					owner_id: string;
					position_id?: string | null;
					proposed_by?: string | null;
					proposed_by_type?: string;
					proposed_by_user?: string | null;
					proposed_values: NonNullable<Json>;
					reason_md?: string | null;
					result_position_id?: string | null;
					status?: string;
					updated_at?: string;
				};
				Update: {
					acknowledged_at?: string | null;
					acknowledged_by?: string | null;
					applied_values?: Json | null;
					attention_started_at?: string | null;
					base_version?: number | null;
					calc_note?: string | null;
					change_type?: string;
					client_ref?: string | null;
					created_at?: string;
					current_values?: Json | null;
					decided_at?: string | null;
					decided_by?: string | null;
					decision_note?: string | null;
					display_id?: never;
					display_no?: number;
					evidence?: NonNullable<Json>;
					expires_at?: string;
					held_at?: string | null;
					id?: string;
					instrument_id?: string | null;
					owner_id?: string;
					position_id?: string | null;
					proposed_by?: string | null;
					proposed_by_type?: string;
					proposed_by_user?: string | null;
					proposed_values?: NonNullable<Json>;
					reason_md?: string | null;
					result_position_id?: string | null;
					status?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'position_proposals_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'position_proposals_position_id_fkey';
						columns: ['position_id'];
						isOneToOne: false;
						referencedRelation: 'positions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'position_proposals_proposed_by_fkey';
						columns: ['proposed_by'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			positions: {
				Row: {
					approval_version: number;
					archived_at: string | null;
					avg_price: number | null;
					base_at: string | null;
					base_price: number | null;
					breakeven: number | null;
					closed_at: string | null;
					created_at: string;
					currency: string;
					id: string;
					instrument_id: string;
					memo: string | null;
					owner_id: string;
					qty: number;
					source_bot_id: string | null;
					source_ref: NonNullable<Json>;
					status: string;
					trigger_direction: string;
					trigger_price: number | null;
					updated_at: string;
					version: number;
					watch_only: boolean;
				};
				ComputedFields: never;
				Insert: {
					approval_version?: number;
					archived_at?: string | null;
					avg_price?: number | null;
					base_at?: string | null;
					base_price?: number | null;
					breakeven?: number | null;
					closed_at?: string | null;
					created_at?: string;
					currency: string;
					id?: string;
					instrument_id: string;
					memo?: string | null;
					owner_id: string;
					qty?: number;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					status: string;
					trigger_direction?: string;
					trigger_price?: number | null;
					updated_at?: string;
					version?: number;
					watch_only?: boolean;
				};
				Update: {
					approval_version?: number;
					archived_at?: string | null;
					avg_price?: number | null;
					base_at?: string | null;
					base_price?: number | null;
					breakeven?: number | null;
					closed_at?: string | null;
					created_at?: string;
					currency?: string;
					id?: string;
					instrument_id?: string;
					memo?: string | null;
					owner_id?: string;
					qty?: number;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					status?: string;
					trigger_direction?: string;
					trigger_price?: number | null;
					updated_at?: string;
					version?: number;
					watch_only?: boolean;
				};
				Relationships: [
					{
						foreignKeyName: 'positions_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'positions_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			price_snapshots: {
				Row: {
					as_of: string;
					change_pct: number | null;
					close: number;
					created_at: string;
					currency: string;
					extra: NonNullable<Json>;
					foreign_net_buy: number | null;
					id: number;
					inst_net_buy: number | null;
					instrument_id: string;
					owner_id: string;
					source: string | null;
					source_bot_id: string | null;
					volume: number | null;
				};
				ComputedFields: never;
				Insert: {
					as_of: string;
					change_pct?: number | null;
					close: number;
					created_at?: string;
					currency: string;
					extra?: NonNullable<Json>;
					foreign_net_buy?: number | null;
					id?: never;
					inst_net_buy?: number | null;
					instrument_id: string;
					owner_id: string;
					source?: string | null;
					source_bot_id?: string | null;
					volume?: number | null;
				};
				Update: {
					as_of?: string;
					change_pct?: number | null;
					close?: number;
					created_at?: string;
					currency?: string;
					extra?: NonNullable<Json>;
					foreign_net_buy?: number | null;
					id?: never;
					inst_net_buy?: number | null;
					instrument_id?: string;
					owner_id?: string;
					source?: string | null;
					source_bot_id?: string | null;
					volume?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'price_snapshots_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'price_snapshots_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			principle_proposals: {
				Row: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_report_id: string | null;
					attention_started_at: string | null;
					base_body_hash: string;
					base_version: number;
					clause_ref: string | null;
					client_ref: string | null;
					created_at: string;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					owner_id: string;
					principle_id: string;
					proposed_body_md: string;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					reason_md: string;
					status: string;
					superseded_by: string | null;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					acknowledged_at?: string | null;
					acknowledged_by?: string | null;
					applied_report_id?: string | null;
					attention_started_at?: string | null;
					base_body_hash: string;
					base_version: number;
					clause_ref?: string | null;
					client_ref?: string | null;
					created_at?: string;
					decided_at?: string | null;
					decided_by?: string | null;
					decision_note?: string | null;
					display_id?: never;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at?: string | null;
					id?: string;
					owner_id: string;
					principle_id: string;
					proposed_body_md: string;
					proposed_by?: string | null;
					proposed_by_type: string;
					proposed_by_user?: string | null;
					reason_md: string;
					status?: string;
					superseded_by?: string | null;
					updated_at?: string;
				};
				Update: {
					acknowledged_at?: string | null;
					acknowledged_by?: string | null;
					applied_report_id?: string | null;
					attention_started_at?: string | null;
					base_body_hash?: string;
					base_version?: number;
					clause_ref?: string | null;
					client_ref?: string | null;
					created_at?: string;
					decided_at?: string | null;
					decided_by?: string | null;
					decision_note?: string | null;
					display_id?: never;
					display_no?: number;
					evidence?: NonNullable<Json>;
					expires_at?: string;
					held_at?: string | null;
					id?: string;
					owner_id?: string;
					principle_id?: string;
					proposed_body_md?: string;
					proposed_by?: string | null;
					proposed_by_type?: string;
					proposed_by_user?: string | null;
					reason_md?: string;
					status?: string;
					superseded_by?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'principle_proposals_applied_report_id_fkey';
						columns: ['applied_report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'principle_proposals_principle_id_fkey';
						columns: ['principle_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'principle_proposals_proposed_by_fkey';
						columns: ['proposed_by'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'principle_proposals_superseded_by_fkey';
						columns: ['superseded_by'];
						isOneToOne: false;
						referencedRelation: 'principle_proposals';
						referencedColumns: ['id'];
					}
				];
			};
			profiles: {
				Row: {
					created_at: string;
					display_name: string | null;
					email: string | null;
					id: string;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string;
					display_name?: string | null;
					email?: string | null;
					id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					display_name?: string | null;
					email?: string | null;
					id?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			re_complex_snapshots: {
				Row: {
					as_of: string;
					ask_max: number | null;
					ask_min: number | null;
					complex_id: string;
					created_at: string;
					id: number;
					med_price: number | null;
					owner_id: string;
					score: number | null;
					source_bot_id: string | null;
					trades: NonNullable<Json>;
				};
				ComputedFields: never;
				Insert: {
					as_of: string;
					ask_max?: number | null;
					ask_min?: number | null;
					complex_id: string;
					created_at?: string;
					id?: never;
					med_price?: number | null;
					owner_id: string;
					score?: number | null;
					source_bot_id?: string | null;
					trades?: NonNullable<Json>;
				};
				Update: {
					as_of?: string;
					ask_max?: number | null;
					ask_min?: number | null;
					complex_id?: string;
					created_at?: string;
					id?: never;
					med_price?: number | null;
					owner_id?: string;
					score?: number | null;
					source_bot_id?: string | null;
					trades?: NonNullable<Json>;
				};
				Relationships: [
					{
						foreignKeyName: 're_complex_snapshots_complex_id_fkey';
						columns: ['complex_id'];
						isOneToOne: false;
						referencedRelation: 're_complexes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 're_complex_snapshots_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			re_complexes: {
				Row: {
					address: string | null;
					archived_at: string | null;
					builder: string | null;
					built_year: number | null;
					created_at: string;
					dong: string | null;
					external_id: string;
					external_source: string;
					households: number | null;
					id: string;
					is_target: boolean;
					lat: number | null;
					lng: number | null;
					main_type: string | null;
					meta: NonNullable<Json>;
					name: string;
					owner_id: string;
					rating: number | null;
					scores: NonNullable<Json>;
					scoring_version: string | null;
					sido: string;
					sigungu: string | null;
					source_bot_id: string | null;
					total_score: number | null;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					address?: string | null;
					archived_at?: string | null;
					builder?: string | null;
					built_year?: number | null;
					created_at?: string;
					dong?: string | null;
					external_id: string;
					external_source: string;
					households?: number | null;
					id?: string;
					is_target?: boolean;
					lat?: number | null;
					lng?: number | null;
					main_type?: string | null;
					meta?: NonNullable<Json>;
					name: string;
					owner_id: string;
					rating?: number | null;
					scores?: NonNullable<Json>;
					scoring_version?: string | null;
					sido: string;
					sigungu?: string | null;
					source_bot_id?: string | null;
					total_score?: number | null;
					updated_at?: string;
				};
				Update: {
					address?: string | null;
					archived_at?: string | null;
					builder?: string | null;
					built_year?: number | null;
					created_at?: string;
					dong?: string | null;
					external_id?: string;
					external_source?: string;
					households?: number | null;
					id?: string;
					is_target?: boolean;
					lat?: number | null;
					lng?: number | null;
					main_type?: string | null;
					meta?: NonNullable<Json>;
					name?: string;
					owner_id?: string;
					rating?: number | null;
					scores?: NonNullable<Json>;
					scoring_version?: string | null;
					sido?: string;
					sigungu?: string | null;
					source_bot_id?: string | null;
					total_score?: number | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 're_complexes_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			re_market_stats: {
				Row: {
					as_of: string;
					cadence: string;
					created_at: string;
					id: number;
					is_primary: boolean;
					link: string | null;
					metric: string;
					owner_id: string;
					published_at: string;
					region: string;
					source: string;
					source_bot_id: string | null;
					value: number;
				};
				ComputedFields: never;
				Insert: {
					as_of: string;
					cadence: string;
					created_at?: string;
					id?: never;
					is_primary?: boolean;
					link?: string | null;
					metric: string;
					owner_id: string;
					published_at: string;
					region: string;
					source: string;
					source_bot_id?: string | null;
					value: number;
				};
				Update: {
					as_of?: string;
					cadence?: string;
					created_at?: string;
					id?: never;
					is_primary?: boolean;
					link?: string | null;
					metric?: string;
					owner_id?: string;
					published_at?: string;
					region?: string;
					source?: string;
					source_bot_id?: string | null;
					value?: number;
				};
				Relationships: [
					{
						foreignKeyName: 're_market_stats_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			re_subscriptions: {
				Row: {
					announce_date: string | null;
					apply_end: string | null;
					apply_start: string | null;
					archived_at: string | null;
					competition: NonNullable<Json>;
					created_at: string;
					external_id: string;
					households: number | null;
					id: string;
					link: string | null;
					meta: NonNullable<Json>;
					name: string;
					owner_id: string;
					price_range: string | null;
					sido: string | null;
					sigungu: string | null;
					source_bot_id: string | null;
					updated_at: string;
				};
				ComputedFields: never;
				Insert: {
					announce_date?: string | null;
					apply_end?: string | null;
					apply_start?: string | null;
					archived_at?: string | null;
					competition?: NonNullable<Json>;
					created_at?: string;
					external_id: string;
					households?: number | null;
					id?: string;
					link?: string | null;
					meta?: NonNullable<Json>;
					name: string;
					owner_id: string;
					price_range?: string | null;
					sido?: string | null;
					sigungu?: string | null;
					source_bot_id?: string | null;
					updated_at?: string;
				};
				Update: {
					announce_date?: string | null;
					apply_end?: string | null;
					apply_start?: string | null;
					archived_at?: string | null;
					competition?: NonNullable<Json>;
					created_at?: string;
					external_id?: string;
					households?: number | null;
					id?: string;
					link?: string | null;
					meta?: NonNullable<Json>;
					name?: string;
					owner_id?: string;
					price_range?: string | null;
					sido?: string | null;
					sigungu?: string | null;
					source_bot_id?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 're_subscriptions_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			report_instruments: {
				Row: {
					instrument_id: string;
					owner_id: string;
					report_id: string;
				};
				ComputedFields: never;
				Insert: {
					instrument_id: string;
					owner_id: string;
					report_id: string;
				};
				Update: {
					instrument_id?: string;
					owner_id?: string;
					report_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'report_instruments_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'report_instruments_report_id_fkey';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					}
				];
			};
			report_revisions: {
				Row: {
					body_md: string;
					changed_by_bot_id: string | null;
					changed_by_type: string;
					created_at: string;
					headline: string | null;
					id: string;
					owner_id: string;
					report_id: string;
					summary: string | null;
					tags: string[];
					title: string;
					version: number;
				};
				ComputedFields: never;
				Insert: {
					body_md: string;
					changed_by_bot_id?: string | null;
					changed_by_type: string;
					created_at?: string;
					headline?: string | null;
					id?: string;
					owner_id: string;
					report_id: string;
					summary?: string | null;
					tags?: string[];
					title: string;
					version: number;
				};
				Update: {
					body_md?: string;
					changed_by_bot_id?: string | null;
					changed_by_type?: string;
					created_at?: string;
					headline?: string | null;
					id?: string;
					owner_id?: string;
					report_id?: string;
					summary?: string | null;
					tags?: string[];
					title?: string;
					version?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'report_revisions_report_id_fkey';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					}
				];
			};
			report_sources: {
				Row: {
					accessed_at: string;
					id: string;
					is_primary: boolean;
					label: string;
					owner_id: string;
					publisher: string;
					report_id: string;
					sort: number;
					url: string | null;
				};
				ComputedFields: never;
				Insert: {
					accessed_at: string;
					id?: string;
					is_primary?: boolean;
					label: string;
					owner_id: string;
					publisher: string;
					report_id: string;
					sort?: number;
					url?: string | null;
				};
				Update: {
					accessed_at?: string;
					id?: string;
					is_primary?: boolean;
					label?: string;
					owner_id?: string;
					publisher?: string;
					report_id?: string;
					sort?: number;
					url?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'report_sources_report_id_fkey';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					}
				];
			};
			reports: {
				Row: {
					archived_at: string | null;
					body_blocks: Json | null;
					body_md: string;
					created_at: string;
					domain: string;
					generated_at: string | null;
					headline: string | null;
					id: string;
					kind: string;
					meta: NonNullable<Json>;
					owner_id: string;
					period_end: string | null;
					period_start: string | null;
					report_date: string;
					search_tsv: unknown;
					slug: string;
					source_bot_id: string | null;
					source_ref: NonNullable<Json>;
					status: string;
					subtype: string | null;
					summary: string | null;
					tags: string[];
					tickers: string[];
					title: string;
					toc: NonNullable<Json>;
					updated_at: string;
					version: number;
				};
				ComputedFields: never;
				Insert: {
					archived_at?: string | null;
					body_blocks?: Json | null;
					body_md: string;
					created_at?: string;
					domain: string;
					generated_at?: string | null;
					headline?: string | null;
					id?: string;
					kind: string;
					meta?: NonNullable<Json>;
					owner_id: string;
					period_end?: string | null;
					period_start?: string | null;
					report_date: string;
					search_tsv?: never;
					slug: string;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					status?: string;
					subtype?: string | null;
					summary?: string | null;
					tags?: string[];
					tickers?: string[];
					title: string;
					toc?: NonNullable<Json>;
					updated_at?: string;
					version?: number;
				};
				Update: {
					archived_at?: string | null;
					body_blocks?: Json | null;
					body_md?: string;
					created_at?: string;
					domain?: string;
					generated_at?: string | null;
					headline?: string | null;
					id?: string;
					kind?: string;
					meta?: NonNullable<Json>;
					owner_id?: string;
					period_end?: string | null;
					period_start?: string | null;
					report_date?: string;
					search_tsv?: never;
					slug?: string;
					source_bot_id?: string | null;
					source_ref?: NonNullable<Json>;
					status?: string;
					subtype?: string | null;
					summary?: string | null;
					tags?: string[];
					tickers?: string[];
					title?: string;
					toc?: NonNullable<Json>;
					updated_at?: string;
					version?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'reports_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
			snapshots: {
				Row: {
					created_at: string;
					id: string;
					net_worth: number;
					payload: NonNullable<Json>;
					snapshot_date: string;
					total_assets: number;
					total_liabilities: number;
					user_id: string;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string;
					id?: string;
					net_worth?: number;
					payload?: NonNullable<Json>;
					snapshot_date: string;
					total_assets?: number;
					total_liabilities?: number;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					net_worth?: number;
					payload?: NonNullable<Json>;
					snapshot_date?: string;
					total_assets?: number;
					total_liabilities?: number;
					user_id?: string;
				};
				Relationships: [];
			};
			targets_valuation: {
				Row: {
					as_of: string;
					created_at: string;
					currency: string;
					id: string;
					instrument_id: string;
					note: string | null;
					opinion: string;
					owner_id: string;
					report_id: string;
					source: string;
					source_bot_id: string | null;
					source_name: string;
					target_price: number | null;
				};
				ComputedFields: never;
				Insert: {
					as_of: string;
					created_at?: string;
					currency: string;
					id?: string;
					instrument_id: string;
					note?: string | null;
					opinion: string;
					owner_id: string;
					report_id: string;
					source: string;
					source_bot_id?: string | null;
					source_name?: string;
					target_price?: number | null;
				};
				Update: {
					as_of?: string;
					created_at?: string;
					currency?: string;
					id?: string;
					instrument_id?: string;
					note?: string | null;
					opinion?: string;
					owner_id?: string;
					report_id?: string;
					source?: string;
					source_bot_id?: string | null;
					source_name?: string;
					target_price?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'targets_valuation_instrument_id_fkey';
						columns: ['instrument_id'];
						isOneToOne: false;
						referencedRelation: 'instruments';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'targets_valuation_report_id_fkey';
						columns: ['report_id'];
						isOneToOne: false;
						referencedRelation: 'reports';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'targets_valuation_source_bot_fk';
						columns: ['source_bot_id'];
						isOneToOne: false;
						referencedRelation: 'bot_clients';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			acknowledge_proposal: {
				Args: { p_id: string };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'position_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			apply_user_correction: {
				Args: {
					p_avg_price: number;
					p_base_version?: number;
					p_client_ref?: string;
					p_currency: string;
					p_position_id: string;
					p_qty: number;
					p_reason: string;
				};
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'position_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			approve_principle_proposal: {
				Args: { p_final_body_md?: string; p_id: string; p_note?: string; p_summary?: string };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_report_id: string | null;
					attention_started_at: string | null;
					base_body_hash: string;
					base_version: number;
					clause_ref: string | null;
					client_ref: string | null;
					created_at: string;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					owner_id: string;
					principle_id: string;
					proposed_body_md: string;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					reason_md: string;
					status: string;
					superseded_by: string | null;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'principle_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			approve_proposal: {
				Args: { p_id: string; p_note?: string; p_overrides?: Json };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'position_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			cancel_own_proposal: {
				Args: { p_id: string; p_note?: string };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'position_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			decide_principle_proposal: {
				Args: { p_action: string; p_id: string; p_note?: string };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_report_id: string | null;
					attention_started_at: string | null;
					base_body_hash: string;
					base_version: number;
					clause_ref: string | null;
					client_ref: string | null;
					created_at: string;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					owner_id: string;
					principle_id: string;
					proposed_body_md: string;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					reason_md: string;
					status: string;
					superseded_by: string | null;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'principle_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			expire_stale_proposals: { Args: Record<PropertyKey, never>; Returns: number };
			hold_proposal: {
				Args: { p_hold?: boolean; p_id: string; p_note?: string };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'position_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
			mcp_authenticate: {
				Args: { p_hash: string; p_ip?: unknown; p_prefix: string };
				Returns: {
					allowed: boolean;
					bot_client_id: string;
					bot_name: string;
					owner_id: string;
					profile: string;
					retry_after_s: number;
					scopes: string[];
				}[];
			};
			mowa_approval_fields: { Args: { p_owner: string }; Returns: string[] };
			mowa_assert_bot_tenant: { Args: { p_row_owner: string }; Returns: string };
			mowa_assert_instrument_owner: {
				Args: { p_instrument: string; p_owner: string };
				Returns: undefined;
			};
			mowa_check_qty: { Args: { p_asset: string; p_qty: number }; Returns: undefined };
			mowa_current_bot: { Args: Record<PropertyKey, never>; Returns: string };
			mowa_display_id: { Args: { p_no: number; p_prefix: string }; Returns: string };
			mowa_is_service: { Args: Record<PropertyKey, never>; Returns: boolean };
			mowa_next_display_no: { Args: { p_owner: string; p_scope: string }; Returns: number };
			mowa_proposal_expiry: { Args: { p_owner: string }; Returns: string };
			mowa_setting: { Args: { p_default: Json; p_key: string; p_owner: string }; Returns: Json };
			reject_proposal: {
				Args: { p_id: string; p_note?: string };
				Returns: {
					acknowledged_at: string | null;
					acknowledged_by: string | null;
					applied_values: Json | null;
					attention_started_at: string | null;
					base_version: number | null;
					calc_note: string | null;
					change_type: string;
					client_ref: string | null;
					created_at: string;
					current_values: Json | null;
					decided_at: string | null;
					decided_by: string | null;
					decision_note: string | null;
					display_id: string | null;
					display_no: number;
					evidence: NonNullable<Json>;
					expires_at: string;
					held_at: string | null;
					id: string;
					instrument_id: string | null;
					owner_id: string;
					position_id: string | null;
					proposed_by: string | null;
					proposed_by_type: string;
					proposed_by_user: string | null;
					proposed_values: NonNullable<Json>;
					reason_md: string | null;
					result_position_id: string | null;
					status: string;
					updated_at: string;
				};
				SetofOptions: {
					from: '*';
					to: 'position_proposals';
					isOneToOne: true;
					isSetofReturn: false;
				};
			};
		};
		Enums: {
			asset_category: 'real_estate' | 'investment' | 'cash' | 'liability';
			asset_currency: 'KRW' | 'USD' | 'BTC' | 'ETH' | 'XAU' | 'XAG';
			cashflow_cadence: 'monthly' | 'yearly';
			cashflow_direction: 'income' | 'expense';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema['Enums']
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema['CompositeTypes']
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			asset_category: ['real_estate', 'investment', 'cash', 'liability'],
			asset_currency: ['KRW', 'USD', 'BTC', 'ETH', 'XAU', 'XAG'],
			cashflow_cadence: ['monthly', 'yearly'],
			cashflow_direction: ['income', 'expense']
		}
	}
} as const;
