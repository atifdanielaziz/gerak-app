-- Use the UKM three-document requirement for every supported university
-- except UMPSA, whose existing four-document form remains unchanged.
delete from public.jubah_doc_fields
where university_key in ('uitm', 'umk', 'ukm', 'uiam', 'uum');

insert into public.jubah_doc_fields
  (university_key, field_key, label, hint, position)
select
  university_key,
  field_key,
  label,
  hint,
  position
from unnest(array['uitm', 'umk', 'ukm', 'uiam', 'uum']) as university_key
cross join (values
  ('konvo', 'Pengesahan Slip Kehadiran Konvokesyen', null::text, 1),
  ('skpg',  'SKPG',                                  null::text, 2),
  ('ic',    'IC (Front & Back)',                      'Accepts PDF or image (JPG/PNG)', 3)
) as document(field_key, label, hint, position);
