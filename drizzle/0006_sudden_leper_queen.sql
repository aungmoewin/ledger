CREATE TABLE "expense_splits" (
	"expense_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "expense_splits_expense_id_category_id_pk" PRIMARY KEY("expense_id","category_id"),
	CONSTRAINT "expense_splits_amount_positive" CHECK ("expense_splits"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_splits_category_id_idx" ON "expense_splits" USING btree ("category_id");--> statement-breakpoint
-- Hand-written. drizzle-kit generates schema deltas, not data migrations - the
-- third time in this project (0004, 0005, here). The tool is complete only when
-- a change is purely structural.
--
-- Every existing expense becomes a single split carrying its whole amount.
-- Unlike 0004's backfill, this one has a correct rule available: the category
-- each expense already belongs to. Runs after the foreign keys are in place, so
-- the inserted rows are validated against them rather than trusted.
INSERT INTO "expense_splits" ("expense_id", "category_id", "amount_cents")
SELECT "id", "category_id", "amount_cents" FROM "expenses";