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
      const originalSenderName = originalMessage.from?.emailAddress?.name || originalSender;
      
      // Parse the original date and convert to local timezone
      const originalDate = new Date(originalMessage.receivedDateTime);
      
      // Format date to match Outlook's style (Eastern Time)
      const formattedDate = originalDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric', 
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
        timeZone: 'America/New_York' // Eastern Time
      });
      
      const originalSubject = originalMessage.subject || 'No Subject';
      
      // Preserve original formatting but clean up excessive styling
      let originalBody = originalMessage.body?.content || '';
      originalBody = this.cleanHtmlContent(originalBody, true);
      
      // Format the thread header to match Outlook's style exactly
      emailBody += `
        <br><br>
        <hr style="border: none; border-top: 1px solid #E1E1E1; margin: 20px 0;">
        <div style="border: none; border-left: solid blue 1.5pt; padding: 0 0 0 4.0pt; margin-left: 0;">
          <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #000000;">
            <b>From:</b> ${originalSenderName} &lt;${originalSender}&gt;<br>
            <b>Sent:</b> ${formattedDate}<br>
            <b>To:</b> ${originalMessage.toRecipients?.map((r: any) => r.emailAddress?.address || r.address).join('; ') || 'Me'}<br>
            <b>Subject:</b> ${originalSubject}
          </div>
          <br>
          <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #000000;">
            ${originalBody}
          </div>
        </div>
      `;
    }
    
    return emailBody;
  }

  /**
   * Clean HTML content while preserving formatting
   */
  private cleanHtmlContent(htmlContent: string, preserveFormatting: boolean = false): string {
    if (!htmlContent) return '';
    
    if (preserveFormatting) {
      // Preserve formatting - only remove dangerous/excessive elements
      let cleaned = htmlContent
        // Remove potentially dangerous elements
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<style[^>]*>.*?<\/style>/gi, '')
        .replace(/<link[^>]*>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        
        // Clean up Microsoft-specific markup but keep basic formatting
        .replace(/<!--\[if[^>]*>.*?<!\[endif\]-->/gi, '')
        .replace(/<o:p[^>]*>.*?<\/o:p>/gi, '')
        .replace(/<v:[^>]*>.*?<\/v:[^>]*>/gi, '')
        .replace(/mso-[^;]*;?/gi, '')
        
        // Remove excessive inline styles but keep basic ones
        .replace(/style\s*=\s*"[^"]*?(font-family|color|background|text-align|font-size|font-weight)[^"]*"/gi, (match) => {
          // Keep only basic formatting styles
          const basicStyles = match.match(/(font-family|color|background-color|text-align|font-size|font-weight|margin|padding):[^;]*;?/gi);
          if (basicStyles) {
            return `style="${basicStyles.join(' ').trim()}"`;
          }
          return '';
        })
        
        // Remove empty style attributes
        .replace(/\s*style\s*=\s*["']?\s*["']?/gi, '')
        
        // Clean up excessive whitespace but preserve paragraph breaks
        .replace(/\s*\n\s*/g, ' ')
        .replace(/(<\/p>\s*<p[^>]*>)/gi, '</p><p>')
        .replace(/(<\/div>\s*<div[^>]*>)/gi, '</div><div>')
        
        // Ensure proper paragraph spacing
        .replace(/<p([^>]*)>\s*<\/p>/gi, '<br>') // Replace empty paragraphs with breaks
        .replace(/<div([^>]*)>\s*<\/div>/gi, '<br>'); // Replace empty divs with breaks
      
      return cleaned;
    } else {
      // Original behavior - strip all HTML for plain text
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
      
      if (cleaned.length > 2000) {
        cleaned = cleaned.substring(0, 2000) + '...<br><em>[Message truncated]</em>';
      }
      
      return cleaned;
    }
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
   * Get specific email details without marking as read
   */
  async getEmailDetails(messageId: string) {
    try {
      // Get email details
      const emailDetails = await this.client
        .api(`/me/messages/${messageId}`)
        .select('id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,conversationId,isRead')
        .get();

      // Immediately mark back as unread if it was originally unread
      // We need to do this right after reading to preserve notification state
      if (!emailDetails.isRead) {
        // Use a timeout to ensure the read operation completes first
        setTimeout(async () => {
          try {
            await this.client
              .api(`/me/messages/${messageId}`)
              .patch({
                isRead: false
              });
            console.log('📧 Successfully kept email unread for notifications');
          } catch (markError) {
            console.log('⚠️ Could not maintain unread status:', markError);
          }
        }, 500); // Wait 500ms then mark as unread
      }

      return emailDetails;
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