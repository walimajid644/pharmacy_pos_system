CREATE TABLE user_permissions (
 user_id TEXT NOT NULL REFERENCES users(id), permission TEXT NOT NULL,
 allowed INTEGER NOT NULL CHECK(allowed IN (0,1)), PRIMARY KEY(user_id,permission)
);
CREATE TABLE user_access_revisions (user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER user_access_revision AFTER UPDATE OF role,is_active,deleted_at ON users
BEGIN INSERT INTO user_access_revisions(user_id,revision) VALUES(NEW.id,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1; END;
CREATE TABLE login_events (
 id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, event TEXT NOT NULL CHECK(event IN ('sign_in','failed_sign_in','sign_out','session_expired','window_closed')),
 user_id TEXT, username TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE INDEX login_events_date ON login_events(occurred_at,id);
CREATE INDEX login_events_user ON login_events(user_id,occurred_at);
CREATE TRIGGER login_history_no_update BEFORE UPDATE ON login_events BEGIN SELECT RAISE(ABORT,'Login history is permanent'); END;
CREATE TRIGGER login_history_no_delete BEFORE DELETE ON login_events BEGIN SELECT RAISE(ABORT,'Login history is permanent'); END;
CREATE TRIGGER last_admin_update BEFORE UPDATE OF role,is_active,deleted_at ON users
WHEN OLD.role='admin' AND OLD.is_active=1 AND OLD.deleted_at IS NULL
AND (NEW.role<>'admin' OR NEW.is_active<>1 OR NEW.deleted_at IS NOT NULL)
AND (SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=1 AND deleted_at IS NULL)<=1
BEGIN SELECT RAISE(ABORT,'Keep at least one active administrator'); END;
CREATE TRIGGER last_admin_delete BEFORE DELETE ON users
WHEN OLD.role='admin' AND OLD.is_active=1 AND OLD.deleted_at IS NULL
AND (SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=1 AND deleted_at IS NULL)<=1
BEGIN SELECT RAISE(ABORT,'Keep at least one active administrator'); END;
