CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"item_type" text DEFAULT 'file' NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"share_link" text NOT NULL,
	"proof_id" text NOT NULL,
	"file_count" integer DEFAULT 1 NOT NULL,
	"total_size" integer DEFAULT 0 NOT NULL,
	"proof_hash" text,
	"storage_ref" text,
	"tx_ref" text,
	"owner_address" text,
	"owner_token" text,
	"network_name" text,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"name" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"object_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer_files" ADD CONSTRAINT "transfer_files_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE no action;