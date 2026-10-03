CREATE FUNCTION revoke_sessions_on_user_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM "Session" WHERE "userId" = NEW."id";
  RETURN NEW;
END;
$$;

CREATE TRIGGER revoke_sessions_on_user_status_change
AFTER UPDATE OF "status" ON "User"
FOR EACH ROW
WHEN (OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION revoke_sessions_on_user_status_change();
