INSERT INTO public.user_roles (user_id, role)
VALUES ('8f0a6672-8d68-4aca-ac1b-e7d08abbfb35', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;