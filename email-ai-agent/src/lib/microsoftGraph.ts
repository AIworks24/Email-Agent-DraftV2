// lib/microsoftGraph.ts
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
   * Get calendar events for availability checking
   */
  async getCalendarEvents(startTime: string, endTime: string) {
    try {
      return await this.client
        .api('/me/calendar/events')
        .filter(`start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'`)
        .select('subject,start,end,showAs,location')
        .orderby('start/dateTime')
        .get();
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Get user's free/busy information
   */
  async getFreeBusy(startTime: string, endTime: string) {
    try {
      const requestBody = {
        schedules: ['me'],
        startTime: {
          dateTime: startTime,
          timeZone: 'UTC'
        },
        endTime: {
          dateTime: endTime,
          timeZone: 'UTC'
        },
        availabilityViewInterval: 60 // 60-minute intervals
      };

      return await this.client
        .api('/me/calendar/getSchedule')
        .post(requestBody);
    } catch (error) {
      console.error('Error fetching free/busy information:', error);
      throw error;
    }
  }

  /**
   * Create a draft reply to an email
   */
  async createDraftReply(messageId: string, replyContent: string, replyAll: boolean = false) {
    try {
      const endpoint = replyAll ? `/me/messages/${messageId}/replyAll` : `/me/messages/${messageId}/reply`;
      
      const replyData = {
        message: {
          body: {
            contentType: 'HTML',
            content: replyContent
          }
        }
      };

      return await this.client
        .api(endpoint)
        .post(replyData);
    } catch (error) {
      console.error('Error creating draft reply:', error);
      throw error;
    }
  }

  /**
   * Send a reply to an email
   */
  async sendReply(messageId: string, replyContent: string, replyAll: boolean = false) {
    try {
      const endpoint = replyAll ? `/me/messages/${messageId}/replyAll` : `/me/messages/${messageId}/reply`;
      
      const replyData = {
        message: {
          body: {
            contentType: 'HTML',
            content: replyContent
          }
        }
      };

      return await this.client
        .api(endpoint)
        .post(replyData);
    } catch (error) {
      console.error('Error sending reply:', error);
      throw error;
    }
  }

  /**
   * Create and send a new email
   */
  async sendEmail(toRecipients: string[], subject: string, body: string, ccRecipients?: string[]) {
    try {
      const message = {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: body
        },
        toRecipients: toRecipients.map(email => ({
          emailAddress: {
            address: email
          }
        })),
        ccRecipients: ccRecipients?.map(email => ({
          emailAddress: {
            address: email
          }
        })) || []
      };

      return await this.client
        .api('/me/sendMail')
        .post({ message });
    } catch (error) {
      console.error('Error sending email:', error);
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
   * Mark email as read
   */
  async markAsRead(messageId: string) {
    try {
      return await this.client
        .api(`/me/messages/${messageId}`)
        .patch({
          isRead: true
        });
    } catch (error) {
      console.error('Error marking email as read:', error);
      throw error;
    }
  }

  /**
   * Move email to a folder
   */
  async moveToFolder(messageId: string, folderId: string) {
    try {
      return await this.client
        .api(`/me/messages/${messageId}/move`)
        .post({
          destinationId: folderId
        });
    } catch (error) {
      console.error('Error moving email to folder:', error);
      throw error;
    }
  }

  /**
   * Get mail folders
   */
  async getMailFolders() {
    try {
      return await this.client
        .api('/me/mailFolders')
        .select('id,displayName,parentFolderId,childFolderCount')
        .get();
    } catch (error) {
      console.error('Error fetching mail folders:', error);
      throw error;
    }
  }

  /**
   * Create a new mail folder
   */
  async createMailFolder(displayName: string, parentFolderId?: string) {
    try {
      const folderData = {
        displayName: displayName
      };

      const endpoint = parentFolderId 
        ? `/me/mailFolders/${parentFolderId}/childFolders`
        : '/me/mailFolders';

      return await this.client
        .api(endpoint)
        .post(folderData);
    } catch (error) {
      console.error('Error creating mail folder:', error);
      throw error;
    }
  }

  /**
   * Search emails
   */
  async searchEmails(query: string, top: number = 25) {
    try {
      return await this.client
        .api('/me/messages')
        .filter(`contains(subject,'${query}') or contains(body/content,'${query}')`)
        .top(top)
        .select('id,subject,from,receivedDateTime,isRead')
        .orderby('receivedDateTime DESC')
        .get();
    } catch (error) {
      console.error('Error searching emails:', error);
      throw error;
    }
  }

  /**
   * Get conversation thread
   */
  async getConversation(conversationId: string) {
    try {
      return await this.client
        .api(`/me/conversations/${conversationId}`)
        .expand('threads($expand=posts)')
        .get();
    } catch (error) {
      console.error('Error fetching conversation:', error);
      throw error;
    }
  }
}