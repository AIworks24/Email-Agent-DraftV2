// src/lib/aiProcessor.ts - Enhanced with calendar and custom instructions
export interface EmailContext {
  subject: string;
  fromEmail: string;
  body: string;
  conversationHistory?: string;
  originalMessage?: any;
  clientTemplate: {
    writingStyle: string;
    tone: string;
    signature: string;
    sampleEmails: string[];
    customInstructions?: string; // ✅ NEW
  };
  calendarAvailability?: any[];
}

export interface AIResponse {
  content: string;
  confidence: number;
  tokens_used: number;
  reasoning?: string;
}

export class AIEmailProcessor {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }
    this.apiKey = apiKey;
  }

  async generateResponse(context: EmailContext): Promise<string> {
    try {
      const prompt = this.buildPrompt(context);
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          temperature: 0.3,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const aiText = data.content?.[0]?.text || '';
      
      return this.formatResponse(aiText, false);
    } catch (error) {
      console.error('AI processing error:', error);
      throw new Error(`Failed to generate AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateWithAnalysis(context: EmailContext): Promise<AIResponse> {
    try {
      const analysisPrompt = this.buildAnalysisPrompt(context);
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          temperature: 0.3,
          messages: [
            { role: 'user', content: analysisPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.content?.[0]?.text || '';
      
      try {
        const parsed = JSON.parse(responseText);
        return {
          content: parsed.content || responseText,
          confidence: parsed.confidence || 0.8,
          tokens_used: data.usage?.total_tokens || 0,
          reasoning: parsed.reasoning
        };
      } catch (parseError) {
        return {
          content: responseText,
          confidence: 0.7,
          tokens_used: data.usage?.total_tokens || 0
        };
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      throw new Error(`Failed to generate AI analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildPrompt(context: EmailContext): string {
    const now = new Date();
    const easternTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(now);

    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long'
    }).format(now);
  
    let conversationText = '';
    if (context.conversationHistory) {
      conversationText = `CONVERSATION HISTORY:\n${context.conversationHistory}\n\n`;
    }

    // ✅ ENHANCED: Format calendar availability with better context
    let calendarText = '';
    if (context.calendarAvailability && context.calendarAvailability.length > 0) {
      const events = context.calendarAvailability.map(event => {
        const start = new Date(event.start?.dateTime || event.start?.date);
        const end = new Date(event.end?.dateTime || event.end?.date);
        const startStr = start.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        });
        const endStr = end.toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        });
        return `${event.subject || 'Busy'}: ${startStr} - ${endStr}`;
      });
      calendarText = `CALENDAR AVAILABILITY (Next 7 days):\n${events.join('\n')}\n\nIMPORTANT: When discussing meeting times, reference these scheduled events to avoid conflicts and suggest times when the calendar is free.\n\n`;
    }

    let sampleEmailsText = '';
    if (context.clientTemplate.sampleEmails && context.clientTemplate.sampleEmails.length > 0) {
      const validSamples = context.clientTemplate.sampleEmails.filter(sample => sample.trim());
      if (validSamples.length > 0) {
        sampleEmailsText = `WRITING STYLE EXAMPLES:\n${validSamples.map((sample, index) => `Example ${index + 1}:\n${sample.trim()}`).join('\n\n')}\n\n`;
      }
    }

    // ✅ NEW: Include custom instructions if provided
    let customInstructionsText = '';
    if (context.clientTemplate.customInstructions && context.clientTemplate.customInstructions.trim()) {
      customInstructionsText = `CRITICAL CUSTOM INSTRUCTIONS (MUST FOLLOW):\n${context.clientTemplate.customInstructions.trim()}\n\n`;
    }

    return `You are an AI email assistant helping to write professional email responses that match the user's personal writing style and tone.

CURRENT DATE AND TIME: ${easternTime}
TODAY IS: ${dayOfWeek}

${conversationText}INCOMING EMAIL:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${context.body}

CLIENT COMMUNICATION PREFERENCES:
- Writing Style: ${context.clientTemplate.writingStyle}
- Tone: ${context.clientTemplate.tone}
- Email Signature: ${context.clientTemplate.signature}

${sampleEmailsText}${calendarText}${customInstructionsText}IMPORTANT INSTRUCTIONS:
1. Write a response that acknowledges the sender's message appropriately
2. Address their main points or questions directly
3. Match the specified writing style and tone exactly
4. Use natural, conversational language that matches the examples provided
5. If mentioning availability, use natural language like "tomorrow afternoon" or "Wednesday morning"
6. Do NOT include any signature or closing in your response - the signature will be added automatically
7. Write in paragraph format with proper spacing
8. Do not include a subject line
9. Keep the response focused and actionable
10. CRITICAL: Follow all custom instructions above - do not make assumptions that contradict them
11. CRITICAL: If calendar data is provided, respect existing commitments and only suggest free times
12. NEVER assume information not explicitly stated (e.g., meeting locations, prior agreements, etc.)

Write only the email body content without any signature or closing. The signature will be added automatically by the system.`;
  }

  private buildAnalysisPrompt(context: EmailContext): string {
    return `Analyze this email and provide a structured response in JSON format.

INCOMING EMAIL:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${context.body}

${context.conversationHistory ? `CONVERSATION HISTORY:\n${context.conversationHistory}\n` : ''}

Provide your analysis in this exact JSON format:
{
  "content": "Your generated email response here (without signature)",
  "confidence": 0.85,
  "reasoning": "Brief explanation of your approach and key considerations"
}

Use these guidelines:
- Writing Style: ${context.clientTemplate.writingStyle}
- Tone: ${context.clientTemplate.tone}
- Confidence should be 0.0-1.0 based on how clear the intent is
- Keep reasoning brief but insightful
- Do NOT include signature in content - it will be added separately

Return only valid JSON.`;
  }

  private formatResponse(aiText: string, addSignature: boolean = false): string {
    let formatted = aiText.trim();
    
    formatted = formatted.replace(/^Subject:.*\n?/im, '').trim();
    
    formatted = formatted.replace(/Best regards,?\n?.*$/im, '').trim();
    formatted = formatted.replace(/Sincerely,?\n?.*$/im, '').trim();
    formatted = formatted.replace(/Kind regards,?\n?.*$/im, '').trim();
    formatted = formatted.replace(/Thank you,?\n?.*$/im, '').trim();
    
    formatted = formatted
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('\n');
    
    return formatted;
  }

  async summarizeConversation(messages: any[]): Promise<string> {
    try {
      const conversationText = messages.map(msg => 
        `From: ${msg.from}\nDate: ${msg.date}\nBody: ${msg.body}`
      ).join('\n\n---\n\n');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          temperature: 0.2,
          messages: [
            { 
              role: 'user', 
              content: `Summarize this email conversation concisely, focusing on key points and decisions:\n\n${conversationText}` 
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || '';
    } catch (error) {
      console.error('Conversation summary error:', error);
      return 'Unable to summarize conversation';
    }
  }

  async getConversationHistory(messageId: string, graphService: any): Promise<string> {
    try {
      const originalMessage = await graphService.getEmailDetails(messageId);
      
      if (!originalMessage || !originalMessage.conversationId) {
        return '';
      }

      const conversationMessages = await graphService.getConversationThread(originalMessage.conversationId);
      
      if (!conversationMessages || conversationMessages.length <= 1) {
        return '';
      }

      const sortedMessages = conversationMessages
        .sort((a: any, b: any) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime())
        .slice(0, -1);

      const history = sortedMessages.map((msg: any, index: number) => {
        const from = msg.from?.emailAddress?.address || 'Unknown';
        const date = new Date(msg.receivedDateTime).toLocaleDateString();
        const body = this.cleanEmailBody(msg.body?.content || '');
        
        return `Message ${index + 1} (${date}):\nFrom: ${from}\n${body}`;
      }).join('\n\n---\n\n');

      return history;
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return '';
    }
  }

  private cleanEmailBody(htmlContent: string): string {
    let cleaned = htmlContent.replace(/<[^>]*>/g, '');
    
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 500) + '...';
    }
    
    return cleaned;
  }

  // ✅ NEW: Helper method to format calendar events for better AI understanding
  formatCalendarForAI(events: any[]): string {
    if (!events || events.length === 0) {
      return 'No calendar events in the next 7 days - schedule is currently open.';
    }

    const formattedEvents = events.map(event => {
      const start = new Date(event.start?.dateTime || event.start?.date);
      const end = new Date(event.end?.dateTime || event.end?.date);
      
      return {
        subject: event.subject || 'Busy',
        start: start,
        end: end,
        dayOfWeek: start.toLocaleDateString('en-US', { weekday: 'long' }),
        timeSlot: `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      };
    });

    return formattedEvents
      .map(e => `${e.dayOfWeek}: ${e.subject} (${e.timeSlot})`)
      .join('\n');
  }
}