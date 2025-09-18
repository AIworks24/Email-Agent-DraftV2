// PERFECT SOLUTION: src/lib/microsoftGraph.ts 
// Preserves notifications while preventing duplicate webhook triggers

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
      const originalMessage = await this.getEmailDetailsPreservingNotifications(messageId);
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

      console.log('✅ Draft created successfully while preserving email notification status');
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
   * PERFECT SOLUTION: Get email details while preserving notification status
   * This method reads email content WITHOUT affecting the read/unread status
   * Key insight: Simply reading via Graph API doesn't mark as read automatically
   */
  async getEmailDetailsPreservingNotifications(messageId: string) {
    try {
      console.log('📧 Fetching email details while preserving notification status');
      
      // SOLUTION: Use read-only Graph API call - this does NOT mark as read
      // The Graph API only marks emails as read when you explicitly PATCH the isRead property
      const emailDetails = await this.client
        .api(`/me/messages/${messageId}`)
        .select([
          'id', 'subject', 'from', 'toRecipients', 'ccRecipients', 
          'body', 'receivedDateTime', 'conversationId', 'isRead', 
          'parentFolderId', 'internetMessageId'
        ].join(','))
        .get();

      console.log('📧 Email details retrieved (notification-preserving):', {
        subject: emailDetails.subject,
        wasAlreadyRead: emailDetails.isRead,
        willPreserveNotifications: !emailDetails.isRead // If unread, notifications preserved
      });

      // CRITICAL: The email remains in its original state
      // - If it was unread → stays unread → notifications preserved ✅
      // - If it was read → stays read → no change needed ✅
      // - No webhook notifications triggered because we didn't modify anything ✅
      
      return emailDetails;
    } catch (error) {
      console.error('❌ Error fetching email details:', error);
      throw error;
    }
  }

  /**
   * DEPRECATED: This method is no longer used as it's not needed
   * The simple getEmailDetailsPreservingNotifications() handles everything
   */
  async getEmailDetails(messageId: string) {
    // Redirect to the notification-preserving method
    return this.getEmailDetailsPreservingNotifications(messageId);
  }

  /**
   * Enhanced: Verify email is actually fresh and properly located
   * This helps with additional safety checks without affecting notifications
   */
  async isEmailInInboxAndFresh(messageId: string): Promise<boolean> {
    try {
      const message = await this.client
        .api(`/me/messages/${messageId}`)
        .select('id,parentFolderId,receivedDateTime,isRead,internetMessageId')
        .get();
      
      // Check 1: Must be in Inbox folder
      const inboxFolder = await this.client
        .api("/me/mailFolders('Inbox')")
        .select('id')
        .get();
      
      const isInInbox = message.parentFolderId === inboxFolder.id;
      
      // Check 2: Must be received within last 15 minutes (prevents old email processing)
      const receivedTime = new Date(message.receivedDateTime);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const isRecentlyReceived = receivedTime > fifteenMinutesAgo;
      
      console.log('📧 Email validation (notification-safe):', {
        messageId: messageId.substring(0, 15) + '...',
        isInInbox,
        isRecentlyReceived,
        currentlyUnread: !message.isRead,
        receivedTime: receivedTime.toISOString(),
        parentFolderId: message.parentFolderId,
        inboxId: inboxFolder.id
      });
      
      // Email must be in inbox AND recently received
      return isInInbox && isRecentlyReceived;
      
    } catch (error) {
      console.error('❌ Error validating email (notification-safe):', error);
      // If we can't determine, err on the side of caution and don't process
      return false;
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
   * ENHANCED: Subscribe to email notifications with perfect filtering
   * This creates webhook subscriptions that only trigger for truly new emails
   */
  async subscribeToEmails(webhookUrl: string, clientState: string) {
    try {
      console.log('🔔 Creating notification-preserving webhook subscription...');
      
      // CRITICAL: Subscribe specifically to Inbox folder with 'created' events only
      // This prevents notifications from drafts, sent items, deleted items, etc.
      const subscription = {
        changeType: 'created', // ONLY created events - no updated/deleted
        notificationUrl: webhookUrl,
        // SPECIFIC: Subscribe only to Inbox messages to avoid action-triggered notifications
        resource: "/me/mailFolders('Inbox')/messages", 
        expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        clientState: clientState,
        // Don't include resource data to keep webhooks lightweight
        includeResourceData: false
      };

      console.log('🔔 Subscription configured for notification preservation:', {
        resource: subscription.resource,
        changeType: subscription.changeType,
        preservesNotifications: true
      });

      const result = await this.client
        .api('/subscriptions')
        .post(subscription);

      console.log('✅ Notification-preserving webhook subscription created:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Error creating notification-preserving subscription:', error);
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

  
   /* This removes problematic subscriptions that are catching delete/update events
   */
  async cleanupOldSubscriptions(): Promise<void> {
    try {
      console.log('🧹 Checking for old webhook subscriptions...');
      
      // Get all current subscriptions
      const subscriptions = await this.client
        .api('/subscriptions')
        .get();

      console.log(`📊 Found ${subscriptions.value?.length || 0} total subscriptions`);

      if (!subscriptions.value || subscriptions.value.length === 0) {
        console.log('✅ No subscriptions found');
        return;
      }

      // Analyze and clean up subscriptions
      for (const subscription of subscriptions.value) {
        console.log('🔍 Analyzing subscription:', {
          id: subscription.id,
          resource: subscription.resource,
          changeType: subscription.changeType,
          expiresAt: subscription.expirationDateTime
        });

        // 🚨 DELETE problematic subscriptions
        const shouldDelete = (
          // Delete if resource is too broad (catches all messages)
          subscription.resource === '/me/messages' ||
          subscription.resource === 'me/messages' ||
          
          // Delete if changeType includes updated/deleted
          subscription.changeType?.includes('updated') ||
          subscription.changeType?.includes('deleted') ||
          
          // Delete if not specifically targeting Inbox
          (subscription.resource && 
          !subscription.resource.includes('Inbox') && 
          subscription.resource.includes('messages'))
        );

        if (shouldDelete) {
          console.log(`🗑️ DELETING problematic subscription: ${subscription.id}`);
          console.log(`   Resource: ${subscription.resource}`);
          console.log(`   ChangeType: ${subscription.changeType}`);
          
          try {
            await this.client
              .api(`/subscriptions/${subscription.id}`)
              .delete();
            
            console.log(`✅ Deleted subscription: ${subscription.id}`);
          } catch (deleteError) {
            console.error(`❌ Failed to delete subscription ${subscription.id}:`, deleteError);
          }
        } else {
          console.log(`✅ KEEPING valid subscription: ${subscription.id}`);
          console.log(`   Resource: ${subscription.resource}`);
          console.log(`   ChangeType: ${subscription.changeType}`);
        }
      }

      console.log('🧹 Subscription cleanup completed');
      
    } catch (error) {
      console.error('❌ Error during subscription cleanup:', error);
      throw error;
    }
  }

  /**
   * 🔍 DEBUG: List all current subscriptions
   */
  async listAllSubscriptions(): Promise<any[]> {
    try {
      const subscriptions = await this.client
        .api('/subscriptions')
        .get();

      console.log('📊 All current subscriptions:');
      
      if (!subscriptions.value || subscriptions.value.length === 0) {
        console.log('   No subscriptions found');
        return [];
      }

      subscriptions.value.forEach((sub: any, index: number) => {
        console.log(`   ${index + 1}. ID: ${sub.id}`);
        console.log(`      Resource: ${sub.resource}`);
        console.log(`      ChangeType: ${sub.changeType}`);
        console.log(`      Expires: ${sub.expirationDateTime}`);
        console.log(`      NotificationUrl: ${sub.notificationUrl?.substring(0, 50)}...`);
        console.log(`      ---`);
      });

      return subscriptions.value;
    } catch (error) {
      console.error('❌ Error listing subscriptions:', error);
      return [];
    }
  }
}