import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().min(1, 'Name required').max(100, 'Name too long'),
  email: z.string().email('Valid email required'),
  company: z.string().max(100, 'Company name too long').optional()
});

export const settingsSchema = z.object({
  writingStyle: z.enum(['professional', 'casual', 'formal', 'friendly', 'concise']),
  tone: z.enum(['friendly', 'professional', 'enthusiastic', 'neutral', 'empathetic']),
  signature: z.string().max(500, 'Signature too long'),
  sampleEmails: z.array(z.string().max(2000, 'Email example too long')).max(5, 'Too many examples'),
  autoResponse: z.boolean(),
  responseDelay: z.number().min(0, 'Delay cannot be negative').max(30, 'Delay too long'),
  customInstructions: z.string().max(2000, 'Instructions too long').optional() // ✅ NEW
});

export function safeValidate<T>(schema: z.ZodSchema<T>, data: any): { success: boolean; data?: T; errors?: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error: any) {
    if (error?.issues && Array.isArray(error.issues)) {
      return { 
        success: false, 
        errors: error.issues.map((issue: any) => `${issue.path?.join('.') || 'field'}: ${issue.message}`)
      };
    }
    return { success: false, errors: ['Validation error'] };
  }
}