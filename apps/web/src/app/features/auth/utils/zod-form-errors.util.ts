import { ZodError } from 'zod';

export function mapZodFieldErrors<TField extends string>(
  error: ZodError,
  fields: readonly TField[],
): Partial<Record<TField, string>> {
  const errors: Partial<Record<TField, string>> = {};

  for (const issue of error.issues) {
    const path = issue.path[0];

    if (typeof path !== 'string' || !fields.includes(path as TField)) {
      continue;
    }

    const field = path as TField;
    if (errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }

  return errors;
}
