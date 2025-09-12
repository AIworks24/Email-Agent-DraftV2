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

  async getEmails(top: number = 50) {
    return await this.client
      .api('/me/messages')
      .top(top)
      .select('id,subject,from,toRecipients,body,receivedDateTime,conversationId')
      .orderby('receivedDateTime DESC')
      .get();
  }

  async subscribeToEmails(webhookUrl: string, clientState: string) {
  return await this.client
    .api('/subscriptions')
    .post({
      changeType: 'created',
      notificationUrl: webhookUrl,
      resource: '/me/messages',
      expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      clientState: clientState
    });
}

  async getCalendarEvents(startTime: string, endTime: string) {
    return await this.client
      .api('/me/calendar/events')
      .filter(`start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'`)
      .select('subject,start,end,showAs')
      .get();
  }

  async createDraftReply(messageId: string, replyContent: string, replyAll: boolean = false) {
    const endpoint = replyAll ? `/me/messages/${messageId}/replyAll` : `/me/messages/${messageId}/reply`;
    
    return await this.client
      .api(endpoint)
      .post({
        message: {
          body: {
            contentType: 'HTML',
            content: replyContent
          }
        }
      });
  }
}