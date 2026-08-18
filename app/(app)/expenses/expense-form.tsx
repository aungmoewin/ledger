"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpenseFormState } from "@/lib/validation/expense";

const initialState: ExpenseFormState = {};

type Category = { id: number; name: string };

type ExpenseFormAction = (
  prevState: ExpenseFormState,
  formData: FormData,
) => Promise<ExpenseFormState>;

export function ExpenseForm({
  categories,
  action,
  submitLabel = "Add",
  defaults,
}: {
  categories: Category[];
  action: ExpenseFormAction;
  submitLabel?: string;
  defaults?: {
    amount?: string;
    categoryId?: number;
    spentOn?: string;
    note?: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_2fr_auto]"
    >
      <div className="grid gap-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="12.50"
          defaultValue={defaults?.amount ?? ""}
          required
        />
        <FieldError messages={state.fieldErrors?.amount} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={defaults?.categoryId ?? ""}
          required
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <FieldError messages={state.fieldErrors?.categoryId} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="spentOn">Date</Label>
        <Input
          id="spentOn"
          name="spentOn"
          type="date"
          defaultValue={defaults?.spentOn ?? ""}
          required
        />
        <FieldError messages={state.fieldErrors?.spentOn} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          name="note"
          placeholder="Optional"
          defaultValue={defaults?.note ?? ""}
        />
        <FieldError messages={state.fieldErrors?.note} />
      </div>

      {state.formError ? (
        <p className="text-destructive text-sm">{state.formError}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
