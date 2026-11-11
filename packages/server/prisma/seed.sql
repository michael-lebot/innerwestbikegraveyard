-- Development and end-to-end seed: 14 live tags (7 Lime, 4 Hello, 3 Ario) at real points inside the council, each
-- checked against the NSW boundary and road data. Times are relative to now(), with 2 to 46 hours left.
WITH seeded AS (
  INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, created_at, last_confirmed_at, expires_at)
  SELECT id::uuid, lat, lng, suburb, street, operator, problem::problem,
         now() - (48 - hours_left) * interval '1 hour',
         now() - (48 - hours_left) * interval '1 hour',
         now() + hours_left * interval '1 hour'
  FROM (VALUES
    ('5eed0000-0000-4000-8000-000000000001', -33.882425, 151.156888, 'Leichhardt',   'Norton St',       'lime',  'knocked_over',      22),
    ('5eed0000-0000-4000-8000-000000000002', -33.883891, 151.155464, 'Leichhardt',   'Marion St',       'ario',  'in_park',            9),
    ('5eed0000-0000-4000-8000-000000000003', -33.904497, 151.171932, 'Marrickville', 'Llewellyn St',    'lime',  'blocking_footpath', 40),
    ('5eed0000-0000-4000-8000-000000000004', -33.910987, 151.155915, 'Marrickville', 'Illawarra Rd',    'hello', 'knocked_over',      12),
    ('5eed0000-0000-4000-8000-000000000005', -33.913282, 151.166818, 'Marrickville', 'Sydenham Rd',     'ario',  'blocking_ramp',     44),
    ('5eed0000-0000-4000-8000-000000000006', -33.895472, 151.177079, 'Newtown',      'Denison St',      'lime',  'blocking_footpath', 31),
    ('5eed0000-0000-4000-8000-000000000007', -33.896628, 151.179598, 'Newtown',      'King St',         'hello', 'damaged',            6),
    ('5eed0000-0000-4000-8000-000000000008', -33.856964, 151.179932, 'Balmain',      'Darling St',      'lime',  'blocking_footpath', 18),
    ('5eed0000-0000-4000-8000-000000000009', -33.888925, 151.125029, 'Ashfield',     'Liverpool Rd',    'hello', 'blocking_footpath',  2),
    ('5eed0000-0000-4000-8000-000000000010', -33.903371, 151.142424, 'Dulwich Hill', 'Marrickville Rd', 'lime',  'knocked_over',      27),
    ('5eed0000-0000-4000-8000-000000000011', -33.898846, 151.173494, 'Enmore',       'Enmore Rd',       'hello', 'blocking_ramp',     35),
    ('5eed0000-0000-4000-8000-000000000012', -33.893412, 151.164312, 'Stanmore',     'Percival Rd',     'lime',  'damaged',           15),
    ('5eed0000-0000-4000-8000-000000000013', -33.864194, 151.170417, 'Rozelle',      'Victoria Rd',     'lime',  'blocking_footpath', 25),
    ('5eed0000-0000-4000-8000-000000000014', -33.891779, 151.137647, 'Summer Hill',  'Smith St',        'ario',  'blocking_footpath', 46)
  ) AS seed (id, lat, lng, suburb, street, operator, problem, hours_left)
RETURNING id, created_at
)
-- Each tag gets its created event; a create's request_id is the tag's own id (plan §1.4).
INSERT INTO tag_events (tag_id, type, at, request_id)
SELECT id, 'created', created_at, id FROM seeded;
