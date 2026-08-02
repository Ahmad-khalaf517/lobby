import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must contain at least 8 characters');

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .min(2, 'Name must contain at least 2 characters')
      .max(60, 'Name must contain at most 60 characters'),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
