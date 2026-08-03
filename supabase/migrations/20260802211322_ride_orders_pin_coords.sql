-- Map-pin bookings (book_mode = 'map') already geocode a real pickup
-- (GPS) and destination (Google Places) point client-side to draw the
-- route, but only the reverse-geocoded address text was ever persisted.
-- That text is ambiguous for turn-by-turn navigation providers (e.g. an
-- address containing "Kajang Municipal Council" can get geocoded to that
-- institution instead of the actual street address). Storing the real
-- coordinates lets the driver-facing navigation buttons target an exact
-- point instead of re-parsing address text through a second geocoder.
alter table ride_orders
  add column if not exists pickup_lat      double precision,
  add column if not exists pickup_lng      double precision,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;
