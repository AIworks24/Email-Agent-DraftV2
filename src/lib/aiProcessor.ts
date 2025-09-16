// Fixed: src/lib/aiProcessor.ts
// Update model name to current Claude model
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
          model: 'claude-3-5-sonnet-20241022', // Updated model name
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
      
      return this.formatResponse(aiText, context.clientTemplate.signature);
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
          model: 'claude-3-5-sonnet-20241022', // Updated model name
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
    return `You are an AI email assistant helping to write professional email responses.

INCOMING EMAIL:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${context.body}

CLIENT STYLE GUIDE:
- Writing Style: ${context.clientTemplate.writingStyle}
- Tone: ${context.clientTemplate.tone}
- Signature: ${context.clientTemplate.signature}

${context.conversationHistory ? `CONVERSATION HISTORY:\n${context.conversationHistory}\n` : ''}

${context.calendarAvailability ? `CALENDAR AVAILABILITY:\n${JSON.stringify(context.calendarAvailability, null, 2)}\n` : ''}

Please write a professional email response that:
1. Acknowledges the sender's message appropriately
2. Addresses their main points or questions
3. Uses the specified writing style and tone
4. Is helpful and actionable
5. Maintains professional boundaries

Do not include a subject line. Return only the email body text.`;
  }

  private buildAnalysisPrompt(context: EmailContext): string {
    return `Analyze this email and provide a structured response in JSON format.

INCOMING EMAIL:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${context.body}

Provide your analysis in this exact JSON format:
{
  "content": "Your generated email response here",
  "confidence": 0.85,
  "reasoning": "Brief explanation of your approach and key considerations"
}

Use these guidelines:
- Writing Style: ${context.clientTemplate.writingStyle}
- Tone: ${context.clientTemplate.tone}
- Confidence should be 0.0-1.0 based on how clear the intent is
- Keep reasoning brief but insightful

Return only valid JSON.`;
  }

  private formatResponse(aiText: string, signature: string): string {
    // Clean up the AI response
    let formatted = aiText.trim();
    
    // Remove any subject line that might have been included
    formatted = formatted.replace(/^Subject:.*\n?/im, '').trim();
    
    // Ensure proper paragraph spacing
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    // Add signature if not already present
    if (!formatted.toLowerCase().includes('best regards') && 
        !formatted.toLowerCase().includes('sincerely') &&
        !formatted.toLowerCase().includes(signature.toLowerCase())) {
      formatted += `\n\n${signature}`;
    }
    
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
          model: 'claude-3-5-sonnet-20241022', // Updated model name
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
}