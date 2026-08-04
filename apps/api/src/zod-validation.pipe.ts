import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

interface ValidationIssue {
  flatten(): unknown;
}

interface ValidationSchema {
  safeParse(
    value: unknown,
  ): { success: true; data: unknown } | { success: false; error: ValidationIssue };
}

@Injectable()
export class ZodValidationPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: ValidationSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }

    return result.data;
  }
}
