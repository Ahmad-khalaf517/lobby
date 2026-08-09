import { z } from 'zod';

export const AuthEmailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address');

export const AuthPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must contain at least 8 characters');

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  isAnonymous: z.boolean(),
  userMetadata: z.record(z.unknown()),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginRequestSchema = z.object({
  email: AuthEmailSchema,
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must contain at least 6 characters'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .min(2, 'Name must contain at least 2 characters')
      .max(60, 'Name must contain at most 60 characters'),
    email: AuthEmailSchema,
    password: AuthPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const ConfirmEmailRequestSchema = z.object({
  tokenHash: z.string().min(1),
  type: z.literal('email'),
});

export type ConfirmEmailRequest = z.infer<typeof ConfirmEmailRequestSchema>;

export const EmailRequestSchema = z.object({
  email: AuthEmailSchema,
});

export type EmailRequest = z.infer<typeof EmailRequestSchema>;

export const VerifyRecoveryRequestSchema = z.object({
  tokenHash: z.string().min(1),
});

export type VerifyRecoveryRequest = z.infer<typeof VerifyRecoveryRequestSchema>;

export const ResetPasswordRequestSchema = z
  .object({
    password: AuthPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const AuthSessionResponseSchema = z.object({
  user: AuthUserSchema,
  accessToken: z.string().min(1),
  expiresAt: z.number().int().positive().nullable(),
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const CurrentUserResponseSchema = AuthSessionResponseSchema;

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const AnonymousAuthRequestSchema = z.object({
  captchaToken: z.string().min(1).optional(),
});

export type AnonymousAuthRequest = z.infer<typeof AnonymousAuthRequestSchema>;

export const RegistrationResponseSchema = z.object({
  message: z.string(),
  user: AuthUserSchema.optional(),
});

export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

export const AuthMessageResponseSchema = z.object({
  message: z.string(),
});

export type AuthMessageResponse = z.infer<typeof AuthMessageResponseSchema>;
