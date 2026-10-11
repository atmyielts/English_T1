import { translate } from '../../i18n';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TeacherStudioConversation, TeacherStudioMessage } from '../../lib/client';

type InboxViewProps = {
  busy: boolean;
  loading: boolean;
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
  loading,
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
        <h3>{translate("Conversations")}</h3>
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
                aria-pressed={selectedConversationId === item.id}
                disabled={busy}
                onClick={() => void onSelectConversation(item.id)}
              >
                <strong>{contactName}</strong>
                <span className="small muted">{preview}</span>
                <span className="small muted">{formatDate(item.updated_at)}</span>
              </button>
            );
          })}
          {conversations.length === 0 ? <div className="table-empty-state"><strong>{translate("No conversations yet")}</strong><span>{translate("Student and contact replies will appear here.")}</span></div> : null}
        </div>
      </div>

      <div className="panel">
        <h3>{translate("Messages")}</h3>
        <div className="chat-thread" aria-busy={loading}>
          {messages.map((message) => (
            <div key={message.id} className={`chat-row chat-row--${message.sender_type}`}>
              <div className="small muted">{message.sender_type}</div>
              <div>{message.content}</div>
              <div className="small muted">{formatDate(message.created_at)}</div>
            </div>
          ))}
          {loading ? <div role="status" className="table-empty-state">{translate('Updating {section}', { section: translate('Messages') })}</div> : messages.length === 0 ? <div className="table-empty-state"><strong>{selectedConversationId ? 'No messages in this conversation' : 'Select a conversation'}</strong><span>{selectedConversationId ? 'Send the first message below.' : 'Choose a contact from the list to read or reply.'}</span></div> : null}
        </div>

        <form className="chat-compose" onSubmit={onSendMessage}>
          <label><span className="sr-only">{translate("Message")}</span><textarea
              className="input"
              placeholder={translate("Write a message…")}
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              disabled={!selectedConversationId || busy || loading}
              required
            /></label>
          <button className="primary-btn" type="submit" disabled={!selectedConversationId || busy || loading || !messageDraft.trim()}>
            {translate("Send message")}{' '}</button>
        </form>
      </div>
    </section>
  );
};
