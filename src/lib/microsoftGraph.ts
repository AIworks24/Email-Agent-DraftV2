// Fixed: src/lib/microsoftGraph.ts - Ensure proper reply threading
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
   * Create a draft reply to an email with proper threading
   */
  async createDraftReply(messageId: string, replyContent: string, replyAll: boolean = false) {
    try {
      console.log('Creating threaded draft reply for message:', messageId);
      
      // First, create the reply draft using Microsoft Graph
      const endpoint = replyAll 
        ? `/me/messages/${messageId}/createReplyAll` 
        : `/me/messages/${messageId}/createReply`;
      
      const draft = await this.client
        .api(endpoint)
        .post({});

      console.log('Draft created with ID:', draft.id);

      // Update the draft with our AI-generated content
      const updatedDraft = await this.client
        .api(`/me/messages/${draft.id}`)
        .patch({
          body: {
            contentType: 'HTML',
            content: replyContent
          }
        });

      console.log('Draft updated with AI content');
      return updatedDraft;
    } catch (error) {
      console.error('Error creating draft reply:', error);
      throw error;
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
}