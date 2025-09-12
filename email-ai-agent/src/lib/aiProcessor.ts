// lib/aiProcessor.ts
export interface EmailContext {
  subject: string;
  fromEmail: string;
  body: string;
  conversationHistory?: string;
  clientTemplate: {
    writingStyle: string;
    tone: string;
    signature: string;
    sampleEmails: string[];
  };
  calendarAvailability?: any[];
}

export class AIEmailProcessor {
  constructor(private apiKey: string) {}

  async generateResponse(context: EmailContext): Promise<string> {
    const prompt = this.buildPrompt(context);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await response.json();
    return this.formatResponse(data.content[0].text, context.clientTemplate.signature);
  }

  private buildPrompt(context: EmailContext): string {
    return `
You are an AI email assistant responding on behalf of a client. Here are the guidelines:

WRITING STYLE: ${context.clientTemplate.writingStyle}
TONE: ${context.clientTemplate.tone}

SAMPLE EMAILS (for reference style):
${context.clientTemplate.sampleEmails.join('\n---\n')}

EMAIL TO RESPOND TO:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${context.body}

${context.calendarAvailability ? `
CALENDAR AVAILABILITY (if meeting request is implied):
${JSON.stringify(context.calendarAvailability, null, 2)}
` : ''}

Please generate an appropriate email response that:
1. Matches the client's writing style and tone
2. Addresses all points in the original email
3. If this appears to be a meeting request, suggest available times from the calendar
4. Keep it concise but complete
5. Do NOT include a signature (it will be added separately)

Response:`;
  }

  private formatResponse(aiResponse: string, signature: string): string {
    return `${aiResponse.trim()}\n\n${signature}`;
  }
}