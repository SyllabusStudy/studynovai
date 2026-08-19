DELETE FROM public.user_roles r
USING auth.users u
WHERE u.id = r.user_id
  AND r.role = 'admin'
  AND lower(u.email) <> 'davidsawaqed21@gmail.com';