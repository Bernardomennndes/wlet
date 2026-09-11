CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"bank" text NOT NULL,
	"bank_code" text NOT NULL,
	"entity" text NOT NULL,
	"type" text NOT NULL,
	"holder" text NOT NULL,
	"external_id" text NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"coverage_from" date,
	"coverage_to" date,
	"reported_balance" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "accounts_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_blobs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"meta" jsonb NOT NULL,
	"investments" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"user_id" text NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_files_user_id_path_pk" PRIMARY KEY("user_id","path")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"entity" text NOT NULL,
	"date" date NOT NULL,
	"posted_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" text NOT NULL,
	"raw_description" text NOT NULL,
	"merchant" text NOT NULL,
	"kind" text NOT NULL,
	"category_id" text NOT NULL,
	"category_rule" text,
	"installment_current" integer,
	"installment_total" integer,
	"invoice" jsonb,
	"transfer_kind" text,
	"counterpart_account_id" text,
	"transfer_id" text,
	"planned_id" text,
	"receivable_id" text,
	"source" text NOT NULL,
	"fit_id" text,
	CONSTRAINT "transactions_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"from_account_id" text NOT NULL,
	"to_account_id" text NOT NULL,
	"from_transaction_id" text,
	"to_transaction_id" text,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "transfers_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"saved" numeric(14, 2) NOT NULL,
	"slot" numeric NOT NULL,
	"target_month" text NOT NULL,
	CONSTRAINT "goals_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"user_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "overrides_user_id_transaction_id_pk" PRIMARY KEY("user_id","transaction_id")
);
--> statement-breakpoint
CREATE TABLE "plan_groups" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "plan_groups_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "planned_entries" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"category_id" text NOT NULL,
	"entity" text NOT NULL,
	"recurrence" text NOT NULL,
	"start_month" text NOT NULL,
	"end_month" text,
	"count" numeric,
	"due_on" jsonb,
	"exceptions" jsonb,
	"match" jsonb,
	CONSTRAINT "planned_entries_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	"category_id" text NOT NULL,
	"cash" numeric(14, 2) NOT NULL,
	"financed_total" numeric(14, 2),
	"financed_installments" numeric,
	"payment" text,
	"month" text,
	"group_id" text,
	"status" text NOT NULL,
	CONSTRAINT "plans_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"label" text NOT NULL,
	"debtor" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"entity" text NOT NULL,
	"recurrence" text NOT NULL,
	"start_month" text NOT NULL,
	"end_month" text,
	"count" numeric,
	"due_on" jsonb NOT NULL,
	"match" jsonb NOT NULL,
	"offsets_category_id" text NOT NULL,
	"account_id" text,
	CONSTRAINT "receivables_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"budget" jsonb NOT NULL,
	"account_profiles" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"self_name_patterns" jsonb NOT NULL,
	"preferences" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_blobs" ADD CONSTRAINT "dataset_blobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_groups" ADD CONSTRAINT "plan_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_entries" ADD CONSTRAINT "planned_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "transactions_user_category_idx" ON "transactions" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "plans_user_group_idx" ON "plans" USING btree ("user_id","group_id");