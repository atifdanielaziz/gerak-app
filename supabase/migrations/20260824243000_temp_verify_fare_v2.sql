drop function if exists public.diag_check_existing_fares();
create or replace function public.diag_check_existing_fares()
returns table(id uuid, status text, book_mode text, pickup text, destination text, campus text, aerbus_point text, fare text, night_charge int, "time" text, would_fail text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select o.id, o.status, o.book_mode, o.pickup, o.destination, o.campus, o.aerbus_point, o.fare, o.night_charge, o.time,
    case
      when o.book_mode in ('custom','map') and o.fare <> 'TBC' then 'custom/map fare not TBC'
      when o.book_mode = 'quick' and o.fare <> coalesce((
        select r.fare::text from (values
          ('DHUAM','UMP Pekan / Fakulti',10),('DHUAM','Gigi Coffee / Eco Shop',7),('DHUAM','Tealive / MyMama',7),
          ('DHUAM','Bandar Pekan',12),('UMP Pekan / Fakulti','DHUAM',10),('UMP Pekan / Fakulti','Anywhere inside UMP',5),
          ('UMP Pekan / Fakulti','Kuantan',50),('UMP Pekan / Fakulti','UMP Gambang',55),('UMP Pekan / Fakulti','Terminal Bas Pekan',15),
          ('UMP Pekan / Fakulti','TMG Mart Peramu',12),('UMP Pekan / Fakulti','MR DIY / ECO Peramu',13),('UMP Pekan / Fakulti','McDonald''s',7),
          ('UMP Pekan / Fakulti','Bowling Pekan',7),('UMP Pekan / Fakulti','Pantai Selamat',10),('UMP Pekan / Fakulti','Kawasan Mentiga',10),
          ('UMP Pekan / Fakulti','Pantai Lagenda',8),('UMP Pekan / Fakulti','Taman Beruas Jaya',7),('Taman Beruas','Bandar Pekan',18),
          ('UMP Gambang','Anywhere inside UMP',5),('UMP Gambang','Court Prima (KK4)',5),('UMP Gambang','7E / Petron / Baroqah Laundry',6),
          ('UMP Gambang','Bus Stop UMP',6),('UMP Gambang','Pasar Malam / Caltex / TMG / Tasik Paya Besar',7),('UMP Gambang','Taman Prima',7),
          ('UMP Gambang','Marrybrown',7),('UMP Gambang','Suraya',8),('UMP Gambang','Gambang Jaya',8),('UMP Gambang','Mr. DIY',9),
          ('UMP Gambang','Gambang Damai',15),('UMP Gambang','Jaya Gading',15),('UMP Gambang','Taman Tas',18),
          ('UMP Gambang','McDonald''s Sg. Isap',24),('UMP Gambang','Air Terjun Pandan',27),('UMP Gambang','ECM / KCM',32),
          ('UMP Gambang','Pantai Kempadang',34),('UMP Gambang','IM (IIUM Kuantan)',35),('UMP Gambang','Teluk Cempedak',35),
          ('UMP Gambang','Pantai Sepat',42),('UMP Gambang','Pantai Balok',45),('UMP Gambang','Pekan',60),
          ('CFS IIUM Gambang','Bus Stop UMP',11),('CFS IIUM Gambang','Taman Tas',22),('CFS IIUM Gambang','IIUM Kuantan',37),
          ('CFS IIUM Gambang','ECM / KCM',37),('CFS IIUM Gambang','Teluk Cempedak',39)
        ) as r(from_pt, to_pt, fare) where r.from_pt = o.pickup and r.to_pt = o.destination
      ), '__NO_MATCH__') then 'quick fare mismatch or no route match'
      when o.book_mode = 'aerbus' and o.fare <> 'TBC' and o.fare <> coalesce((
        select a.fare::text from (values
          ('Pekan','airport',40),('Pekan','tsk',45),('Pekan','pekan_bus',15),
          ('Gambang','airport',18),('Gambang','tsk',28)
        ) as a(campus_label, point_id, fare) where a.campus_label = o.campus and a.point_id = o.aerbus_point
      ), '__NO_MATCH__') then 'aerbus fare mismatch or no point match'
      when o.book_mode not in ('quick','custom','map','aerbus') then 'unrecognised book_mode'
      else null
    end as would_fail
  from public.ride_orders o
  where (
    case
      when o.book_mode in ('custom','map') and o.fare <> 'TBC' then true
      when o.book_mode = 'quick' and o.fare <> coalesce((
        select r.fare::text from (values
          ('DHUAM','UMP Pekan / Fakulti',10),('DHUAM','Gigi Coffee / Eco Shop',7),('DHUAM','Tealive / MyMama',7),
          ('DHUAM','Bandar Pekan',12),('UMP Pekan / Fakulti','DHUAM',10),('UMP Pekan / Fakulti','Anywhere inside UMP',5),
          ('UMP Pekan / Fakulti','Kuantan',50),('UMP Pekan / Fakulti','UMP Gambang',55),('UMP Pekan / Fakulti','Terminal Bas Pekan',15),
          ('UMP Pekan / Fakulti','TMG Mart Peramu',12),('UMP Pekan / Fakulti','MR DIY / ECO Peramu',13),('UMP Pekan / Fakulti','McDonald''s',7),
          ('UMP Pekan / Fakulti','Bowling Pekan',7),('UMP Pekan / Fakulti','Pantai Selamat',10),('UMP Pekan / Fakulti','Kawasan Mentiga',10),
          ('UMP Pekan / Fakulti','Pantai Lagenda',8),('UMP Pekan / Fakulti','Taman Beruas Jaya',7),('Taman Beruas','Bandar Pekan',18),
          ('UMP Gambang','Anywhere inside UMP',5),('UMP Gambang','Court Prima (KK4)',5),('UMP Gambang','7E / Petron / Baroqah Laundry',6),
          ('UMP Gambang','Bus Stop UMP',6),('UMP Gambang','Pasar Malam / Caltex / TMG / Tasik Paya Besar',7),('UMP Gambang','Taman Prima',7),
          ('UMP Gambang','Marrybrown',7),('UMP Gambang','Suraya',8),('UMP Gambang','Gambang Jaya',8),('UMP Gambang','Mr. DIY',9),
          ('UMP Gambang','Gambang Damai',15),('UMP Gambang','Jaya Gading',15),('UMP Gambang','Taman Tas',18),
          ('UMP Gambang','McDonald''s Sg. Isap',24),('UMP Gambang','Air Terjun Pandan',27),('UMP Gambang','ECM / KCM',32),
          ('UMP Gambang','Pantai Kempadang',34),('UMP Gambang','IM (IIUM Kuantan)',35),('UMP Gambang','Teluk Cempedak',35),
          ('UMP Gambang','Pantai Sepat',42),('UMP Gambang','Pantai Balok',45),('UMP Gambang','Pekan',60),
          ('CFS IIUM Gambang','Bus Stop UMP',11),('CFS IIUM Gambang','Taman Tas',22),('CFS IIUM Gambang','IIUM Kuantan',37),
          ('CFS IIUM Gambang','ECM / KCM',37),('CFS IIUM Gambang','Teluk Cempedak',39)
        ) as r(from_pt, to_pt, fare) where r.from_pt = o.pickup and r.to_pt = o.destination
      ), '__NO_MATCH__') then true
      when o.book_mode = 'aerbus' and o.fare <> 'TBC' and o.fare <> coalesce((
        select a.fare::text from (values
          ('Pekan','airport',40),('Pekan','tsk',45),('Pekan','pekan_bus',15),
          ('Gambang','airport',18),('Gambang','tsk',28)
        ) as a(campus_label, point_id, fare) where a.campus_label = o.campus and a.point_id = o.aerbus_point
      ), '__NO_MATCH__') then true
      when o.book_mode not in ('quick','custom','map','aerbus') then true
      else false
    end
  );
end;
$$;
