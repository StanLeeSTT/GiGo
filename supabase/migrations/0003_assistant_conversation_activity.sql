-- Keep conversation recency aligned with its newest message.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.assistant_conversations
  set updated_at = now()
  where id = new.conversation_id
    and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists assistant_messages_touch_conversation on public.assistant_messages;
create trigger assistant_messages_touch_conversation
after insert on public.assistant_messages
for each row execute function public.touch_conversation_on_message();

create index if not exists assistant_messages_user_created_idx
  on public.assistant_messages(user_id, created_at desc);
