CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "customer_handovers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"dateKey" varchar(10) NOT NULL,
	"customerName" varchar(128) DEFAULT '' NOT NULL,
	"store" varchar(64) DEFAULT '' NOT NULL,
	"content" varchar(2048) DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT '対応中' NOT NULL,
	"assignee" varchar(64) DEFAULT '' NOT NULL,
	"links" jsonb,
	"dueDate" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gray_cell_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"confirmedUntil" varchar(16) DEFAULT '' NOT NULL,
	"updatedBy" varchar(64) DEFAULT '' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "individual_handovers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"dateKey" varchar(10) NOT NULL,
	"author" varchar(64) DEFAULT '' NOT NULL,
	"target" varchar(64) DEFAULT '' NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "misoca_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"completedUntil" varchar(16) DEFAULT '' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_check_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"dateKey" varchar(10) NOT NULL,
	"checkType" varchar(32) NOT NULL,
	"checkedStores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores_shift_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"confirmedUntil" varchar(16) DEFAULT '' NOT NULL,
	"updatedBy" varchar(64) DEFAULT '' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"categoryId" integer NOT NULL,
	"label" varchar(512) NOT NULL,
	"defaultPlanned" varchar(64) DEFAULT '当日事務担当' NOT NULL,
	"deadline" varchar(64) DEFAULT '' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"legacyId" varchar(128),
	"showOnDays" varchar(128) DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"dateKey" varchar(10) NOT NULL,
	"taskId" varchar(128) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"help" boolean DEFAULT false NOT NULL,
	"note" varchar(1024) DEFAULT '' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "store_check_states_date_type_unique" ON "store_check_states" USING btree ("dateKey","checkType");--> statement-breakpoint
CREATE UNIQUE INDEX "task_states_date_task_unique" ON "task_states" USING btree ("dateKey","taskId");