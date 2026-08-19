-- Hand-edited: drizzle-kit generates schema deltas, not data migrations. The
-- ALTER below is all it produced, and on its own it fails - rows written before
-- households existed have household_id IS NULL, so the constraint is
-- unsatisfiable until they are dealt with.
--
-- Those rows have no owner to derive: household_id and created_by_id are both
-- null, so nothing can attribute them. Removed rather than guessed at.
--
-- In production this step needs a rule agreed with whoever owns the data, and
-- "there is no correct rule" would be a finding about the expand phase, not
-- something to paper over in the contract migration.
DELETE FROM "expenses" WHERE "household_id" IS NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "household_id" SET NOT NULL;
