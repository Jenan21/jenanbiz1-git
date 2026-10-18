CREATE TABLE jenan_map.layer (
  id text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public', 'internal')),
  status text NOT NULL DEFAULT 'unavailable' CHECK (status IN ('unavailable', 'ready', 'warning')),
  "releaseId" uuid REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  source text,
  version text,
  confidence double precision CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  "updatedAt" timestamptz,
  revision integer NOT NULL DEFAULT 0
);

INSERT INTO jenan_map.layer (id, label) VALUES
  ('base', 'الخريطة الأساسية'),
  ('project-location', 'موقع المشروع'),
  ('buildings', 'المباني'),
  ('roads', 'الطرق'),
  ('businesses', 'الأعمال'),
  ('pois', 'المعالم والخدمات'),
  ('competitors', 'المنافسون'),
  ('population', 'السكان'),
  ('real-estate', 'العقارات'),
  ('suppliers', 'الموردون'),
  ('investment-opportunities', 'فرص الاستثمار'),
  ('purchasing-power', 'القوة الشرائية'),
  ('traffic', 'حركة المرور'),
  ('heatmaps', 'الخرائط الحرارية');

CREATE INDEX layer_release_idx ON jenan_map.layer("releaseId");
