import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TeacherStudioConversation, TeacherStudioMessage } from '../../lib/client';

type InboxViewProps = {
  busy: boolean;
  conversations: TeacherStudioConversation[];
  selectedConversationId: string;
  messages: TeacherStudioMessage[];
  messageDraft: string;
  setMessageDraft: Dispatch<SetStateAction<string>>;
  onSelectConversation: (conversationId: string) => Promise<void>;
  onSendMessage: (e: FormEvent) => Promise<void>;
  formatDate: (iso: string | null | undefined) => string;
};

export const InboxView = ({
  busy,
  conversations,
  selectedConversationId,
  messages,
  messageDraft,
  setMessageDraft,
  onSelectConversation,
  onSendMessage,
  formatDate,
}: InboxViewProps) => {
  return (
    <section className="grid two">
      <div className="panel">
        <h3>Conversations</h3>
        <div className="chat-list">
          {conversations.map((item) => {
            const contactName = item.contact
              ? `${item.contact.first_name} ${item.contact.last_name}`.trim() || item.contact.email || item.contact.id
              : item.contact_id;
            const preview = item.last_message?.content ? item.last_message.content.slice(0, 90) : 'No messages yet.';
            return (
              <button
                key={item.id}
                type="button"
                className={`chat-list-item ${selectedConversationId === item.id ? 'is-active' : ''}`}
                onClick={() => void onSelectConversation(item.id)}
              >
                <strong>{contactName}</strong>
                <span className="small muted">{preview}</span>
                <span className="small muted">{formatDate(item.updated_at)}</span>
              </button>
            );
          })}
          {conversations.length === 0 ? <div className="small muted">No conversations yet.</div> : null}
        </div>
      </div>

      <div className="panel">
        <h3>Messages</h3>
        <div className="chat-thread">
          {messages.map((message) => (
            <div key={message.id} className={`chat-row chat-row--${message.sender_type}`}>
              <div className="small muted">{message.sender_type}</div>
              <div>{message.content}</div>
              <div className="small muted">{formatDate(message.created_at)}</div>
            </div>
          ))}
          {messages.length === 0 ? <div className="small muted">Select a conversation to read messages.</div> : null}
        </div>

        <form className="chat-compose" onSubmit={onSendMessage}>
          <textarea
            className="input"
            placeholder="Write a message..."
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            disabled={!selectedConversationId || busy}
            required
          />
          <button className="primary-btn" type="submit" disabled={!selectedConversationId || busy || !messageDraft.trim()}>
            Send message
          </button>
        </form>
      </div>
    </section>
  );
};
