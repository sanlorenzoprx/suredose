export function medicineSaveError(fields: {
  name: string;
  strength: string;
  times: string[];
  scheduleConfirmed: boolean;
}): string | null {
  if (!fields.name.trim()) return "Enter the medicine name before saving.";
  if (!fields.strength.trim()) return "Enter the medicine strength before saving.";
  if (fields.times.length === 0) return "Choose at least one reminder time before saving.";
  if (!fields.scheduleConfirmed) return "Confirm the reminder time before saving.";
  return null;
}
