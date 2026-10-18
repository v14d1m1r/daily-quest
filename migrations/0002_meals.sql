CREATE TABLE meals (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    quantity TEXT NOT NULL DEFAULT '' CHECK (char_length(quantity) <= 120),
    notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
    consumed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meals_user_time ON meals(user_id, consumed_at);
