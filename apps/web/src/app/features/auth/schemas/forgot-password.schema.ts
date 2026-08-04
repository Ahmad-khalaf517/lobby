import { z } from 'zod';

import { loginSchema } from './login.schema';

export const forgotPasswordSchema = loginSchema.pick({ email: true });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
