// Fixed: src/lib/aiProcessor.ts
// Corrected signature handling and conversation threading

export interface EmailContext {
  subject: string;
  fromEmail: string;
  body: string;
  conversationHistory?: string;
  originalMessage?: any; // Add full original message context
  clientTemplate: {
    writingStyle: string;
    tone: string;
    signature: string;
    sampleEmails: string[];
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
          model: 'claude-3-5-sonnet-20241022',
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
      
      // Format response WITHOUT adding signature here (signature will be in template)
      return this.formatResponse(aiText, false); // Don't add signature in formatting
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
          model: 'claude-3-5-sonnet-20241022',
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
      
      // Parse the structured response (expecting JSON)
      try {
        const parsed = JSON.parse(responseText);
        return {
          content: parsed.content || responseText,
          confidence: parsed.confidence || 0.8,
          tokens_used: data.usage?.total_tokens || 0,
          reasoning: parsed.reasoning
        };
      } catch (parseError) {
        // Fallback if response isn't JSON
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
    // Build conversation history if available
    let conversationText = '';
    if (context.conversationHistory) {
      conversationText = `CONVERSATION HISTORY:\n${context.conversationHistory}\n\n`;
    }

    // Format calendar availability in readable format
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
      calendarText = `CALENDAR AVAILABILITY (Next 7 days):\n${events.join('\n')}\n\n`;
    }

    // Include sample emails for style reference
    let sampleEmailsText = '';
    if (context.clientTemplate.sampleEmails && context.clientTemplate.sampleEmails.length > 0) {
      const validSamples = context.clientTemplate.sampleEmails.filter(sample => sample.trim());
      if (validSamples.length > 0) {
        sampleEmailsText = `WRITING STYLE EXAMPLES:\n${validSamples.map((sample, index) => `Example ${index + 1}:\n${sample.trim()}`).join('\n\n')}\n\n`;
      }
    }

    return `You are an AI email assistant helping to write professional email responses that match the user's personal writing style and tone.

${conversationText}INCOMING EMAIL:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${context.body}

CLIENT COMMUNICATION PREFERENCES:
- Writing Style: ${context.clientTemplate.writingStyle}
- Tone: ${context.clientTemplate.tone}
- Email Signature: ${context.clientTemplate.signature}

${sampleEmailsText}${calendarText}IMPORTANT INSTRUCTIONS:
1. Write a response that acknowledges the sender's message appropriately
2. Address their main points or questions directly
3. Match the specified writing style and tone exactly
4. Use natural, conversational language that matches the examples provided
5. If mentioning availability, use natural language like "tomorrow afternoon" or "Wednesday morning"
6. Do NOT include any signature or closing in your response - the signature will be added automatically
7. Write in paragraph format with proper spacing
8. Do not include a subject line
9. Keep the response focused and actionable

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
    // Clean up the AI response
    let formatted = aiText.trim();
    
    // Remove any subject line that might have been included
    formatted = formatted.replace(/^Subject:.*\n?/im, '').trim();
    
    // Remove any signature-like content that AI might have added
    formatted = formatted.replace(/Best regards,?\n?.*$/im, '').trim();
    formatted = formatted.replace(/Sincerely,?\n?.*$/im, '').trim();
    formatted = formatted.replace(/Kind regards,?\n?.*$/im, '').trim();
    formatted = formatted.replace(/Thank you,?\n?.*$/im, '').trim();
    
    // Convert to proper HTML formatting for email
    formatted = formatted
      .split('\n\n') // Split on double newlines (paragraphs)
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
          model: 'claude-3-5-sonnet-20241022',
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
      // Get the original message details
      const originalMessage = await graphService.getEmailDetails(messageId);
      
      if (!originalMessage || !originalMessage.conversationId) {
        return '';
      }

      // Get all messages in the conversation thread
      const conversationMessages = await graphService.getConversationThread(originalMessage.conversationId);
      
      if (!conversationMessages || conversationMessages.length <= 1) {
        return '';
      }

      // Sort messages by received date
      const sortedMessages = conversationMessages
        .sort((a: any, b: any) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime())
        .slice(0, -1); // Remove the last message (current one we're replying to)

      // Format conversation history
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
    // Remove HTML tags and decode entities
    let cleaned = htmlContent.replace(/<[^>]*>/g, '');
    
    // Decode common HTML entities
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Remove excessive whitespace and truncate if too long
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 500) + '...';
    }
    
    return cleaned;
  }
}