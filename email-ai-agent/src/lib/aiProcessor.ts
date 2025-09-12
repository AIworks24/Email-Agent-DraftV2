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
          model: 'claude-3-sonnet-20240229',
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
          model: 'claude-3-sonnet-20240229',
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
        const result = JSON.parse(responseText);
        return {
          content: this.formatResponse(result.response, context.clientTemplate.signature),
          confidence: result.confidence || 0.8,
          tokens_used: data.usage?.output_tokens || 0,
          reasoning: result.reasoning
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          content: this.formatResponse(responseText, context.clientTemplate.signature),
          confidence: 0.7,
          tokens_used: data.usage?.output_tokens || 0
        };
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      throw error;
    }
  }

  private buildPrompt(context: EmailContext): string {
    return `You are an AI email assistant responding on behalf of a professional. Your task is to generate an appropriate email response.

CONTEXT:
- Client Writing Style: ${context.clientTemplate.writingStyle}
- Client Tone: ${context.clientTemplate.tone}
- Client Name/Signature: ${context.clientTemplate.signature}

SAMPLE EMAILS (for reference style):
${context.clientTemplate.sampleEmails.length > 0 ? 
  context.clientTemplate.sampleEmails.map((email, i) => `Sample ${i + 1}:\n${email}`).join('\n---\n') : 
  'No sample emails provided - use professional standards'
}

EMAIL TO RESPOND TO:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${this.cleanEmailBody(context.body)}

${context.conversationHistory ? `
CONVERSATION HISTORY:
${context.conversationHistory}
` : ''}

${context.calendarAvailability && context.calendarAvailability.length > 0 ? `
CALENDAR AVAILABILITY (if meeting request is detected):
${this.formatCalendarAvailability(context.calendarAvailability)}
` : ''}

INSTRUCTIONS:
1. Analyze the email content to understand the sender's intent and any requests
2. Generate a response that matches the client's writing style and tone exactly
3. Address all points raised in the original email
4. If this appears to be a meeting request, suggest available times from the calendar
5. Keep the response concise but complete and helpful
6. Use proper email etiquette and formatting
7. Do NOT include a signature block (it will be added separately)
8. Make the response sound natural and human-like, not robotic

IMPORTANT GUIDELINES:
- Match the formality level of the original email
- Be helpful and responsive to requests
- If you cannot fulfill a request, politely explain and offer alternatives
- For meeting requests, be specific about available time slots
- Maintain the client's professional reputation
- Keep responses under 200 words unless more detail is specifically needed

Generate only the email response content (no subject line, no signature):`;
  }

  private buildAnalysisPrompt(context: EmailContext): string {
    return `You are an AI email assistant. Analyze the following email and generate a response with analysis.

EMAIL CONTEXT:
Subject: ${context.subject}
From: ${context.fromEmail}
Body: ${this.cleanEmailBody(context.body)}

CLIENT PREFERENCES:
- Writing Style: ${context.clientTemplate.writingStyle}
- Tone: ${context.clientTemplate.tone}
- Signature: ${context.clientTemplate.signature}

Respond with a JSON object containing:
{
  "response": "The actual email response content",
  "confidence": 0.85,
  "reasoning": "Brief explanation of the response approach",
  "email_type": "inquiry|meeting_request|follow_up|complaint|other",
  "urgency": "low|medium|high",
  "requires_human_review": false
}

Generate a professional response that addresses all points in the original email while matching the client's style preferences.`;
  }

  private cleanEmailBody(body: string): string {
    if (!body) return '';
    
    // Remove HTML tags and clean up the email body
    return body
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private formatCalendarAvailability(availability: any[]): string {
    if (!availability || availability.length === 0) {
      return 'No calendar information available';
    }

    const formatDateTime = (dateTime: string) => {
      try {
        return new Date(dateTime).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      } catch (error) {
        return dateTime;
      }
    };

    return availability
      .filter(event => event.showAs !== 'free') // Only show busy times
      .map(event => {
        const start = event.start?.dateTime || 'Unknown time';
        const end = event.end?.dateTime || 'Unknown time';
        const subject = event.subject || 'Busy';
        return `${formatDateTime(start)} - ${formatDateTime(end)}: ${subject}`;
      })
      .join('\n');
  }

  private formatResponse(aiResponse: string, signature: string): string {
    if (!aiResponse) return signature;
    
    // Clean up the AI response
    let formattedResponse = aiResponse.trim();
    
    // Remove any signature that might have been generated
    formattedResponse = formattedResponse.replace(/^(Best regards|Sincerely|Thanks|Thank you)[,]?\s*[\r\n]+.*$/gim, '');
    
    // Add proper spacing and signature
    return `${formattedResponse}\n\n${signature}`;
  }

  // Utility method to estimate tokens (rough approximation)
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  // Method to classify email types for better response handling
  async classifyEmail(subject: string, body: string): Promise<{
    type: 'inquiry' | 'meeting_request' | 'follow_up' | 'complaint' | 'urgent' | 'spam' | 'other';
    confidence: number;
    keywords: string[];
  }> {
    const classificationPrompt = `Analyze this email and classify its type:

Subject: ${subject || 'No subject'}
Body: ${this.cleanEmailBody(body)}

Respond with JSON:
{
  "type": "inquiry|meeting_request|follow_up|complaint|urgent|spam|other",
  "confidence": 0.85,
  "keywords": ["keyword1", "keyword2"]
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307', // Use faster model for classification
          max_tokens: 200,
          temperature: 0.1,
          messages: [
            { role: 'user', content: classificationPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Classification API error: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.content?.[0]?.text || '{}';
      
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        return {
          type: 'other',
          confidence: 0.5,
          keywords: []
        };
      }
    } catch (error) {
      console.error('Email classification error:', error);
      return {
        type: 'other',
        confidence: 0.5,
        keywords: []
      };
    }
  }

  // Method to generate multiple response options
  async generateMultipleOptions(context: EmailContext, count: number = 3): Promise<string[]> {
    const responses: string[] = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const prompt = this.buildPrompt(context) + `\n\nGenerate response variation ${i + 1}:`;
        
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
            temperature: 0.4 + (i * 0.2), // Vary temperature for different options
            messages: [
              { role: 'user', content: prompt }
            ]
          })
        });

        if (!response.ok) {
          console.error(`Failed to generate option ${i + 1}`);
          continue;
        }

        const data = await response.json();
        const aiText = data.content?.[0]?.text || '';
        responses.push(this.formatResponse(aiText, context.clientTemplate.signature));
      } catch (error) {
        console.error(`Error generating response option ${i + 1}:`, error);
      }
    }
    
    return responses;
  }

  // Method to improve response based on feedback
  async improveResponse(
    originalContext: EmailContext, 
    currentResponse: string, 
    feedback: string
  ): Promise<string> {
    const improvementPrompt = `You previously generated this email response:

ORIGINAL EMAIL:
Subject: ${originalContext.subject}
From: ${originalContext.fromEmail}
Body: ${this.cleanEmailBody(originalContext.body)}

YOUR PREVIOUS RESPONSE:
${currentResponse}

FEEDBACK FOR IMPROVEMENT:
${feedback}

CLIENT STYLE PREFERENCES:
- Writing Style: ${originalContext.clientTemplate.writingStyle}
- Tone: ${originalContext.clientTemplate.tone}

Please generate an improved version of the response that addresses the feedback while maintaining the client's style preferences. Do not include a signature.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1500,
          temperature: 0.3,
          messages: [
            { role: 'user', content: improvementPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Improvement API error: ${response.status}`);
      }

      const data = await response.json();
      const improvedText = data.content?.[0]?.text || '';
      
      return this.formatResponse(improvedText, originalContext.clientTemplate.signature);
    } catch (error) {
      console.error('Error improving response:', error);
      throw error;
    }
  }
}