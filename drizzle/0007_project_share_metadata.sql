-- Project-scoped public/share metadata.
-- Customer branding is data, never a generic runtime default.

INSERT INTO settings (project_id, key, value, updated_at)
SELECT p.id, 'shareTitle', 'Shree Banashankari Nagara', datetime('now')
FROM projects p
WHERE p.slug = 'shree-banashankari-nagara'
  AND NOT EXISTS (
    SELECT 1 FROM settings s
    WHERE s.project_id = p.id AND s.key = 'shareTitle'
  );

INSERT INTO settings (project_id, key, value, updated_at)
SELECT p.id, 'shareDescription',
       'Premium residential plots at Huvinahadagali, Vijayanagara. RPK Builders & Developers.',
       datetime('now')
FROM projects p
WHERE p.slug = 'shree-banashankari-nagara'
  AND NOT EXISTS (
    SELECT 1 FROM settings s
    WHERE s.project_id = p.id AND s.key = 'shareDescription'
  );

INSERT INTO settings (project_id, key, value, updated_at)
SELECT p.id, 'shareImage', '/rpk-share-card.png', datetime('now')
FROM projects p
WHERE p.slug = 'shree-banashankari-nagara'
  AND NOT EXISTS (
    SELECT 1 FROM settings s
    WHERE s.project_id = p.id AND s.key = 'shareImage'
  );

INSERT INTO settings (project_id, key, value, updated_at)
SELECT p.id, 'phone1', '+91 95386 02461', datetime('now')
FROM projects p
WHERE p.slug = 'shree-banashankari-nagara'
  AND NOT EXISTS (
    SELECT 1 FROM settings s
    WHERE s.project_id = p.id AND s.key = 'phone1'
  );

INSERT INTO settings (project_id, key, value, updated_at)
SELECT p.id, 'whatsapp', '+91 95386 02461', datetime('now')
FROM projects p
WHERE p.slug = 'shree-banashankari-nagara'
  AND NOT EXISTS (
    SELECT 1 FROM settings s
    WHERE s.project_id = p.id AND s.key = 'whatsapp'
  );
