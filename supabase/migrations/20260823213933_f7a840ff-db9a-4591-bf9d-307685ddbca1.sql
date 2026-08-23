UPDATE public.calendar_events ce
SET assignment_id = a.id
FROM public.assignments a
WHERE ce.assignment_id IS NULL
  AND ce.event_type = 'assignment'
  AND a.user_id = ce.user_id
  AND ce.title = 'Due: ' || a.title;