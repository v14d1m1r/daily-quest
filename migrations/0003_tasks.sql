CREATE TABLE task_lists (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
 UNIQUE(id,user_id), UNIQUE(user_id,name)
);
CREATE TABLE tasks (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 list_id UUID,
 title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
 notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
 due_date DATE,
 completed BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(list_id,user_id) REFERENCES task_lists(id,user_id)
);
CREATE INDEX tasks_user_due ON tasks(user_id,due_date);
