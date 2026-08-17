// No "use client": this renders a paragraph and takes no handlers, so it works
// unchanged in either environment. Adding the directive would pull it into the
// client bundle for nothing.
//
// Only messages[0] is shown. Zod can report several issues for one field, and
// rendering them all makes the form jump as the user types.
export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-destructive text-sm">{messages[0]}</p>;
}
