// Enhanced: src/lib/microsoftGraph.ts 
// Fixed threading and signature handling

import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';

class CustomAuthProvider implements AuthenticationProvider {
  constructor(private accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

export class GraphService {
  private client: Client;

  constructor(accessToken: string) {
    const authProvider = new CustomAuthProvider(accessToken);
    this.client = Client.initWithMiddleware({ authProvider });
  }

  /**
   * Create a draft reply to an email with proper threading and signature
   */
  async createDraftReply(messageId: string, replyContent: string, signature: string, replyAll: boolean = false) {
    try {
      console.log('Creating threaded draft reply for message:', messageId);
      
      // First, get the original message to understand the thread
      const originalMessage = await this.getEmailDetails(messageId);
      console.log('Original message subject:', originalMessage?.subject);
      
      // Create the reply draft using Microsoft Graph
      const endpoint = replyAll 
        ? `/me/messages/${messageId}/createReplyAll` 
        : `/me/messages/${messageId}/createReply`;
      
      const draft = await this.client
        .api(endpoint)
        .post({});

      console.log('Draft created with ID:', draft.id);

      // Prepare the complete email body with signature
      const completeEmailBody = this.buildCompleteEmailBody(replyContent, signature, originalMessage);

      // Update the draft with our AI-generated content and proper signature
      const updatedDraft = await this.client
        .api(`/me/messages/${draft.id}`)
        .patch({
          body: {
            contentType: 'HTML',
            content: completeEmailBody
          }
        });

      console.log('Draft updated with AI content and signature');
      return updatedDraft;
    } catch (error) {
      console.error('Error creating draft reply:', error);
      throw error;
    }
  }

  /**
   * Build complete email body with signature and threading context
   */
  private buildCompleteEmailBody(aiResponse: string, signature: string, originalMessage?: any): string {
    let emailBody = aiResponse;
    
    // Add signature if provided and not already present
    if (signature && signature.trim()) {
      const formattedSignature = signature.replace(/\n/g, '<br>');
      emailBody += `<br><br><p>${formattedSignature}</p>`;
    }
    
    // Add the original message as context (this creates proper threading)
    if (originalMessage) {
      const originalSender = originalMessage.from?.emailAddress?.address || 'Unknown Sender';
      const originalDate = new Date(originalMessage.receivedDateTime).toLocaleString();
      const originalSubject = originalMessage.subject || 'No Subject';
      
      // Clean the original body content
      let originalBody = originalMessage.body?.content || '';
      originalBody = this.cleanHtmlContent(originalBody);
      
      // Add the original message thread
      emailBody += `
        <br><br>
        <hr>
        <div style="font-size: 12px; color: #666;">
          <p><strong>From:</strong> ${originalSender}</p>
          <p><strong>Sent:</strong> ${originalDate}</p>
          <p><strong>Subject:</strong> ${originalSubject}</p>
        </div>
        <br>
        <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px;">
          ${originalBody}
        </div>
      `;
    }
    
    return emailBody;
  }

  /**
   * Clean HTML content for threading display
   */
  private cleanHtmlContent(htmlContent: string): string {
    if (!htmlContent) return '';
    
    // Remove excessive styling but keep basic formatting
    let cleaned = htmlContent
      .replace(/<style[^>]*>.*?<\/style>/gi, '') // Remove style tags
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
      .replace(/style\s*=\s*"[^"]*"/gi, '') // Remove inline styles
      .replace(/class\s*=\s*"[^"]*"/gi, '') // Remove classes
      .replace(/<font[^>]*>/gi, '') // Remove font tags
      .replace(/<\/font>/gi, '');
    
    // Truncate if too long to avoid overwhelming the reply
    if (cleaned.length > 2000) {
      cleaned = cleaned.substring(0, 2000) + '...<br><em>[Message truncated]</em>';
    }
    
    return cleaned;
  }

  /**
   * Get emails from the user's inbox
   */
  async getEmails(top: number = 50) {
    try {
      return await this.client
        .api('/me/messages')
        .top(top)
        .select('id,subject,from,toRecipients,body,receivedDateTime,conversationId,isRead')
        .orderby('receivedDateTime DESC')
        .get();
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  /**
   * Get specific email details
   */
  async getEmailDetails(messageId: string) {
    try {
      return await this.client
        .api(`/me/messages/${messageId}`)
        .select('id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,conversationId,isRead')
        .get();
    } catch (error) {
      console.error('Error fetching email details:', error);
      throw error;
    }
  }

  /**
   * Get conversation thread messages
   */
  async getConversationThread(conversationId: string) {
    try {
      const messages = await this.client
        .api('/me/messages')
        .filter(`conversationId eq '${conversationId}'`)
        .select('id,subject,from,body,receivedDateTime,conversationId')
        .orderby('receivedDateTime DESC')
        .top(10) // Limit to last 10 messages in thread
        .get();

      return messages.value || [];
    } catch (error) {
      console.error('Error fetching conversation thread:', error);
      return [];
    }
  }

  /**
   * Subscribe to email notifications via webhook
   */
  async subscribeToEmails(webhookUrl: string, clientState: string) {
    try {
      const subscription = {
        changeType: 'created',
        notificationUrl: webhookUrl,
        resource: '/me/messages',
        expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        clientState: clientState
      };

      return await this.client
        .api('/subscriptions')
        .post(subscription);
    } catch (error) {
      console.error('Error creating email subscription:', error);
      throw error;
    }
  }

  /**
   * Get calendar events with timezone conversion
   */
  async getCalendarEvents(startTime: string, endTime: string) {
    try {
      // Get user's timezone first
      const profile = await this.client
        .api('/me/mailboxSettings')
        .get();
      
      const userTimezone = profile.timeZone || 'UTC';
      
      const events = await this.client
        .api('/me/events')
        .filter(`start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'`)
        .select('subject,start,end,location,attendees')
        .header('Prefer', `outlook.timezone="${userTimezone}"`)
        .orderby('start/dateTime')
        .get();

      return events;
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Renew an existing subscription
   */
  async renewSubscription(subscriptionId: string) {
    try {
      const newExpiration = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      
      return await this.client
        .api(`/subscriptions/${subscriptionId}`)
        .patch({
          expirationDateTime: newExpiration
        });
    } catch (error) {
      console.error('Error renewing subscription:', error);
      throw error;
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string) {
    try {
      return await this.client
        .api(`/subscriptions/${subscriptionId}`)
        .delete();
    } catch (error) {
      console.error('Error deleting subscription:', error);
      throw error;
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile() {
    try {
      return await this.client
        .api('/me')
        .select('displayName,mail,userPrincipalName,jobTitle,department')
        .get();
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  /**
   * Test token validity
   */
  async testTokenValidity(): Promise<boolean> {
    try {
      await this.client.api('/me').get();
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }
}