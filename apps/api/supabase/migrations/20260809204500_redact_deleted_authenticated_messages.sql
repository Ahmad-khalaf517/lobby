begin;

update public.messages
set content = 'This message was deleted.'
where deleted_at is not null
  and content <> 'This message was deleted.';

commit;
