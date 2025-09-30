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
      
      // First, get the original message to understand the thread AND capture its read status
      const originalMessage = await this.getEmailDetailsPreservingNotifications(messageId);
      console.log('Original message subject:', originalMessage?.subject);
      
      // 🔍 CRITICAL: Capture the original read status BEFORE creating draft
      const wasOriginallyRead = originalMessage?.isRead;
      console.log('📧 Original email read status:', wasOriginallyRead);
      
      // Create the reply draft using Microsoft Graph
      const endpoint = replyAll 
        ? `/me/messages/${messageId}/createReplyAll` 
        : `/me/messages/${messageId}/createReply`;
      
      const draft = await this.client
        .api(endpoint)
        .post({});

      console.log('Draft created with ID:', draft.id);

      // 🚨 CRITICAL FIX: Microsoft Graph marks original email as read when creating reply
      // We need to restore the original read status to preserve notifications
      if (!wasOriginallyRead) {
        console.log('📧 Restoring original email to unread status for notifications...');
        
        try {
          await this.client
            .api(`/me/messages/${messageId}`)
            .patch({
              isRead: false
            });
          
          console.log('✅ Original email marked back as unread - notifications preserved');
        } catch (unreadError) {
          console.error('❌ Failed to restore unread status:', unreadError);
          // Don't throw - draft was created successfully
        }
      } else {
        console.log('📧 Original email was already read - no status change needed');
      }

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

      console.log('✅ Draft created successfully with notifications preserved');
      return {
      ...updatedDraft,
      draftId: draft.id, // Make sure we include the draft ID
      originalMessageId: messageId
    };
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
      // ENHANCED: Better formatting preservation
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
        
        // IMPROVED: Remove excessive Microsoft styles but keep essential formatting
        .replace(/style\s*=\s*"[^"]*"/gi, (match) => {
          // Keep only essential formatting styles
          const essentialStyles = match.match(/(font-family|font-size|font-weight|color|background-color|text-align|margin|padding|border):[^;]*;?/gi);
          if (essentialStyles && essentialStyles.length > 0) {
            return `style="${essentialStyles.join(' ').trim()}"`;
          }
          return '';
        })
        
        // Remove empty style attributes
        .replace(/\s*style\s*=\s*["']?\s*["']?/gi, '')
        
        // PRESERVE: Keep paragraph and div structure
        .replace(/\s*\n\s*/g, ' ') // Clean line breaks but keep structure
        
        // PRESERVE: Maintain email structure elements
        .replace(/<div([^>]*)>\s*<\/div>/gi, '<br>') // Empty divs become breaks
        .replace(/<p([^>]*)>\s*<\/p>/gi, '<br>')     // Empty paragraphs become breaks
        
        // ENHANCE: Better spacing for readability
        .replace(/(<\/p>\s*<p[^>]*>)/gi, '</p><br><p>') // Add breaks between paragraphs
        .replace(/(<\/div>\s*<div[^>]*>)/gi, '</div><br><div>'); // Add breaks between divs
      
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
      
      if (cleaned.length > 3000) {
        cleaned = cleaned.substring(0, 3000) + '...<br><em>[Message truncated]</em>';
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
   * Subscribe to email deletion notifications
   * This creates a separate subscription specifically for delete events
   */
  async subscribeToEmailDeletions(webhookUrl: string, clientState: string) {
    try {
      console.log('🗑️ Creating email deletion webhook subscription...');
      
      // Create subscription specifically for deleted events in Inbox
      const subscription = {
        changeType: 'deleted', // ONLY deleted events
        notificationUrl: webhookUrl,
        resource: "/me/mailFolders('Inbox')/messages", // Same resource as create subscription
        expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        clientState: `${clientState}-delete`, // Distinguish from create subscription
        includeResourceData: false
      };

      console.log('🗑️ Delete subscription configured:', {
        resource: subscription.resource,
        changeType: subscription.changeType,
        clientState: subscription.clientState
      });

      const result = await this.client
        .api('/subscriptions')
        .post(subscription);

      console.log('✅ Email deletion webhook subscription created:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Error creating deletion subscription:', error);
      throw error;
    }
  }

  /**
   * Get calendar events with timezone conversion
   */
  async getCalendarEvents(startTime: string, endTime: string) {
    try {
      console.log('📅 [GraphService] getCalendarEvents called');
      console.log('   Start:', startTime);
      console.log('   End:', endTime);

      // Get user's timezone first
      console.log('📅 [GraphService] Fetching user mailbox settings...');
      const profile = await this.client
        .api('/me/mailboxSettings')
        .get();
      
      const userTimezone = profile.timeZone || 'UTC';
      console.log('📅 [GraphService] User timezone:', userTimezone);
      
      // Build the query
      const query = this.client
        .api('/me/events')
        .filter(`start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'`)
        .select('subject,start,end,location,attendees,isAllDay,showAs')
        .header('Prefer', `outlook.timezone="${userTimezone}"`)
        .orderby('start/dateTime')
        .top(50); // Limit to 50 events
      
      console.log('📅 [GraphService] Executing calendar query...');
      const events = await query.get();

      console.log('📅 [GraphService] Calendar API response:', {
        hasValue: !!events?.value,
        valueType: typeof events?.value,
        isArray: Array.isArray(events?.value),
        count: events?.value?.length || 0,
        responseKeys: Object.keys(events || {})
      });

      if (events?.value && events.value.length > 0) {
        console.log('📅 [GraphService] Events found:', events.value.length);
        events.value.forEach((event: any, i: number) => {
          console.log(`   Event ${i + 1}:`, {
            subject: event.subject,
            start: event.start?.dateTime,
            end: event.end?.dateTime
          });
        });
      } else {
        console.log('📅 [GraphService] No events found in response');
      }

      return events;
    } catch (error: any) {
      console.error('❌ [GraphService] getCalendarEvents ERROR:');
      console.error('   Message:', error.message);
      console.error('   Code:', error.code);
      console.error('   Status:', error.statusCode);
      console.error('   Full error:', error);
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
  async deleteSpecificSubscription(subscriptionId: string): Promise<void> {
  try {
    console.log(`🗑️ Deleting subscription: ${subscriptionId}`);
    
    await this.client
      .api(`/subscriptions/${subscriptionId}`)
      .delete();
    
    console.log(`✅ Successfully deleted subscription: ${subscriptionId}`);
  } catch (error) {
    console.error(`❌ Failed to delete subscription ${subscriptionId}:`, error);
    throw error;
  }
}

/**
 * 🗑️ Delete all subscriptions with broad resource paths
 */
async deleteAllBadSubscriptions(): Promise<{ deletedCount: number; errors: any[] }> {
  try {
    console.log('🗑️ Deleting all bad subscriptions...');
    
    // Get all subscriptions
    const allSubs = await this.client.api('/subscriptions').get();
    
    let deletedCount = 0;
    let errors = [];
    
    for (const sub of allSubs.value || []) {
      // Delete if resource is too broad
      if (sub.resource === '/me/messages' || sub.resource === 'me/messages') {
        try {
          await this.client.api(`/subscriptions/${sub.id}`).delete();
          console.log(`✅ Deleted bad subscription: ${sub.id}`);
          deletedCount++;
        } catch (err: any) {
          console.error(`❌ Failed to delete ${sub.id}:`, err);
          errors.push({ id: sub.id, error: err.message });
        }
      }
    }
    
    return { deletedCount, errors };
  } catch (error) {
    console.error('❌ Bulk deletion failed:', error);
    throw error;
  }
}
  /**
 * Delete a specific draft message
 */
async deleteDraft(draftMessageId: string): Promise<void> {
  try {
    console.log('🗑️ Deleting AI-generated draft:', draftMessageId);
    
    // First check if the draft still exists
    try {
      await this.client
        .api(`/me/messages/${draftMessageId}`)
        .select('id,isDraft')
        .get();
    } catch (checkError: any) {
      if (checkError.code === 'ItemNotFound' || checkError.status === 404) {
        console.log('⏭️ Draft already deleted or not found:', draftMessageId);
        return; // Draft doesn't exist, consider it successful
      }
      throw checkError; // Re-throw if it's a different error
    }

    // Delete the draft
    await this.client
      .api(`/me/messages/${draftMessageId}`)
      .delete();

    console.log('✅ AI draft deleted successfully:', draftMessageId);
  } catch (error) {
    console.error('❌ Error deleting draft:', error);
    throw error;
  }
}

/**
 * Check if a message is a draft
 */
async isDraftMessage(messageId: string): Promise<boolean> {
  try {
    const message = await this.client
      .api(`/me/messages/${messageId}`)
      .select('isDraft')
      .get();
    
    return message.isDraft === true;
  } catch (error) {
    console.error('Error checking if message is draft:', error);
    return false;
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