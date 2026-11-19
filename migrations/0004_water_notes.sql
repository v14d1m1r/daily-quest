ALTER TABLE water_entries
ADD COLUMN notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000);
